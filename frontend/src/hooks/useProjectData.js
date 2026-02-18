import { useState, useEffect, useCallback, useRef } from 'react';
import { getProjectStatus, downloadStem, getWaveform, isElectron, getStemAudioUrl } from '../services/api';

/**
 * useProjectData — manages stem state for the Editor.
 *
 * Memory strategy:
 *   1. On load: fetch lightweight waveform peaks (~15 KB each) for ALL stems.
 *      These render waveforms instantly without full audio decode.
 *   2. Audio blobs are ALSO loaded eagerly in background for playback readiness.
 *   3. Peaks render immediately; audio arrives shortly after for playback.
 */
export const useProjectData = (track) => {
    const [activeStemIds, setActiveStemIds] = useState([]);
    const [audioUrls, setAudioUrls] = useState({});
    const [waveformPeaks, setWaveformPeaks] = useState({});   // stem -> peaks data
    const [loadingStems, setLoadingStems] = useState({});

    // Ref to always hold the latest blob URLs for proper cleanup
    const audioUrlsRef = useRef({});

    // Keep the ref in sync with state
    useEffect(() => {
        audioUrlsRef.current = audioUrls;
    }, [audioUrls]);

    // ── Initial Load ──
    // Fetch peaks first (instant waveform rendering), then audio blobs (for playback)
    useEffect(() => {
        // Revoke previous blob URLs before resetting
        Object.values(audioUrlsRef.current).forEach(u => URL.revokeObjectURL(u));

        setActiveStemIds([]);
        setAudioUrls({});
        setWaveformPeaks({});

        if (!track) return;

        const allFiles = [...track.stems];
        if (track.original) allFiles.push(track.original);

        // 1. Fetch waveform peaks in parallel (fast, ~15 KB each)
        const loadPeaks = async () => {
            const results = await Promise.allSettled(
                allFiles.map(async (s) => {
                    try {
                        const data = await getWaveform(track.id, s);
                        return { stem: s, data };
                    } catch (e) {
                        console.warn(`Waveform not available for ${s}:`, e.message);
                        return { stem: s, data: null };
                    }
                })
            );

            const peaks = {};
            results.forEach((result) => {
                if (result.status === 'fulfilled' && result.value.data) {
                    peaks[result.value.stem] = result.value.data;
                }
            });
            setWaveformPeaks(peaks);
        };

        // 2. Load audio for playback
        const loadAudio = async () => {
            if (isElectron) {
                // Electron: use unweave:// protocol URLs (stream from disk, no blobs)
                const urls = {};
                allFiles.forEach(s => {
                    urls[s] = getStemAudioUrl(track.id, s);
                });
                setAudioUrls(urls);
            } else {
                // Web mode: download blobs sequentially
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
            }
        };

        // Peaks first (instant waveform), then audio (for playback)
        loadPeaks();
        loadAudio();

        // Cleanup on unmount or before next track load
        return () => {
            // Only revoke blob URLs (not unweave:// protocol URLs)
            if (!isElectron) {
                Object.values(audioUrlsRef.current).forEach(u => URL.revokeObjectURL(u));
            }
        };
    }, [track?.id]);

    const addToPlayer = useCallback((stem) => {
        setActiveStemIds(prev => prev.includes(stem) ? prev : [...prev, stem]);
    }, []);

    const removeFromPlayer = useCallback((stem) => {
        setActiveStemIds(prev => prev.filter(id => id !== stem));
    }, []);

    const loadNewStems = useCallback(async (newStemsList) => {
        // Load both peaks and audio for new stems
        const unique = newStemsList.filter(s => !audioUrlsRef.current[s]);

        // Peaks (parallel, fast)
        const newPeaks = {};
        await Promise.allSettled(
            unique.map(async (s) => {
                try {
                    const data = await getWaveform(track.id, s);
                    if (data) newPeaks[s] = data;
                } catch (e) {
                    console.warn(`Waveform not available for new stem ${s}:`, e.message);
                }
            })
        );
        if (Object.keys(newPeaks).length > 0) {
            setWaveformPeaks(prev => ({ ...prev, ...newPeaks }));
        }

        // Audio
        if (isElectron) {
            const urls = {};
            unique.forEach(s => { urls[s] = getStemAudioUrl(track.id, s); });
            setAudioUrls(prev => ({ ...prev, ...urls }));
        } else {
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
        }
    }, [track?.id]);

    return {
        activeStemIds,
        audioUrls,
        waveformPeaks,
        loadingStems,
        addToPlayer,
        removeFromPlayer,
        loadNewStems,
    };
};
