import { useState, useRef, useEffect, useCallback } from 'react';

export const useAudioPlayer = () => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [mainVolume, setMainVolume] = useState(0.5);

    // Refs
    const wsRefs = useRef({}); // Map: stemId -> WaveSurfer instance
    const isScrubbingRef = useRef(false);
    const sliderRef = useRef(false);
    const playheadBaseTimeRef = useRef(0);
    const playheadStartedAtRef = useRef(null);

    // Refs for stable callback access (avoids re-creating registerWaveSurfer)
    const currentTimeRef = useRef(currentTime);
    const mainVolumeRef = useRef(mainVolume);
    const durationRef = useRef(duration);

    useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
    useEffect(() => { mainVolumeRef.current = mainVolume; }, [mainVolume]);
    useEffect(() => { durationRef.current = duration; }, [duration]);

    const getClockTime = useCallback(() => {
        if (!isPlaying || playheadStartedAtRef.current == null) {
            return currentTimeRef.current;
        }

        const elapsed = (performance.now() - playheadStartedAtRef.current) / 1000;
        const nextTime = playheadBaseTimeRef.current + elapsed;

        if (durationRef.current > 0) {
            return Math.min(nextTime, durationRef.current);
        }

        return nextTime;
    }, [isPlaying]);

    const syncCurrentTime = useCallback(() => {
        if (isScrubbingRef.current || sliderRef.current) {
            return;
        }

        const nextTime = getClockTime();
        if (Math.abs(nextTime - currentTimeRef.current) > 0.02) {
            setCurrentTime(nextTime);
        }
    }, [getClockTime]);

    useEffect(() => {
        if (!isPlaying) {
            return undefined;
        }

        const handleVisibilitySync = () => {
            syncCurrentTime();
        };

        document.addEventListener('visibilitychange', handleVisibilitySync);
        window.addEventListener('focus', handleVisibilitySync);
        syncCurrentTime();

        let animationFrame = null;
        const loop = () => {
            syncCurrentTime();
            animationFrame = requestAnimationFrame(loop);
        };
        loop();

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilitySync);
            window.removeEventListener('focus', handleVisibilitySync);
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
            }
        };
    }, [isPlaying, syncCurrentTime]);

    const registerWaveSurfer = useCallback((id, ws) => {
        if (ws) {
            wsRefs.current[id] = ws;
            // Sync new instance to global state (reads from refs for latest values)
            ws.setVolume(mainVolumeRef.current);
            ws.setTime(currentTimeRef.current);

            // Update duration if not set
            const d = ws.getDuration();
            if (d > 0 && Math.abs(d - durationRef.current) > 0.1) {
                setDuration(d);
            }
            ws.on('ready', () => {
                setDuration(prev => Math.max(prev, ws.getDuration()));
            });
        } else {
            delete wsRefs.current[id];
        }
    }, []);

    const togglePlay = useCallback(() => {
        setIsPlaying(prev => {
            const next = !prev;
            if (next) {
                playheadBaseTimeRef.current = currentTimeRef.current;
                playheadStartedAtRef.current = performance.now();
            } else {
                const pausedTime = getClockTime();
                playheadBaseTimeRef.current = pausedTime;
                playheadStartedAtRef.current = null;
                setCurrentTime(pausedTime);
            }
            Object.values(wsRefs.current).forEach(ws => {
                if (next) ws.play();
                else ws.pause();
            });
            return next;
        });
    }, [getClockTime]);

    const seek = useCallback((time) => {
        playheadBaseTimeRef.current = time;
        playheadStartedAtRef.current = isPlaying ? performance.now() : null;
        setCurrentTime(time);
        Object.values(wsRefs.current).forEach(ws => {
            ws.setTime(time);
        });
    }, [isPlaying]);

    const setVolume = useCallback((vol) => {
        setMainVolume(vol);
        // Note: Individual stem volume logic (mute/solo) should be handled by the consumer (EditorView)
        // possibly by passing a specific volume to the StemRow, which multiplies by mainVolume.
        // But if we want global volume, we can do it here if we track stem states?
        // Better: let EditorView calculate effective volume = stemVol * mainVol
        // and call setVolume on the WS instance directly?
        // OR: useAudioPlayer exposes a `updateVolume(id, vol)`?
        // For now, simpliest split: EditorView manages "Logic Mixer", useAudioPlayer manages "Transport".
    }, []);

    // When isPlaying changes, ensure sync
    useEffect(() => {
        Object.values(wsRefs.current).forEach(ws => {
            if (isPlaying) ws.play();
            else ws.pause();
        });
    }, [isPlaying, syncCurrentTime]);

    return {
        isPlaying,
        currentTime,
        duration,
        mainVolume,
        setMainVolume: setVolume,
        togglePlay,
        seek,
        registerWaveSurfer,
        sliderRef,
        isScrubbingRef
    };
};
