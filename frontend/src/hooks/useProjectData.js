import { useState, useEffect, useCallback, useRef } from 'react';
import { getProjectStatus, downloadStem } from '../services/api';

export const useProjectData = (track) => {
    const [activeStemIds, setActiveStemIds] = useState([]);
    const [audioUrls, setAudioUrls] = useState({});
    const [loadingStems, setLoadingStems] = useState({});

    // Ref to always hold the latest blob URLs for proper cleanup
    const audioUrlsRef = useRef({});

    // Keep the ref in sync with state
    useEffect(() => {
        audioUrlsRef.current = audioUrls;
    }, [audioUrls]);

    // Initial Load
    useEffect(() => {
        // Revoke previous blob URLs before resetting
        Object.values(audioUrlsRef.current).forEach(u => URL.revokeObjectURL(u));

        setActiveStemIds([]);
        setAudioUrls({});

        if (!track) return;

        const loadAll = async () => {
            const allFiles = [...track.stems];
            if (track.original) allFiles.push(track.original);

            for (const s of allFiles) {
                setLoadingStems(prev => ({ ...prev, [s]: true }));
                try {
                    const blob = await downloadStem(track.id, s);
                    setAudioUrls(prev => ({ ...prev, [s]: URL.createObjectURL(blob) }));
                } catch (e) {
                    console.error("Error loading stem", s, e);
                } finally {
                    setLoadingStems(prev => ({ ...prev, [s]: false }));
                }
            }
        };
        loadAll();

        // Cleanup on unmount or before next track load
        return () => {
            Object.values(audioUrlsRef.current).forEach(u => URL.revokeObjectURL(u));
        };
    }, [track?.id]);

    const addToPlayer = useCallback((stem) => {
        setActiveStemIds(prev => prev.includes(stem) ? prev : [...prev, stem]);
    }, []);

    const removeFromPlayer = useCallback((stem) => {
        setActiveStemIds(prev => prev.filter(id => id !== stem));
    }, []);

    const loadNewStems = useCallback(async (newStemsList) => {
        // Use ref to check already-loaded stems (avoids stale closure)
        const unique = newStemsList.filter(s => !audioUrlsRef.current[s]);

        for (const s of unique) {
            setLoadingStems(prev => ({ ...prev, [s]: true }));
            try {
                const blob = await downloadStem(track.id, s);
                setAudioUrls(prev => ({ ...prev, [s]: URL.createObjectURL(blob) }));
            } catch (e) {
                console.error("Error loading new stem", s, e);
            } finally {
                setLoadingStems(prev => ({ ...prev, [s]: false }));
            }
        }
    }, [track?.id]);

    return {
        activeStemIds,
        audioUrls,
        loadingStems,
        addToPlayer,
        removeFromPlayer,
        loadNewStems
    };
};
