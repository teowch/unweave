import React, { useState, useEffect, useRef } from 'react';
import { downloadStem } from '../../services/api';
import TransportBar from './TransportBar';
import StemRow from './StemRow';
import StemBrowser from './StemBrowser';
import './EditorView.css';

const EditorView = ({ track, onBack, onUnify }) => {
    // --- State ---
    const [activeStemIds, setActiveStemIds] = useState([]); // List of stems in Player (Visible)
    const [stemState, setStemState] = useState({}); // Vol, Mute, Solo for each stem
    const [audioUrls, setAudioUrls] = useState({});
    const [loadingStems, setLoadingStems] = useState({});

    // Playback State
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [mainVolume, setMainVolume] = useState(0.5);
    const [audioContext, setAudioContext] = useState(null);

    const wsRefs = useRef({}); // Map: stemId -> WaveSurfer instance
    const sliderRef = useRef(false);
    const stemsListRef = useRef(null);
    const isScrubbingRef = useRef(false);

    // Refs for stable access in callbacks (avoid stale closures)
    const isPlayingRef = useRef(isPlaying);
    const activeStemIdsRef = useRef(activeStemIds);
    const currentTimeRef = useRef(currentTime);

    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { activeStemIdsRef.current = activeStemIds; }, [activeStemIds]);
    useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

    // --- Init ---
    useEffect(() => {
        // Init AudioContext
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        setAudioContext(ctx);

        // Init Stem State & Audio URLs
        setActiveStemIds([]);
        // setLoadedStemIds([]);
        setAudioUrls({});
        const initial = {};

        // Include all stems
        track.stems.forEach(s => {
            initial[s] = { vol: 0.5, muted: false, solo: false, selected: false, locked: false };
        });

        // Include original file if present
        if (track.original) {
            initial[track.original] = { vol: 0.5, muted: false, solo: false, selected: false, locked: false };
        }

        setStemState(initial);

        // Build full list of audio files to load (stems + original)
        const allAudioFiles = [...track.stems];
        if (track.original) {
            allAudioFiles.push(track.original);
        }

        // Fetch Audio Blobs
        const loadAll = async () => {
            const promises = allAudioFiles.map(async s => {
                setLoadingStems(prev => ({ ...prev, [s]: true }));
                try {
                    const blob = await downloadStem(track.id, s);
                    // Fix: Ensure we don't try to update state if component unmounted or track changed
                    setAudioUrls(prev => ({ ...prev, [s]: URL.createObjectURL(blob) }));
                } catch (e) {
                    console.error('Error loading stem:', s, e);
                } finally {
                    setLoadingStems(prev => ({ ...prev, [s]: false }));
                }
            });
            await Promise.all(promises);
        };
        loadAll();

        return () => {
            Object.values(audioUrls).forEach(u => URL.revokeObjectURL(u));
            if (ctx && ctx.state !== 'closed') {
                ctx.close();
            }
        };
    }, [track]);

    // --- Playback Sync ---
    useEffect(() => {
        Object.keys(wsRefs.current).forEach(stemId => {
            const ws = wsRefs.current[stemId];
            if (!ws) return;

            // Sync time before playing to ensure tight alignment
            if (isPlaying) {
                ws.setTime(currentTimeRef.current);
                ws.play();
            } else {
                ws.pause();
                // Ensure pause time is synced too
                ws.setTime(currentTimeRef.current);
            }
        });
    }, [isPlaying]); // Removed activeStemIds dependency for playback sync

    // --- Mixer Logic ---
    useEffect(() => {
        const anySolo = Object.values(stemState).some(s => s.solo && activeStemIds.includes(Object.keys(stemState).find(k => stemState[k] === s)));

        // We only care about active stems
        // Helper to check if a stem is "active"
        const isActive = (id) => activeStemIds.includes(id);

        Object.keys(wsRefs.current).forEach(stem => {
            const ws = wsRefs.current[stem];
            if (!ws) return;
            const state = stemState[stem];

            // If not active (hidden), volume is 0
            if (!isActive(stem)) {
                ws.setVolume(0);
                return;
            }

            let effectiveVol = state?.vol ?? 0.5;
            if (state?.muted) effectiveVol = 0;
            if (anySolo && !state?.solo) effectiveVol = 0;

            ws.setVolume(effectiveVol * mainVolume);
        });
    }, [stemState, activeStemIds, mainVolume]);

    // --- Handlers ---
    const addToPlayer = (stem) => {
        if (!activeStemIds.includes(stem)) {
            setActiveStemIds(prev => [...prev, stem]);
        }
    };

    const removeFromPlayer = (stem) => {
        setActiveStemIds(prev => prev.filter(id => id !== stem));
    };

    const updateStem = (stem, key, val) => {
        // specific check for 'seek' (special key from StemRow click)
        if (key === 'seek') {
            seek(val);
            return;
        }

        setStemState(prev => ({
            ...prev,
            [stem]: { ...prev[stem], [key]: val }
        }));
    };

    const seek = (time) => {
        setCurrentTime(time);
        Object.values(wsRefs.current).forEach(ws => {
            if (ws) ws.setTime(time);
        });
    };

    const togglePlay = () => setIsPlaying(!isPlaying);

    const handleDownloadStem = (stem) => {
        // Trigger download of the stem file
        const url = audioUrls[stem];
        if (url) {
            const a = document.createElement('a');
            a.href = url;
            a.download = stem;
            a.click();
        }
    };

    // Handle new stems from module processing without disrupting playback
    const handleNewStemsAvailable = async (newStemsList) => {
        // Find stems that are truly new (not already in track.stems)
        const existingStems = new Set(track.stems);
        const addedStems = newStemsList.filter(s => !existingStems.has(s));

        if (addedStems.length === 0) return;

        console.log('New stems available:', addedStems);

        // Initialize state for new stems
        setStemState(prev => {
            const updated = { ...prev };
            addedStems.forEach(s => {
                if (!updated[s]) {
                    updated[s] = { vol: 0.5, muted: false, solo: false, selected: false, locked: false };
                }
            });
            return updated;
        });

        // Load audio for new stems (without affecting existing ones)
        for (const stem of addedStems) {
            setLoadingStems(prev => ({ ...prev, [stem]: true }));
            try {
                const { downloadStem } = await import('../../services/api');
                const blob = await downloadStem(track.id, stem);
                setAudioUrls(prev => ({ ...prev, [stem]: URL.createObjectURL(blob) }));
            } catch (e) {
                console.error('Error loading new stem:', stem, e);
            } finally {
                setLoadingStems(prev => ({ ...prev, [stem]: false }));
            }
        }

        // Update track.stems in place (reference update for re-render)
        // This is a bit hacky but avoids full track reload
        addedStems.forEach(s => {
            if (!track.stems.includes(s)) {
                track.stems.push(s);
            }
        });
    };

    // Sync Timeline Helper
    // We need one master timer or just read from one representative WS instance?
    // Wavesurfer has 'audioprocess' event.
    // Let's attach a listener to the FIRST active stem's WS to drive the UI timer.
    useEffect(() => {
        const firstActive = activeStemIds[0];
        if (!firstActive) return;

        const checkTime = setInterval(() => {
            const ws = wsRefs.current[firstActive];
            if (ws) {
                // Always sync duration if available (needed for needle position even when paused)
                const d = ws.getDuration();
                if (d > 0 && Math.abs(duration - d) > 0.1) {
                    setDuration(d);
                }

                if (isPlaying && !sliderRef.current) {
                    const t = ws.getCurrentTime();
                    setCurrentTime(t);
                }
            }
        }, 100); // 100ms polling for UI update

        return () => clearInterval(checkTime);
    }, [isPlaying, activeStemIds, duration]);

    // All audio items for rendering (stems + original)
    const allAudioItems = track.original
        ? [...track.stems, track.original]
        : track.stems;

    const handleStageInteraction = (e) => {
        // Skip if clicking interactive elements (buttons/inputs)
        // We explicitly ALLOW .waveform-wrapper now to override WS interaction with global interaction
        if (e.target.closest('button') || e.target.closest('input')) return;

        const rect = stemsListRef.current.getBoundingClientRect();
        const sidebarWidth = 220; // 220px fixed controls width
        const x = e.clientX - rect.left;

        if (x < sidebarWidth) return; // Clicked in sidebar area

        const width = rect.width - sidebarWidth;
        if (width <= 0) return;

        const scrub = (clientX) => {
            const offsetX = clientX - rect.left - sidebarWidth;
            const ratio = Math.max(0, Math.min(1, offsetX / width));
            seek(ratio * duration);
        };

        scrub(e.clientX);
        // Enable dragging
        isScrubbingRef.current = true; // reusing existing ref logic pattern if needed, or just let seek handle it

        const onPointerMove = (moveE) => {
            scrub(moveE.clientX);
        };

        const onPointerUp = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    };

    return (
        <div className="editor-view split-layout fade-in">
            {/* Header */}
            <header className="editor-header">
                <div className="left">
                    <button onClick={onBack} className="btn btn-ghost">← Back</button>
                    <h2>{track.name}</h2>
                </div>
                <div className="right">
                    <button className="btn btn-secondary">Export Mix</button>
                </div>
            </header>

            <div className="editor-body">
                {/* Left: Stem Browser */}
                <StemBrowser
                    allStems={track.stems}
                    activeStemIds={activeStemIds}
                    trackId={track.id}
                    originalFile={track.original}
                    onAddToPlayer={addToPlayer}
                    onRemoveFromPlayer={removeFromPlayer}
                    onDownloadStem={handleDownloadStem}
                    onNewStemsAvailable={handleNewStemsAvailable}
                />

                {/* Right: Mix Column (Transport + Player) */}
                <div className="mix-column">
                    {/* Player Stage */}
                    <div className="player-stage">
                        <h3 className="stage-title">Player Stage</h3>

                        <TransportBar
                            isPlaying={isPlaying}
                            togglePlay={togglePlay}
                            currentTime={currentTime}
                            duration={duration}
                            mainVolume={mainVolume}
                            setMainVolume={setMainVolume}
                            seek={seek}
                            onSliderInteraction={(active) => sliderRef.current = active}
                        />

                        {activeStemIds.length === 0 && (
                            <div className="empty-stage-hint">
                                Add stems from the browser to start playing
                            </div>
                        )}

                        <div className="stems-list" ref={stemsListRef} onPointerDown={handleStageInteraction}>
                            {allAudioItems.map(stem => (
                                <StemRow
                                    key={stem}
                                    stem={stem}
                                    visible={activeStemIds.includes(stem)}
                                    // Guard against initial undefined state before effect runs
                                    sState={stemState[stem] || { vol: 0.5, muted: false, solo: false, selected: false, locked: false }}
                                    audioUrl={audioUrls[stem]}
                                    onUpdate={(key, val) => updateStem(stem, key, val)}
                                    onRemove={removeFromPlayer}
                                    onDownload={handleDownloadStem}
                                    registerWaveSurfer={(id, ws) => {
                                        wsRefs.current[id] = ws;
                                        // On load, if not active, mute it. Sync time.
                                        if (ws) {
                                            // Ensure it doesn't blast audio if not in active list
                                            if (!activeStemIdsRef.current.includes(stem)) {
                                                ws.setVolume(0);
                                            }

                                            // Sync to current global time immediately
                                            ws.setTime(currentTimeRef.current);

                                            // If global player is running, valid stems should start independently
                                            if (isPlayingRef.current) {
                                                ws.play();
                                            }
                                        }
                                    }}
                                    isPlaying={isPlaying}
                                    currentTime={currentTime}
                                    audioContext={audioContext}
                                />
                            ))}
                            {activeStemIds.length > 0 && (
                                <div className="needle-wrapper">
                                    <div
                                        className="global-needle"
                                        style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EditorView;
