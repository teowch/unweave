import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import './EditorView.css';
import { useContextMenu } from '../ContextMenu/ContextMenuProvider';
import getStemIcon from '../utils/getStemIcon';

import { MuteIcon, VolumeIcon, SoloIcon, DownloadIcon, LockIcon, UnlockIcon, MoreHorizontalIcon as MoreIcon, XIcon } from '../common/Icons';

// Custom Slider Component (Horizontal/Vertical)
const Slider = ({ value, min, max, onChange, orientation = 'horizontal', label, disabled }) => {
    const barRef = useRef(null);

    const handleInteraction = (clientPos) => {
        if (disabled || !barRef.current) return;
        const rect = barRef.current.getBoundingClientRect();

        let percentage = 0;

        if (orientation === 'vertical') {
            const height = rect.height;
            // Vertical: Bottom is 0, Top is 1
            // clientY increases downwards.
            // distance from bottom = rect.bottom - clientPos.y
            const relativeY = Math.max(0, Math.min(height, rect.bottom - clientPos.y));
            percentage = relativeY / height;
        } else {
            const width = rect.width;
            // Horizontal: Left is 0, Right is 1
            const relativeX = Math.max(0, Math.min(width, clientPos.x - rect.left));
            percentage = relativeX / width;
        }

        // Map to min-max range
        const newValue = min + percentage * (max - min);
        onChange(newValue);
    };

    const handleMouseDown = (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent drag from propagating to parent (like reordering)

        const getPos = (ev) => orientation === 'vertical' ? { x: ev.clientX, y: ev.clientY } : { x: ev.clientX, y: ev.clientY };

        handleInteraction(getPos(e));

        const onMouseMove = (moveEvent) => {
            handleInteraction(getPos(moveEvent));
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    // Calculate Styles
    const range = max - min;
    const normalized = (value - min) / range; // 0 to 1

    const style = {};
    if (orientation === 'vertical') {
        style.height = `${normalized * 100}%`;
        style.bottom = '0%';
        style.width = '100%';
    } else {
        style.width = `${normalized * 100}%`;
        style.left = '0%';
        style.height = '100%';
    }

    return (
        <div
            className={`slider-wrapper ${orientation} ${disabled ? 'disabled' : ''}`}
            title={`${label}: ${Math.round(value * 100)}%`}
        >
            <div
                className="slider-track"
                ref={barRef}
                onMouseDown={handleMouseDown}
            >
                <div className="slider-track-bg" />
                <div
                    className="slider-fill"
                    style={style}
                />
            </div>
        </div>
    );
};

const StemRow = ({
    stem,
    displayName,
    sState = { vol: 0.5, muted: false, solo: false, locked: false },
    audioUrl,
    waveformPeaks,
    onUpdate,
    onRemove,
    onDownload,
    registerWaveSurfer,
    visible = true,
    isPlaying,
    currentTime,
    audioContext,
    effectiveVolume,
    handleMouseDown,
}) => {
    // Use displayName if provided, otherwise use stem (filename)
    const nameToShow = displayName || stem;
    const containerRef = useRef(null);
    const wsRef = useRef(null);
    const [isReady, setIsReady] = useState(false);
    const stemNameRef = useRef(null);
    const [shouldScroll, setShouldScroll] = useState(false);

    const isUnified = stem.includes('.unified');

    // Extract file format
    const getFileFormat = (filename) => {
        const match = filename.match(/\.(wav|mp3|flac)$/i);
        return match ? match[1].toUpperCase() : '';
    };
    const format = getFileFormat(stem);

    // Detect if text overflows container
    useEffect(() => {
        if (!stemNameRef.current || !visible) return;

        const checkOverflow = () => {
            const container = stemNameRef.current;
            if (!container) return;

            const scrollContent = container.querySelector('.stem-name-scroll');
            if (!scrollContent) return;

            // Measure content width
            const containerWidth = container.offsetWidth;
            const contentWidth = scrollContent.scrollWidth;

            // Skip if layout hasn't been calculated yet
            if (containerWidth === 0) {
                return;
            }

            const needsScroll = contentWidth > containerWidth + 5; // Add 5px threshold

            setShouldScroll(needsScroll);

            // Calculate animation duration for consistent speed
            // Speed: 30 pixels per second
            if (needsScroll && scrollContent) {
                const pixelsPerSecond = 30;
                // The distance to scroll is exactly half the content width
                // This makes the duplicate appear seamlessly as the original disappears
                const distance = contentWidth / 2;
                const duration = distance / pixelsPerSecond;
                scrollContent.style.animationDuration = `${duration}s`;
            }
        };

        // Check multiple times with increasing delays to catch when layout is ready
        // More attempts for dynamically added stems
        const timeout1 = setTimeout(checkOverflow, 50);
        const timeout2 = setTimeout(checkOverflow, 150);
        const timeout3 = setTimeout(checkOverflow, 300);
        const timeout4 = setTimeout(checkOverflow, 600);
        const timeout5 = setTimeout(checkOverflow, 1000);

        return () => {
            clearTimeout(timeout1);
            clearTimeout(timeout2);
            clearTimeout(timeout3);
            clearTimeout(timeout4);
            clearTimeout(timeout5);
        };
    }, [stem, isReady, visible]); // Check when stem, waveform ready state, or visibility changes

    // ── WaveSurfer initialization ──
    // Renders waveform from precomputed peaks (instant, ~15 KB) if available.
    // Audio blob is loaded separately only when needed for playback.
    useEffect(() => {
        if (!containerRef.current || !audioContext) return;
        // Need either peaks or audio to render anything
        if (!waveformPeaks && !audioUrl) return;

        const abortController = new AbortController();
        let ws = null;

        const initWaveSurfer = async () => {
            try {
                if (abortController.signal.aborted) return;

                ws = WaveSurfer.create({
                    container: containerRef.current,
                    waveColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
                    progressColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() + '5e',
                    barWidth: 1,
                    barGap: 1,
                    barRadius: 2,
                    barHeight: 0.75,
                    responsive: true,
                    height: 'auto',
                    normalize: true,
                    cursorWidth: 0,
                    cursorColor: 'transparent',
                    audioContext: audioContext,
                    // Only use precomputed peaks when audio isn't available yet.
                    // When audioUrl IS available, let WaveSurfer load audio normally
                    // so the 'ready' event fires and playback registration works.
                    ...(!audioUrl && waveformPeaks ? {
                        peaks: waveformPeaks.peaks,
                        duration: waveformPeaks.duration,
                    } : {}),
                });

                wsRef.current = ws;

                // Set up event listeners BEFORE loading
                ws.on('ready', () => {
                    if (abortController.signal.aborted) return;

                    setIsReady(true);
                    ws.setVolume(sState?.muted ? 0 : (sState?.vol ?? 0.5));
                    registerWaveSurfer(stem, ws);
                });

                ws.on('error', (err) => {
                    if (err.name === 'AbortError')
                        return;
                    console.error('WaveSurfer error:', stem, err);
                });

                if (waveformPeaks && !audioUrl) {
                    // Peaks-only mode: render waveform from precomputed data.
                    // No audio is loaded — this is instant and memory-friendly.
                    // Don't register with parent (no audio to play/seek).
                    setIsReady(true);
                } else if (audioUrl) {
                    // Full mode: load audio for playback (waveform from peaks or audio decode)
                    await ws.load(audioUrl).catch((e) => {
                        if (e.name !== 'AbortError') console.error('WaveSurfer load error:', stem, e);
                    });
                }

                // Check if we were aborted during loading
                if (abortController.signal.aborted) {
                    if (ws) {
                        if (ws.unAll)
                            ws.unAll();
                        ws.destroy();
                    }
                    return;
                }

            } catch (err) {
                if (err.name === 'AbortError') {
                    return;
                } else if (err.name === 'EncodingError') {
                    console.error(`Cannot decode ${stem}: The audio file may be corrupted or in an unsupported format.`, err);
                } else if (err.name === 'NotReadableError') {
                    console.error(`Cannot read ${stem}: File became inaccessible during loading.`, err);
                } else {
                    console.error('StemRow load error:', stem, err);
                }
            }
        };

        initWaveSurfer();

        // Cleanup
        return () => {
            // 1. Abort any ongoing operations
            abortController.abort();

            // 2. Cleanup WaveSurfer instance
            // Use a small timeout to ensure abort signal is processed
            setTimeout(() => {
                if (ws) {
                    if (ws.unAll)
                        ws.unAll();
                    ws.destroy();
                }
            }, 0);

            wsRef.current = null;
            setIsReady(false);

            // 3. Update parent state
            registerWaveSurfer(stem, null);
        };
    }, [audioUrl, waveformPeaks, stem, audioContext]);

    // Handle Volume Updates from Parent (effective volume includes solo/mute/main logic)
    useEffect(() => {
        if (!wsRef.current || typeof effectiveVolume !== 'number') return;
        wsRef.current.setVolume(effectiveVolume);
    }, [effectiveVolume, isReady]);

    const handleDownload = () => {
        if (onDownload) {
            onDownload(stem);
        }
    };

    const handleLockToggle = () => {
        onUpdate('locked', !sState?.locked);
    };

    // Get the context menu functions
    const { openMenu } = useContextMenu();

    // Example: Handle right-click on an element
    const handleContextMenu = (e) => {
        e.preventDefault(); // Prevent default browser context menu

        // Show the context menu at the click position
        openMenu(
            e.clientX,
            e.clientY,
            [
                {
                    label: 'Hide',
                    onClick: () => handleHide(),
                },
                {
                    label: 'Rename',
                    onClick: () => handleRename()
                }
            ]
        );
    };



    const handleRename = () => {
        console.log('Rename clicked');
        // Your rename logic here
    };

    const handleProperties = () => {
        console.log('Properties clicked');
        // Your properties logic here
    };

    return (
        <div
            onContextMenu={handleContextMenu}
            className={`stem-row ${sState?.muted ? 'is-muted' : ''} ${sState?.locked ? 'is-locked' : ''}`}
            style={{ display: visible ? 'flex' : 'none' }}
        >
            <div className="stem-controls-left">

                {/* Column 1: Actions */}
                <div className="ctl-col ctl-col-actions">
                    <button
                        className="icon-btn btn-remove"
                        onClick={() => onRemove(stem)}
                        title="Remove from Player"
                        disabled={sState?.locked}
                    >
                        <XIcon size={16} />
                    </button>

                    <button
                        className={`icon-btn ${sState?.locked ? 'active' : ''}`}
                        onClick={handleLockToggle}
                        title={sState?.locked ? "Unlock" : "Lock"}
                    >
                        {sState?.locked ? <LockIcon size={14} /> : <UnlockIcon size={14} />}
                    </button>

                    <button
                        className="icon-btn"
                        onClick={handleDownload}
                        title="Download Stem"
                        disabled={sState?.locked}
                    >
                        <DownloadIcon size={16} />
                    </button>
                </div>

                {/* Column 2: Info & Icon & Solo */}
                <div className="ctl-col ctl-col-center">
                    <div className={`row-stem-name ${shouldScroll ? 'should-scroll' : ''}`} ref={stemNameRef} title={nameToShow}>
                        <div className="stem-name-scroll">
                            <span className="stem-name-text">
                                {nameToShow}
                                {isUnified && <span className="tag-unified">U</span>}
                            </span>
                            {shouldScroll && (
                                <span className="stem-name-text stem-name-duplicate">
                                    {nameToShow}
                                    {isUnified && <span className="tag-unified">U</span>}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="stem-icon-container">
                        <img src={getStemIcon(stem)} className="stem-type-icon-large" />
                    </div>

                    <button
                        className={`icon-btn btn-solo ${sState?.solo ? 'active' : ''}`}
                        onClick={() => onUpdate('solo', !sState?.solo)}
                        title="Solo"
                        disabled={sState?.locked}
                    >
                        <SoloIcon size={16} />
                    </button>
                </div>

                {/* Column 3: Mix (Slider + Mute) */}
                <div className="ctl-col ctl-col-mix">
                    <Slider
                        value={sState?.vol ?? 0.5}
                        min={0}
                        max={1}
                        orientation="vertical"
                        onChange={(val) => onUpdate('vol', val)}
                        label="Volume"
                        disabled={sState?.locked}
                    />

                    <button
                        className={`icon-btn btn-mute ${sState?.muted ? 'active' : ''}`}
                        onClick={() => onUpdate('muted', !sState?.muted)}
                        title={sState?.muted ? "Unmute" : "Mute"}
                        disabled={sState?.locked}
                    >
                        {sState?.muted ? <MuteIcon size={16} /> : <VolumeIcon size={16} />}
                    </button>
                </div>

            </div>

            <div className="waveform-wrapper"
                onPointerDown={handleMouseDown}
            >
                <div ref={containerRef} className="waveform-container" />
                {!isReady && <div className="loading-overlay">Loading Waveform...</div>}
                {sState?.locked && <div className="locked-overlay" title="Stem is locked" />}
            </div>
        </div>
    );
};

export default StemRow;
