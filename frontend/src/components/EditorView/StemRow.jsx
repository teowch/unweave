import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import './EditorView.css';
import { useContextMenu } from '../ContextMenu/ContextMenuProvider';
import drumIcon from '../../assets/drum.png';


// SVG Icons
const MuteIcon = ({ active }) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        {active ? (
            <>
                <path d="M8 3.5L5 6H3v4h2l3 2.5V3.5z" fill="currentColor" />
                <line x1="10" y1="6" x2="13" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="13" y1="6" x2="10" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </>
        ) : (
            <>
                <path d="M8 3.5L5 6H3v4h2l3 2.5V3.5z" fill="currentColor" />
                <path d="M10 5.5c.5.5 1 1.5 1 2.5s-.5 2-1 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M11.5 4c1 1 1.5 2.5 1.5 4s-.5 3-1.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </>
        )}
    </svg>
);

const SoloIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="2.5" fill="currentColor" />
        <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
);

const DownloadIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 2v8m0 0L5 7m3 3l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

const LockIcon = ({ locked }) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        {locked ? (
            <>
                <rect x="4" y="7" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="8" cy="10" r="0.8" fill="currentColor" />
            </>
        ) : (
            <>
                <rect x="4" y="7" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 7V5a3 3 0 015-2.24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="8" cy="10" r="0.8" fill="currentColor" />
            </>
        )}
    </svg>
);

const MoreIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="3" r="1.5" fill="currentColor" />
        <circle cx="8" cy="8" r="1.5" fill="currentColor" />
        <circle cx="8" cy="13" r="1.5" fill="currentColor" />
    </svg>
);

// Custom Horizontal Bar Component
const HorizontalBar = ({ value, min, max, onChange, mode = 'fill', origin = 'left', label, disabled, ticks = [] }) => {
    const barRef = useRef(null);

    const handleInteraction = (clientX) => {
        if (disabled || !barRef.current) return;
        const rect = barRef.current.getBoundingClientRect();
        const width = rect.width;
        // Calculate normalized value (0 to 1) from left
        const relativeX = Math.max(0, Math.min(width, clientX - rect.left));
        const percentage = relativeX / width;

        // Map to min-max range
        const newValue = min + percentage * (max - min);
        onChange(newValue);
    };

    const handleMouseDown = (e) => {
        e.preventDefault();
        handleInteraction(e.clientX);

        const onMouseMove = (moveEvent) => {
            handleInteraction(moveEvent.clientX);
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

    let content = null;

    if (mode === 'handle') {
        // Handle mode
    } else {
        // Fill Mode (Volume): A bar filling from origin
        let fillWidth = '0%';
        let fillLeft = '0%';

        if (origin === 'center') {
            const distanceFromCenter = Math.abs(normalized - 0.5);
            fillWidth = `${distanceFromCenter * 100}%`;
            fillLeft = normalized < 0.5 ? `${normalized * 100}%` : '50%';
        } else {
            fillWidth = `${normalized * 100}%`;
            fillLeft = '0%';
        }

        content = (
            <div
                className="horizontal-bar-fill"
                style={{ width: fillWidth, left: fillLeft }}
            />
        );
    }

    return (
        <div className={`horizontal-bar-wrapper ${disabled ? 'disabled' : ''}`} title={`${label}: ${Math.round(value * 100) / 100}`}>
            <span className="slider-label-left">{label}</span>
            <div
                className="horizontal-bar-track"
                ref={barRef}
                onMouseDown={handleMouseDown}
            >
                {mode === 'fill' && (
                    <div className="bar-track-bg" />
                )}

                {content}
            </div>
        </div>
    );
};

const StemRow = ({
    stem,
    sState = { vol: 0.5, muted: false, solo: false, locked: false },
    audioUrl,
    onUpdate,
    onRemove,
    onDownload,
    registerWaveSurfer,
    visible = true,
    isPlaying,
    currentTime,
    audioContext,
}) => {
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

    useEffect(() => {
        if (!audioUrl || !containerRef.current || !audioContext) return;

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
                    if (
                        err.name === 'AbortError' ||
                        err.message?.includes('aborted') ||
                        err.toString().includes('aborted')
                    ) return;
                    console.error('WaveSurfer error:', stem, err);
                });

                // Load the audio URL directly (it's already a blob URL from EditorView)
                await ws.load(audioUrl);

                // Check if we were aborted during loading
                if (abortController.signal.aborted) {
                    if (ws) {
                        try {
                            if (ws.unAll) ws.unAll();
                        } catch (e) { /* ignore */ }
                        ws.destroy();
                    }
                    return;
                }

            } catch (err) {
                // Ignore AbortErrors (expected during rapid navigation/updates)
                const isAbort =
                    err.name === 'AbortError' ||
                    err.message === 'The user aborted a request.' ||
                    err.message?.includes('aborted') ||
                    err.toString().includes('aborted');

                if (isAbort) {
                    return;
                }

                // Log other errors
                if (err.name === 'EncodingError') {
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
                    try {
                        try { if (ws.unAll) ws.unAll(); } catch (e) { }
                        ws.destroy();
                    } catch (e) {
                        // Silently ignore destruction errors and abort errors
                        const isAbort =
                            e.name === 'AbortError' ||
                            e.message?.includes('aborted') ||
                            e.toString().includes('aborted');

                        if (!isAbort) {
                            console.debug('WaveSurfer destroy warning:', e);
                        }
                    }
                }
            }, 0);

            wsRef.current = null;
            setIsReady(false);

            // 3. Update parent state
            registerWaveSurfer(stem, null);
        };
    }, [audioUrl, stem, audioContext]);

    // Handle State Updates (Vol, Mute)
    useEffect(() => {
        if (!wsRef.current) return;
        const vol = sState?.vol ?? 0.5;
        const muted = sState?.muted ?? false;
        wsRef.current.setVolume(muted ? 0 : vol);
    }, [sState?.vol, sState?.muted]);

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

                <div className="stem-controls-left-top-section">
                    <button
                        className={`icon-btn ${sState?.locked ? 'active' : ''}`}
                        onClick={handleLockToggle}
                        title={sState?.locked ? "Unlock" : "Lock"}
                    >
                        <LockIcon locked={sState?.locked} />
                    </button>
                    <img src={drumIcon} className="stem-type-icon" />

                    <button
                        className="icon-btn btn-remove"
                        onClick={() => onRemove(stem)}
                        title="Remove from Player"
                        disabled={sState?.locked}
                    >
                        ✕
                    </button>
                </div>

                <div className="stem-controls-left-middle-section">
                    <button
                        className={`icon-btn btn-mute-small ${sState?.muted ? 'active' : ''}`}
                        onClick={() => onUpdate('muted', !sState?.muted)}
                        title={sState?.muted ? "Unmute" : "Mute"}
                        disabled={sState?.locked}
                    >
                        <MuteIcon active={sState?.muted} />
                    </button>
                    <HorizontalBar
                        value={sState?.vol ?? 0.5}
                        min={0}
                        max={1}
                        onChange={(val) => onUpdate('vol', val)}
                        label=""
                        origin="left"
                        mode="fill"
                        disabled={sState?.locked}
                    />
                    <button
                        className={`icon-btn btn-solo ${sState?.solo ? 'active' : ''}`}
                        onClick={() => onUpdate('solo', !sState?.solo)}
                        title="Solo"
                        disabled={sState?.locked}
                    >
                        <SoloIcon />

                    </button>
                </div>

                <div className="stem-controls-left-bottom-section">
                    <button
                        className="icon-btn"
                        onClick={handleDownload}
                        title="Download Stem"
                        disabled={sState?.locked}
                    >
                        <DownloadIcon />
                    </button>
                    <div className={`row-stem-name ${shouldScroll ? 'should-scroll' : ''}`} ref={stemNameRef} title={stem}>
                        <div className="stem-name-scroll">
                            <span className="stem-name-text">
                                {stem}
                                {isUnified && <span className="tag-unified">U</span>}
                            </span>
                            {shouldScroll && (
                                <span className="stem-name-text stem-name-duplicate">
                                    {stem}
                                    {isUnified && <span className="tag-unified">U</span>}
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        className="icon-btn"
                        onClick={(e) => {
                            handleContextMenu(e);
                        }}
                        title="More Options"
                    >
                        <MoreIcon />
                    </button>
                </div>
            </div>

            <div className="waveform-wrapper">
                <div ref={containerRef} className="waveform-container" />
                {!isReady && <div className="loading-overlay">Loading Waveform...</div>}
                {sState?.locked && <div className="locked-overlay" title="Stem is locked" />}
            </div>
        </div>
    );
};

export default StemRow;

