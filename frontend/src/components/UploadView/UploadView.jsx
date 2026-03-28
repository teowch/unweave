import React, { useState, useEffect, useRef } from 'react';
import { processFile, processUrl, getModules } from '../../services/api';
import { createSSEConnection } from '../../services/sse';
import ProgressBar from '../common/ProgressBar';
import './UploadView.css';

const UploadView = ({ onUploadSuccess, activeJob }) => {
    const [mode, setMode] = useState('file'); // 'file' | 'url'
    const [file, setFile] = useState(null);
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [dragActive, setDragActive] = useState(false);

    // Module selection state
    const [modules, setModules] = useState([]);
    const [selectedModules, setSelectedModules] = useState(new Set());

    // SSE and progress state
    const sseRef = useRef(null);
    const [downloadProgress, setDownloadProgress] = useState(null); // { percentage, status }
    const [modelDownloading, setModelDownloading] = useState(null); // { model, status, progress }
    const [moduleProgress, setModuleProgress] = useState({}); // { moduleId: { percentage, status, dependencyName } }

    const displayedDownloadProgress = activeJob?.downloadProgress ?? downloadProgress;
    const displayedModelDownloading = activeJob?.modelDownloading ?? modelDownloading;
    const displayedModuleProgress = activeJob?.moduleProgress ?? moduleProgress;
    const displayedError = activeJob?.state === 'failed'
        ? activeJob.statusText || error
        : error;
    const isProcessingActive = Boolean(activeJob) || isLoading;

    // Fetch modules on mount
    useEffect(() => {
        const fetchModules = async () => {
            try {
                const data = await getModules();
                setModules(data.modules || []);
                const allModuleIds = (data.modules || []).map(m => m.id);
                setSelectedModules(new Set(allModuleIds));
            } catch (err) {
                console.error('Failed to fetch modules:', err);
            }
        };
        fetchModules();
    }, []);

    // Cleanup SSE on unmount
    useEffect(() => {
        return () => {
            if (sseRef.current) {
                sseRef.current.close();
            }
        };
    }, []);

    const getChildren = (moduleId) => {
        return modules.filter(m => m.dependsOn === moduleId).map(m => m.id);
    };

    const getAllDescendants = (moduleId) => {
        const children = getChildren(moduleId);
        const descendants = [...children];
        children.forEach(childId => {
            descendants.push(...getAllDescendants(childId));
        });
        return descendants;
    };

    const getAllAncestors = (moduleId) => {
        const module = modules.find(m => m.id === moduleId);
        if (!module || !module.dependsOn) return [];
        const ancestors = [module.dependsOn];
        ancestors.push(...getAllAncestors(module.dependsOn));
        return ancestors;
    };

    const handleModuleToggle = (moduleId) => {
        setSelectedModules(prev => {
            const newSelected = new Set(prev);

            if (newSelected.has(moduleId)) {
                newSelected.delete(moduleId);
                const descendants = getAllDescendants(moduleId);
                descendants.forEach(id => newSelected.delete(id));
            } else {
                newSelected.add(moduleId);
                const ancestors = getAllAncestors(moduleId);
                ancestors.forEach(id => newSelected.add(id));
            }

            return newSelected;
        });
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
            setMode('file');
        }
    };

    const initializeModuleProgress = (modulesArray) => {
        const initial = {};
        modulesArray.forEach(moduleId => {
            initial[moduleId] = { percentage: 0, status: 'idle', dependencyName: '' };
        });
        setModuleProgress(initial);
    };

    const connectSSE = (jobId) => {
        if (sseRef.current) {
            sseRef.current.close();
        }

        sseRef.current = createSSEConnection(jobId, {
            onDownloadProgress: (data) => {
                const percentage = parseInt(data.message, 10) || 0;
                setDownloadProgress({ percentage, status: 'running' });
            },
            onModelDownloading: (data) => {
                const { model, status, progress } = data;
                if (status === 'complete') {
                    setModelDownloading(null);
                } else {
                    setModelDownloading({ model, status, progress });
                }
            },
            onModuleProgress: (data) => {
                const { module, status, message } = data;
                if (!module) return;

                setModelDownloading(null);

                if (status === 'resolving_dependency') {
                    setModuleProgress(prev => ({
                        ...prev,
                        [module]: {
                            ...prev[module],
                            status: 'resolving_dependency',
                            dependencyName: message
                        }
                    }));
                } else if (status === 'running') {
                    const percentage = parseInt(message, 10) || 0;
                    setModuleProgress(prev => ({
                        ...prev,
                        [module]: {
                            percentage,
                            status: percentage >= 100 ? 'complete' : 'running',
                            dependencyName: ''
                        }
                    }));
                }
            },
            onError: (data) => {
                const { module, message } = data;
                if (module) {
                    setModuleProgress(prev => ({
                        ...prev,
                        [module]: { ...prev[module], status: 'error' }
                    }));
                }
                setError(message || 'Processing error');
            },
            onDone: () => {
                setDownloadProgress(prev => prev ? { ...prev, status: 'complete' } : null);
                setModelDownloading(null);
            }
        });
    };

    const handleUpload = async () => {
        setIsLoading(true);
        setError(null);
        setDownloadProgress(null);
        setModelDownloading(null);
        setModuleProgress({});

        try {
            const modulesArray = Array.from(selectedModules);
            if (modulesArray.length === 0) {
                setError('Please select at least one processing module');
                setIsLoading(false);
                return;
            }

            initializeModuleProgress(modulesArray);

            if (mode === 'file') {
                if (!file) {
                    setIsLoading(false);
                    return;
                }

                const tempProjectId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
                const apiPromise = processFile(file, modulesArray, tempProjectId);
                window.setTimeout(() => connectSSE(tempProjectId), 500);
                await apiPromise;
            } else {
                if (!url) {
                    setIsLoading(false);
                    return;
                }

                const tempProjectId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
                setDownloadProgress({ percentage: 0, status: 'idle' });
                const apiPromise = processUrl(url, modulesArray, tempProjectId);
                window.setTimeout(() => connectSSE(tempProjectId), 500);
                await apiPromise;
            }

            if (onUploadSuccess) {
                await onUploadSuccess();
            }
        } catch (err) {
            if (sseRef.current) {
                sseRef.current.close();
                sseRef.current = null;
            }
            setError(err.response?.data?.error || 'Error processing request');
        } finally {
            setIsLoading(false);
        }
    };

    const modulesByCategory = modules.reduce((acc, module) => {
        const category = module.category || 'Uncategorized';
        if (!acc[category]) acc[category] = [];
        acc[category].push(module);
        return acc;
    }, {});

    const renderModuleCheckbox = (module, level = 0) => {
        const isChecked = selectedModules.has(module.id);
        const children = modules.filter(m => m.dependsOn === module.id);

        return (
            <div key={module.id} className={level == 0 ? 'module-sublist' : 'module-sublist-child'} style={{ marginLeft: level * 20 + 'px' }}>
                <label className="module-checkbox">
                    <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleModuleToggle(module.id)}
                    />
                    <span>{module.description}</span>
                </label>
                {children.map(child => renderModuleCheckbox(child, level + 1))}
            </div>
        );
    };

    const restoredModuleEntries = activeJob?.batches?.map((batch) => {
        const moduleId = batch.module_id;
        const localProgress = displayedModuleProgress[moduleId] || {};
        const status = batch.state === 'completed'
            ? 'complete'
            : batch.state === 'failed'
                ? 'error'
                : localProgress.status || (batch.state === 'running' ? 'running' : 'idle');
        const percentage = batch.state === 'completed'
            ? 100
            : localProgress.percentage || 0;

        return [
            moduleId,
            {
                percentage,
                status,
                dependencyName: localProgress.dependencyName || '',
                label: batch.module_name || batch.module_id,
            },
        ];
    }) || Object.entries(displayedModuleProgress).map(([moduleId, progress]) => [
        moduleId,
        {
            ...progress,
            label: modules.find((module) => module.id === moduleId)?.description || moduleId,
        },
    ]);

    return (
        <div className="upload-view fade-in">
            <div className="upload-card">
                {activeJob ? (
                    <header className="processing-header">
                        <div className="processing-badge">Current Processing</div>
                        <h2>{activeJob.projectName}</h2>
                        <p className="subtitle">{activeJob.statusText} - {activeJob.currentBatchLabel}</p>
                        <p className="processing-summary">
                            Batch {activeJob.completedBatchCount} of {activeJob.totalBatchCount || restoredModuleEntries.length || 1}
                        </p>
                    </header>
                ) : (
                    <>
                        <header>
                            <h2>Start New Project</h2>
                            <p className="subtitle">Upload an audio file or paste a YouTube link to split stems.</p>
                        </header>
                        <div className="input-area">
                            <div className="mode-switcher">
                                <button
                                    className={`switcher-btn ${mode === 'file' ? 'active' : ''}`}
                                    onClick={() => setMode('file')}
                                >
                                    File Upload
                                </button>
                                <button
                                    className={`switcher-btn ${mode === 'url' ? 'active' : ''}`}
                                    onClick={() => setMode('url')}
                                >
                                    YouTube URL
                                </button>
                            </div>
                            {mode === 'file' ? (
                                <div
                                    className={`drop-zone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
                                    onDragEnter={handleDrag}
                                    onDragLeave={handleDrag}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                >
                                    <input
                                        type="file"
                                        accept=".mp3,.wav,.ogg,.flac"
                                        onChange={(e) => setFile(e.target.files[0])}
                                        id="file-input"
                                        className="hidden-input"
                                        key={file?.name || 'file-input'}
                                    />
                                    <label htmlFor="file-input">
                                        {file ? (
                                            <div className="file-selected">
                                                <span className="icon">🎵</span>
                                                <span className="filename">{file.name}</span>
                                                <span className="change-text">Click to change</span>
                                            </div>
                                        ) : (
                                            <div className="placeholder">
                                                <span className="icon">📂</span>
                                                <p>Drag & Drop audio file here</p>
                                                <span className="sub">or click to browse</span>
                                            </div>
                                        )}
                                    </label>
                                </div>
                            ) : (
                                <div className="url-section">
                                    <input
                                        type="text"
                                        placeholder="Paste Youtube Link here..."
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        className="styled-input"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="processing-options">
                            <h3>Processing Options</h3>
                            <div className="modules-list">
                                {Object.entries(modulesByCategory).map(([category, categoryModules]) => (
                                    <div key={category} className="module-category">
                                        <h4 className="module-category-title">{category}</h4>
                                        {categoryModules
                                            .filter(m => !m.dependsOn)
                                            .map(module => renderModuleCheckbox(module))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {isProcessingActive && (restoredModuleEntries.length > 0 || displayedDownloadProgress || displayedModelDownloading) && (
                    <div className="progress-section">
                        {displayedDownloadProgress && (
                            <ProgressBar
                                label="Downloading"
                                percentage={displayedDownloadProgress.percentage}
                                status={displayedDownloadProgress.status}
                            />
                        )}

                        {displayedModelDownloading && (
                            <div className="model-downloading-indicator">
                                <div className="loader-small"></div>
                                <span>Downloading model: {displayedModelDownloading.model?.split('.')[0] || 'AI model'}...</span>
                            </div>
                        )}

                        {restoredModuleEntries.map(([moduleId, progress]) => (
                            <ProgressBar
                                key={moduleId}
                                label={progress.label}
                                percentage={progress.percentage}
                                status={progress.status}
                                dependencyName={progress.dependencyName}
                            />
                        ))}
                    </div>
                )}

                {displayedError && <div className="error-banner">{displayedError}</div>}

                {!activeJob && (
                    <div className="actions">
                        <button
                            onClick={handleUpload}
                            disabled={(mode === 'file' && !file) || (mode === 'url' && !url) || isLoading}
                            className="btn btn-primary btn-large"
                        >
                            {isLoading ? (
                                <>
                                    <div className="loader"></div>
                                    <span>Processing...</span>
                                </>
                            ) : (
                                <span>Process Track</span>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UploadView;
