import React, { useState, useEffect, useRef, useMemo } from 'react';
import TransportBar from './TransportBar';
import StemRow from './StemRow';
import StemBrowser from './StemBrowser';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { useProjectData } from '../../hooks/useProjectData';
import './EditorView.css';

import { ArrowLeftIcon } from '../common/Icons';

const EditorView = ({ track, onBack, onProjectRefresh }) => {
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
        waveformPeaks,
        addToPlayer,
        removeFromPlayer,
    } = useProjectData(track);

    // --- UI State (Mixer settings) ---
    // This state belongs here as it's the "Edit" session state
    const [stemState, setStemState] = useState({});

    const resolvedStemState = useMemo(() => {
        const next = {};
        const allFiles = track.original ? [...track.stems, track.original] : track.stems;
        allFiles.forEach(stem => {
            next[stem] = stemState[stem] || { vol: 0.5, muted: false, solo: false, selected: false, locked: false };
        });
        return next;
    }, [stemState, track]);

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
        const anySolo = activeStemIds.some(id => resolvedStemState[id]?.solo);

        activeStemIds.forEach(stem => {
            const state = resolvedStemState[stem] || { vol: 0.5, muted: false };
            let effective = state.vol;

            if (state.muted) effective = 0;
            if (anySolo && !state.solo) effective = 0;

            vols[stem] = effective * mainVolume;
        });
        return vols;
    }, [resolvedStemState, activeStemIds, mainVolume]);

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
    const audioContext = useMemo(() => new (window.AudioContext || window.webkitAudioContext)(), []);
    useEffect(() => {
        return () => {
            if (audioContext.state !== 'closed') {
                audioContext.close();
            }
        };
    }, [audioContext]);

    // Stems to render from the canonical project snapshot.
    const stemsToRender = track.original
        ? [...track.stems, track.original]
        : track.stems;

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
                    allStems={track.stems}
                    activeStemIds={activeStemIds}
                    trackId={track.id}
                    trackName={track.name}
                    originalFile={track.original}
                    executedModules={track.executed_modules || []}
                    availableModules={track.available_modules || []}
                    onAddToPlayer={addToPlayer}
                    onRemoveFromPlayer={removeFromPlayer}
                    onDownloadStem={handleDownloadStem}
                    onProjectRefresh={onProjectRefresh}
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
                                    sState={resolvedStemState[stem] || { vol: 0.5, muted: false, solo: false, locked: false }}
                                    audioUrl={audioUrls[stem]}
                                    waveformPeaks={waveformPeaks[stem]}
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
