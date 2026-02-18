import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './SetupView.css';
import { isElectron } from '../../services/api';
import { CpuIcon, ZapIcon, CheckIcon, XIcon, ActivityIcon } from '../common/Icons';

/**
 * SetupView — GPU detection + package installation page.
 *
 * Shown:
 *   1. On first launch (gated by App.jsx — no other pages accessible)
 *   2. When user clicks "Re-detect GPU" in Settings (navigated here)
 *
 * In Electron mode: triggers IPC to run first-run-setup.js and receives
 * live progress updates. In web mode: shows "not available" message.
 */
const SetupView = ({ onSetupComplete }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isRedetect = searchParams.get('mode') === 'redetect';

    const [progress, setProgress] = useState(0);
    const [step, setStep] = useState('');
    const [detail, setDetail] = useState('');
    const [gpuInfo, setGpuInfo] = useState(null);
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState('idle'); // idle | running | complete | error
    const logRef = useRef(null);
    const hasStarted = useRef(false);

    // Auto-scroll log
    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs]);

    // Start setup on mount (only once)
    useEffect(() => {
        if (!isElectron || !window.electronAPI?.startGpuSetup || hasStarted.current) return;
        hasStarted.current = true;

        setStatus('running');
        setStep('Starting...');
        setDetail('Initializing GPU setup');
        addLog('step', '── GPU Setup Started ──');

        // Listen for progress updates
        window.electronAPI.onGpuSetupProgress((update) => {
            setProgress(update.progress);
            setStep(update.step);
            setDetail(update.detail);

            // Classify log lines
            if (update.step === 'Error' || update.step === 'Warning') {
                addLog(update.step === 'Error' ? 'error' : 'normal', update.detail);
            } else if (update.step === 'Complete') {
                addLog('success', `✅ ${update.detail}`);
                setStatus('complete');
                if (update.gpuInfo) setGpuInfo(update.gpuInfo);
            } else if (update.detail && !update.detail.startsWith('Running:')) {
                addLog('normal', update.detail);
            }

            // Step transitions get highlighted
            if (['Detecting GPU', 'Cleaning up', 'Installing PyTorch', 'Installing ONNX Runtime', 'Finishing'].includes(update.step)) {
                addLog('step', `── ${update.step} ──`);
            }

            // Capture GPU info when detected
            if (update.gpuInfo) setGpuInfo(update.gpuInfo);
        });

        // Trigger the setup
        window.electronAPI.startGpuSetup(isRedetect);
    }, []);

    const addLog = (type, text) => {
        setLogs(prev => [...prev.slice(-200), { type, text }]); // Keep last 200 lines
    };

    const handleDone = () => {
        if (onSetupComplete) onSetupComplete();
        if (isRedetect) {
            navigate('/settings');
        } else {
            navigate('/split');
        }
    };

    // Non-Electron fallback
    if (!isElectron) {
        return (
            <div className="setup-container">
                <div className="setup-not-available">
                    <h2>GPU Setup</h2>
                    <p>GPU auto-setup is only available in the desktop app.</p>
                    <p>For web mode, install GPU packages manually in your Python environment.</p>
                </div>
            </div>
        );
    }

    const statusIcon = status === 'complete'
        ? <CheckIcon size={28} />
        : status === 'error'
            ? <XIcon size={28} />
            : <CpuIcon size={28} />;

    const statusClass = status === 'complete' ? 'complete' : status === 'error' ? 'error' : 'detecting';

    return (
        <div className="setup-container">
            <div className="setup-card">
                {/* Header */}
                <div className="setup-header">
                    <div className={`setup-status-icon ${statusClass}`}>
                        {statusIcon}
                    </div>
                    <h1>{isRedetect ? 'GPU Re-detection' : 'Setting Up Unweave'}</h1>
                    <p>
                        {status === 'complete'
                            ? 'Setup complete — your environment is ready.'
                            : status === 'error'
                                ? 'Setup encountered an error. CPU mode will be used as fallback.'
                                : 'Detecting your GPU and installing the best acceleration packages...'}
                    </p>
                </div>

                {/* Progress Bar */}
                <div className="setup-progress">
                    <div className="progress-bar-track">
                        <div
                            className={`progress-bar-fill ${status === 'complete' ? 'complete' : status === 'error' ? 'error' : ''}`}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="progress-info">
                        <span className="progress-step">{step}</span>
                        <span className="progress-percent">{progress}%</span>
                    </div>
                    {detail && <div className="progress-detail">{detail}</div>}
                </div>

                {/* GPU Info (shown after detection) */}
                {gpuInfo && (
                    <div className="gpu-info-card">
                        <div className="gpu-info-title">Detected Hardware</div>
                        <div className="gpu-info-rows">
                            <div className="gpu-info-row">
                                <span className="gpu-info-label">GPU</span>
                                <span className="gpu-info-value">
                                    {gpuInfo.gpuName || gpuInfo.vendor || 'Unknown'}
                                </span>
                            </div>
                            <div className="gpu-info-row">
                                <span className="gpu-info-label">Vendor</span>
                                <span className="gpu-info-value">{gpuInfo.vendor || 'Unknown'}</span>
                            </div>
                            <div className="gpu-info-row">
                                <span className="gpu-info-label">Runtime</span>
                                <span className="gpu-info-value accent">
                                    {gpuInfo.runtime || 'CPU'}
                                </span>
                            </div>
                            {gpuInfo.cudaVariant && (
                                <div className="gpu-info-row">
                                    <span className="gpu-info-label">CUDA Variant</span>
                                    <span className="gpu-info-value success">{gpuInfo.cudaVariant}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Log Output */}
                <div className="setup-log" ref={logRef}>
                    {logs.map((log, i) => (
                        <div key={i} className={`log-line ${log.type}`}>{log.text}</div>
                    ))}
                </div>

                {/* Done Button */}
                {(status === 'complete' || status === 'error') && (
                    <div className="setup-actions">
                        <button className="setup-btn-done" onClick={handleDone}>
                            {status === 'error' ? 'Continue with CPU' : 'Get Started'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SetupView;
