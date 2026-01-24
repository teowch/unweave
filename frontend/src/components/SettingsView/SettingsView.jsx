import React, { useState, useEffect } from 'react';
import './SettingsView.css';
import { getSystemInfo } from '../../services/api';
import {
    ZapIcon,
    ActivityIcon,
    TerminalIcon,
    CpuIcon,
    CheckIcon,
    XIcon,
    HardDriveIcon,
    ExternalLinkIcon
} from '../common/Icons';

const getAccelerationHint = (info) => {
    if (info.gpu_accelerated) return null;

    const isMac = info.os_info?.toLowerCase().includes('darwin');
    const isWindows = info.os_info?.toLowerCase().includes('windows');
    const isLinux = info.os_info?.toLowerCase().includes('linux');

    if (isMac) {
        return (
            <div className="acceleration-guide">
                <div className="guide-header">CoreML Requirements</div>
                <ul className="guide-list">
                    <li>
                        <span className="req-icon"><CheckIcon size={14} /></span>
                        <span>Requires macOS 12.0+ (Monterey+)</span>
                    </li>
                    <li>
                        <span className="req-icon"><CpuIcon size={14} /></span>
                        <span>Apple Silicon M1/M2/M3 Recommended</span>
                    </li>
                    <li>
                        <span className="req-icon"><ZapIcon size={14} /></span>
                        <span>Native Support (No drivers needed)</span>
                    </li>
                </ul>
            </div>
        );
    }

    if (isWindows || isLinux) {
        return (
            <div className="acceleration-guide">
                <div className="guide-header">Enable GPU Support</div>
                <ul className="guide-list">
                    <li>
                        <span className="req-icon"><HardDriveIcon size={14} /></span>
                        <span>Ensure <strong>NVIDIA Drivers</strong> are up to date</span>
                    </li>
                    <li>
                        <span className="req-icon"><ZapIcon size={14} /></span>
                        <span>Install <a href="https://developer.nvidia.com/cuda-downloads" target="_blank" rel="noopener noreferrer" className="external-link">CUDA 12.x Toolkit <ExternalLinkIcon size={12} /></a></span>
                    </li>
                    <li>
                        <span className="req-icon"><ActivityIcon size={14} /></span>
                        <span>Restart Unweave Application</span>
                    </li>
                </ul>
            </div>
        );
    }

    return <span>Enable GPU acceleration for faster processing.</span>;
};

const InfoRow = ({ label, value, status, icon }) => (
    <div className="info-row">
        <span className="info-label">{label}</span>
        <span className={`info-value ${status || ''}`}>
            {value || <span className="info-na">N/A</span>}
        </span>
    </div>
);

const ProgressBar = ({ value, label, subLabel }) => (
    <div className="progress-container">
        <div className="progress-header">
            <span className="progress-label">{label}</span>
            <span className="progress-value">{subLabel}</span>
        </div>
        <div className="progress-bar-track">
            <div
                className="progress-bar-fill"
                style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
            />
        </div>
    </div>
);

const SettingsView = () => {
    const [systemInfo, setSystemInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchSystemInfo = async () => {
            try {
                const data = await getSystemInfo();
                setSystemInfo(data);
            } catch (err) {
                console.error('Failed to fetch system info:', err);
                setError('Failed to load system information. Is the backend running?');
            } finally {
                setLoading(false);
            }
        };
        fetchSystemInfo();
    }, []);

    if (loading) {
        return (
            <div className="settings-view loading">
                <div className="settings-loader">
                    <ActivityIcon size={48} className="spin-slow" />
                    <p>Analyzing System...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="settings-view error">
                <div className="settings-error-content">
                    <XIcon size={48} />
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="settings-view">
            <header className="settings-header">
                <div className="header-content">
                    <h1>Settings</h1>
                    <p className="settings-subtitle">System Configuration & Status</p>
                </div>
            </header>

            <div className="settings-grid">

                {/* Left Column */}
                <div className="settings-col-left">
                    {/* Hardware Acceleration Card - Hero */}
                    <div className={`settings-card acceleration-card ${systemInfo.gpu_accelerated ? 'accelerated' : 'inactive'}`}>
                        <div className="card-header">
                            <div className="card-icon">
                                <ZapIcon size={24} />
                            </div>
                            <h2>Hardware Acceleration</h2>
                        </div>

                        <div className="acceleration-status-display">
                            <div className="status-badge">
                                {systemInfo.gpu_accelerated ? (
                                    <>
                                        <span className="pulse-dot"></span>
                                        ACTIVE
                                    </>
                                ) : (
                                    'INACTIVE'
                                )}
                            </div>
                            <div className="provider-name">
                                {systemInfo.execution_provider}
                            </div>
                            <p className="acceleration-description">
                                {systemInfo.gpu_accelerated
                                    ? 'High-performance GPU acceleration is enabled for audio processing.'
                                    : getAccelerationHint(systemInfo)}
                            </p>
                        </div>

                        {systemInfo.gpu_name && (
                            <div className="gpu-specs">
                                <div className="spec-item">
                                    <span className="spec-label">GPU Model</span>
                                    <span className="spec-value">{systemInfo.gpu_name}</span>
                                </div>
                                {systemInfo.gpu_memory_gb && (
                                    <div className="spec-item">
                                        <span className="spec-label">VRAM</span>
                                        <span className="spec-value">{systemInfo.gpu_memory_gb} GB</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Runtime Environment */}
                    <div className="settings-card">
                        <div className="card-header">
                            <div className="card-icon">
                                <TerminalIcon size={24} />
                            </div>
                            <h2>Runtime Environment</h2>
                        </div>
                        <div className="card-content">
                            <InfoRow label="Python Version" value={systemInfo.python_version} />
                            <InfoRow label="ONNX Runtime" value={systemInfo.onnxruntime_version} />
                            <InfoRow label="PyTorch" value={systemInfo.pytorch_version} />
                            <InfoRow label="Audio Separator" value={systemInfo.audio_separator_version} />
                            <div className="info-row">
                                <span className="info-label">FFmpeg</span>
                                <div className={`status-pill ${systemInfo.ffmpeg_available ? 'success' : 'warning'}`}>
                                    {systemInfo.ffmpeg_available ? <CheckIcon size={14} /> : <XIcon size={14} />}
                                    <span>{systemInfo.ffmpeg_available ? 'Installed' : 'Missing'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="settings-col-right">
                    {/* Device Resources (System + Storage) */}
                    <div className="settings-card device-resources-card">
                        {/* System Section */}
                        <div className="card-section">
                            <div className="card-header">
                                <div className="card-icon">
                                    <ActivityIcon size={24} />
                                </div>
                                <h2>System Information</h2>
                            </div>
                            <div className="card-content">
                                <InfoRow label="Operating System" value={systemInfo.os_info} />
                                <InfoRow label="Processor" value={systemInfo.processor} />
                                <InfoRow label="CPU Cores" value={systemInfo.cpu_count} />
                            </div>
                        </div>

                        <div className="card-divider"></div>

                        {/* Storage Section */}
                        <div className="card-section">
                            <div className="card-header">
                                <div className="card-icon">
                                    <HardDriveIcon size={24} />
                                </div>
                                <h2>Storage</h2>
                            </div>
                            <div className="card-content">
                                {systemInfo.disk_total_gb ? (
                                    <div className="storage-info">
                                        <ProgressBar
                                            value={systemInfo.disk_used_percent}
                                            label="Main Drive Usage"
                                            subLabel={`${systemInfo.disk_used_percent}%`}
                                        />
                                        <div className="storage-stats">
                                            <div className="stat-item">
                                                <span className="stat-label">Free</span>
                                                <span className="stat-value">{systemInfo.disk_free_gb} GB</span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">Total</span>
                                                <span className="stat-value">{systemInfo.disk_total_gb} GB</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="info-na">Storage info unavailable</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SettingsView;
