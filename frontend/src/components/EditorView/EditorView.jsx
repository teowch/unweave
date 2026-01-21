import React, { useState, useEffect, useRef, useMemo } from 'react';
import TransportBar from './TransportBar';
import StemRow from './StemRow';
import StemBrowser from './StemBrowser';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useProjectData } from '../../hooks/useProjectData';
import './EditorView.css';

import { ArrowLeftIcon } from '../common/Icons';

const EditorView = ({ track, onBack }) => {
    // --- Custom Hooks ---
    const {
        isPlaying,
        currentTime,
        duration,
        mainVolume,
        togglePlay,
        seek,
        setMainVolume,
        registerWaveSurfer,
        sliderRef
    } = useAudioPlayer();

    const {
        activeStemIds,
        audioUrls,
        loadingStems,
        addToPlayer,
        removeFromPlayer,
        loadNewStems
    } = useProjectData(track);

    // --- UI State (Mixer settings) ---
    // This state belongs here as it's the "Edit" session state
    const [stemState, setStemState] = useState({});

    // Local stems list - tracks all stems including newly generated ones
    // This is needed because track.stems prop doesn't update when modules generate new stems
    const [allStems, setAllStems] = useState([]);

    // Initialize Stem State and allStems on load
    useEffect(() => {
        if (!track?.stems) return;

        // Initialize allStems from track.stems
        setAllStems(track.stems);

        const initial = {};
        const allFiles = track.original ? [...track.stems, track.original] : track.stems;

        allFiles.forEach(s => {
            initial[s] = { vol: 0.5, muted: false, solo: false, selected: false, locked: false };
        });
        setStemState(initial);
    }, [track]);

    // Handle Mixer updates
    const updateStem = (stem, key, val) => {
        if (key === 'seek') {
            seek(val);
            return;
        }
        setStemState(prev => ({
            ...prev,
            [stem]: { ...prev[stem], [key]: val }
        }));
    };

    // Calculate Effective Volumes
    const effectiveVolumes = useMemo(() => {
        const vols = {};
        const anySolo = Object.values(stemState).some(s => s.solo && activeStemIds.includes(Object.keys(stemState).find(k => stemState[k] === s)));

        activeStemIds.forEach(stem => {
            const state = stemState[stem] || { vol: 0.5, muted: false };
            let effective = state.vol;

            if (state.muted) effective = 0;
            if (anySolo && !state.solo) effective = 0;

            vols[stem] = effective * mainVolume;
        });
        return vols;
    }, [stemState, activeStemIds, mainVolume]);

    // Handle new stems from Browser
    const handleNewStemsAvailable = async (newStemsList) => {
        await loadNewStems(newStemsList);

        // Update allStems with newly generated stems
        setAllStems(prev => {
            const newStems = newStemsList.filter(s => !prev.includes(s));
            return newStems.length > 0 ? [...prev, ...newStems] : prev;
        });

        // Init state for new stems
        setStemState(prev => {
            const updated = { ...prev };
            newStemsList.forEach(s => {
                if (!updated[s]) {
                    updated[s] = { vol: 0.5, muted: false, solo: false, selected: false, locked: false };
                }
            });
            return updated;
        });
    };

    const handleDownloadStem = (stem) => {
        const url = audioUrls[stem];
        if (url) {
            const a = document.createElement('a');
            a.href = url;
            a.download = stem;
            a.click();
        }
    };

    // Audio Context is managed by WaveSurfer internally usually, but shared context helps.
    // Original had `new AudioContext()` in Effect.
    // We can lazily create one or let WaveSurfer handle it.
    // However, for visualization consistency, passing a shared context is good.
    const [audioContext, setAudioContext] = useState(null);
    useEffect(() => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        setAudioContext(ctx);
        return () => { if (ctx.state !== 'closed') ctx.close(); }
    }, []);

    // Stems to render (uses allStems which includes newly generated stems)
    const stemsToRender = track.original
        ? [...allStems, track.original]
        : allStems;

    const onSliderInteraction = (active) => sliderRef.current = active;
    const onInteractionStart = onSliderInteraction;
    const onInteractionEnd = onSliderInteraction;

    const rulerRef = useRef(null);
    const handleRulerReady = (ruler) => {
        rulerRef.current = ruler;
    };

    const handleMouseDown = (e) => {
        if (onInteractionStart) onInteractionStart(true);
        const update = (clientX) => {
            const rect = rulerRef.current?.getBoundaries();
            const x = clientX - rect.left;
            const ratio = Math.max(0, Math.min(1, x / rect.width));
            seek(ratio * duration);
        };
        update(e.clientX);

        const onMove = (moveE) => update(moveE.clientX);
        const onUp = () => {
            if (onInteractionEnd) onInteractionEnd(false);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    return (
        <div className="editor-view split-layout fade-in">
            <header className="editor-header">
                <div className="left">
                    <button onClick={onBack} className="btn btn-ghost">
                        <ArrowLeftIcon size={18} style={{ marginRight: '8px' }} />
                        Back
                    </button>
                    <h2>{track.name}</h2>
                </div>
                <div className="right">
                    <button className="btn btn-secondary">Export Mix</button>
                </div>
            </header>

            <div className="editor-body">
                <StemBrowser
                    allStems={allStems}
                    activeStemIds={activeStemIds}
                    trackId={track.id}
                    trackName={track.name}
                    originalFile={track.original}
                    onAddToPlayer={addToPlayer}
                    onRemoveFromPlayer={removeFromPlayer}
                    onDownloadStem={handleDownloadStem}
                    onNewStemsAvailable={handleNewStemsAvailable}
                    thumbnail={track.thumbnail}
                />

                <div className="mix-column">
                    <div className="player-stage">
                        <h3 className="stage-title">Player Stage</h3>

                        <TransportBar
                            isPlaying={isPlaying}
                            togglePlay={togglePlay}
                            currentTime={currentTime}
                            duration={duration}
                            mainVolume={mainVolume}
                            setMainVolume={setMainVolume}
                            handleMouseDown={handleMouseDown}
                            onRulerReady={handleRulerReady}
                        />

                        {activeStemIds.length === 0 && (
                            <div className="empty-stage-hint">
                                Add stems from the browser to start playing
                            </div>
                        )}

                        <div className="stems-list">
                            {stemsToRender.map(stem => (
                                <StemRow
                                    key={stem}
                                    stem={stem}
                                    displayName={stem === track.original ? track.name : null}
                                    visible={activeStemIds.includes(stem)}
                                    sState={stemState[stem] || { vol: 0.5, muted: false, solo: false, locked: false }}
                                    audioUrl={audioUrls[stem]}
                                    onUpdate={(key, val) => updateStem(stem, key, val)}
                                    onRemove={removeFromPlayer}
                                    onDownload={handleDownloadStem}
                                    registerWaveSurfer={registerWaveSurfer}
                                    isPlaying={isPlaying}
                                    currentTime={currentTime}
                                    audioContext={audioContext}
                                    effectiveVolume={effectiveVolumes[stem] ?? 0}
                                    handleMouseDown={handleMouseDown}
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
