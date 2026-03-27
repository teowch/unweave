import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { downloadStem, getWaveform, isElectron, getStemAudioUrl } from '../services/api';

const isConsistencyError = (error) => {
    const status = error?.response?.status;
    const payload = error?.response?.data || {};
    return status === 409
        || status === 423
        || payload.consistency_checking === true
        || payload.status === 'consistency_checking';
};

/**
 * useProjectData — manages stem state for the Editor.
 *
 * Memory strategy:
 *   1. On load: fetch lightweight waveform peaks (~15 KB each) for ALL stems.
 *      These render waveforms instantly without full audio decode.
 *   2. Audio blobs are ALSO loaded eagerly in background for playback readiness.
 *   3. Peaks render immediately; audio arrives shortly after for playback.
 */
export const useProjectData = (track, options = {}) => {
    const { onConsistencyIssue } = options;
    const [activeStemIds, setActiveStemIds] = useState([]);
    const [audioUrls, setAudioUrls] = useState({});
    const [waveformPeaks, setWaveformPeaks] = useState({});   // stem -> peaks data
    const [loadingStems, setLoadingStems] = useState({});
    const trackFiles = useMemo(
        () => (track ? [...(track.stems || []), ...(track.original ? [track.original] : [])] : []),
        [track],
    );
    const trackSignature = trackFiles.join('|');

    // Ref to always hold the latest blob URLs for proper cleanup
    const audioUrlsRef = useRef({});
    const consistencyReportedRef = useRef(false);

    // Keep the ref in sync with state
    useEffect(() => {
        audioUrlsRef.current = audioUrls;
    }, [audioUrls]);

    // ── Initial Load ──
    // Fetch peaks first (instant waveform rendering), then audio blobs (for playback)
    useEffect(() => {
        // Revoke previous blob URLs before resetting
        Object.values(audioUrlsRef.current).forEach(u => URL.revokeObjectURL(u));

        setActiveStemIds(prev => prev.filter(stem => trackFiles.includes(stem)));
        setAudioUrls({});
        setWaveformPeaks({});
        consistencyReportedRef.current = false;

        if (!track) return;

        const allFiles = [...trackFiles];

        // 1. Fetch waveform peaks in parallel (fast, ~15 KB each)
        const loadPeaks = async () => {
            const results = await Promise.allSettled(
                allFiles.map(async (s) => {
                    try {
                        const data = await getWaveform(track.id, s);
                        return { stem: s, data };
                    } catch (e) {
                        if (isConsistencyError(e) && !consistencyReportedRef.current) {
                            consistencyReportedRef.current = true;
                            onConsistencyIssue?.(
                                e.response?.data?.message
                                || 'We found an inconsistency while loading this project. Consistency is being verified and this page will reload when ready.'
                            );
                        }
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
                        if (isConsistencyError(e) && !consistencyReportedRef.current) {
                            consistencyReportedRef.current = true;
                            onConsistencyIssue?.(
                                e.response?.data?.message
                                || 'We found an inconsistency while loading this project. Consistency is being verified and this page will reload when ready.'
                            );
                            break;
                        }
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
    }, [track, trackFiles, trackSignature, onConsistencyIssue]);

    const addToPlayer = useCallback((stem) => {
        setActiveStemIds(prev => prev.includes(stem) ? prev : [...prev, stem]);
    }, []);

    const removeFromPlayer = useCallback((stem) => {
        setActiveStemIds(prev => prev.filter(id => id !== stem));
    }, []);

    return {
        activeStemIds,
        audioUrls,
        waveformPeaks,
        loadingStems,
        addToPlayer,
        removeFromPlayer,
    };
};
