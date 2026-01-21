import React, { useEffect } from 'react';
import { PlayIcon, PauseIcon, VolumeIcon } from '../common/Icons';
import './EditorView.css'; // Assuming styles are shared or I should make a TransportBar.css? 
// The user asked to separate css. I already put all css in EditorView.css. 
// I'll import it here too or just rely on EditorView importing it if it's global, but explicit is better or using CSS modules.
// Given the previous step, I simply created EditorView.css.
// I will assume for now that standard CSS import in parent or here works. Importing here is safer.


const formatTime = (t, showMillis = false) => {
    if (!t && t !== 0) return '0:00';
    const min = Math.floor(t / 60);
    const sec = Math.floor(t % 60);
    const main = `${min}:${sec < 10 ? '0' + sec : sec}`;
    if (!showMillis) return main;
    const ms = Math.floor((t % 1) * 10); // 1 decimal place
    return `${main}.${ms}`;
};

const Ruler = ({ duration, currentTime, handleMouseDown, onReady }) => {
    const containerRef = React.useRef(null);

    useEffect(() => {
        if (onReady && containerRef.current) {
            onReady({
                getBoundaries: () => {
                    const rect = containerRef.current.getBoundingClientRect();
                    return {
                        left: rect.left,
                        right: rect.right,
                        width: rect.width
                    }
                }
            });
        }
    }, [onReady]);

    // Calculate dynamic ticks based on duration
    const getTicks = () => {
        if (!duration) return [];
        const ticks = [];
        // Determine interval: goal is ~1 tick every 100px roughly, or fixed time intervals
        // Let's stick to logical time intervals: 1s, 5s, 10s, 30s, 1m
        let interval = 10;
        if (duration < 10) interval = 1;
        else if (duration < 60) interval = 5;
        else if (duration < 300) interval = 15;
        else interval = 30;

        for (let t = 0; t <= duration; t += interval) {
            ticks.push({
                time: t,
                label: formatTime(t),
                percent: (t / duration) * 100
            });
        }
        return ticks;
    };

    return (
        <div
            className="ruler-container"
            ref={containerRef}
            onPointerDown={handleMouseDown}
        >
            {getTicks().map(tick => (
                <div
                    key={tick.time}
                    className="ruler-tick"
                    style={{ left: `${tick.percent}%` }}
                >
                    <span className="tick-label">{tick.label}</span>
                </div>
            ))}

            {/* Playhead Handle in Ruler */}
            <div
                className="ruler-playhead"
                style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            >
                <div className="playhead-triangle"></div>
            </div>
        </div>
    );
};



const TransportBar = ({
    isPlaying,
    togglePlay,
    currentTime,
    duration,
    mainVolume,
    setMainVolume,
    handleMouseDown,
    onRulerReady
}) => {
    return (
        <div className="transport-bar">
            {/* Left Box: Controls (220px) */}
            <div className="transport-left">

                {/* Top: Time Display */}
                <div className="lcd-display">
                    <span className="lcd-time">{formatTime(currentTime, true)}</span>
                    <span className="lcd-duration"> / {formatTime(duration)}</span>
                </div>

                {/* Bottom: Play Controls & Volume */}
                <div className="controls-row">
                    <button
                        className={`control-btn ${isPlaying ? 'active' : ''}`}
                        onClick={togglePlay}
                        title={isPlaying ? "Pause" : "Play"}
                    >
                        {isPlaying ? <PauseIcon size={20} fill="currentColor" stroke="none" /> : <PlayIcon size={20} fill="currentColor" stroke="none" />}
                    </button>

                    <div className="vol-wrapper">
                        <VolumeIcon size={16} />
                        <div className="vol-slider-container">
                            <input
                                type="range"
                                min="0" max="1" step="0.01"
                                value={mainVolume}
                                onChange={(e) => setMainVolume(parseFloat(e.target.value))}
                                className="styled-slider"
                                title={`Master Volume: ${Math.round(mainVolume * 100)}%`}
                            />
                            <div
                                className="vol-fill"
                                style={{ width: `${mainVolume * 100}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Box: Ruler (Flex) */}
            <div className="transport-right">
                <Ruler
                    duration={duration}
                    currentTime={currentTime}
                    handleMouseDown={handleMouseDown}
                    onReady={onRulerReady}
                />
            </div>
        </div>
    );
};


export default TransportBar;
