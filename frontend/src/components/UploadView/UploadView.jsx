import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { processFile, processUrl, getModules } from '../../services/api';
import { createSSEConnection } from '../../services/sse';
import ProgressBar from '../common/ProgressBar';
import './UploadView.css';

const UploadView = ({ onUploadSuccess }) => {
    const navigate = useNavigate();
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
    const finalProjectIdRef = useRef(null);
    const [downloadProgress, setDownloadProgress] = useState(null); // { percentage, status }
    const [modelDownloading, setModelDownloading] = useState(null); // { model, status, progress }
    const [moduleProgress, setModuleProgress] = useState({}); // { moduleId: { percentage, status, dependencyName } }


    // Fetch modules on mount
    useEffect(() => {
        const fetchModules = async () => {
            try {
                const data = await getModules();
                setModules(data.modules || []);
                // Select all modules by default
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

    // Get all children of a module
    const getChildren = (moduleId) => {
        return modules.filter(m => m.dependsOn === moduleId).map(m => m.id);
    };

    // Get all descendants of a module (recursive)
    const getAllDescendants = (moduleId) => {
        const children = getChildren(moduleId);
        const descendants = [...children];
        children.forEach(childId => {
            descendants.push(...getAllDescendants(childId));
        });
        return descendants;
    };

    //Get all ancestors of a module (recursive)
    const getAllAncestors = (moduleId) => {
        const module = modules.find(m => m.id === moduleId);
        if (!module || !module.dependsOn) return [];
        const ancestors = [module.dependsOn];
        ancestors.push(...getAllAncestors(module.dependsOn));
        return ancestors;
    };

    // Handle checkbox change with hierarchical logic
    const handleModuleToggle = (moduleId) => {
        setSelectedModules(prev => {
            const newSelected = new Set(prev);

            if (newSelected.has(moduleId)) {
                // Unchecking: remove this module and all descendants
                newSelected.delete(moduleId);
                const descendants = getAllDescendants(moduleId);
                descendants.forEach(id => newSelected.delete(id));
            } else {
                // Checking: add this module and all ancestors
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
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
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

    // Initialize module progress for selected modules
    const initializeModuleProgress = (modulesArray) => {
        const initial = {};
        modulesArray.forEach(moduleId => {
            initial[moduleId] = { percentage: 0, status: 'idle', dependencyName: '' };
        });
        setModuleProgress(initial);
    };

    // Connect to SSE stream for processing updates
    const connectSSE = (jobId) => {
        // Close existing connection if any
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

                // Clear model downloading when module processing starts
                setModelDownloading(null);

                if (status === 'resolving_dependency') {
                    // Parent module is being processed first
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
            onIdChanged: (data) => {
                finalProjectIdRef.current = data.new_id;
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
        finalProjectIdRef.current = null;

        try {
            const modulesArray = Array.from(selectedModules);
            if (modulesArray.length === 0) {
                setError('Please select at least one processing module');
                setIsLoading(false);
                return;
            }

            // Initialize progress for all selected modules
            initializeModuleProgress(modulesArray);

            let res;
            if (mode === 'file') {
                if (!file) return;

                // Generate a unique temp_project_id for SSE tracking
                const tempProjectId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

                // Start API call with temp_project_id
                const apiPromise = processFile(file, modulesArray, tempProjectId);

                // Connect to SSE after delay to allow backend to create channel
                setTimeout(() => connectSSE(tempProjectId), 500);

                res = await apiPromise;
            } else {
                if (!url) return;

                // Generate a unique temp_project_id for SSE tracking (same as file mode)
                const tempProjectId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

                // For URL mode, show download progress
                setDownloadProgress({ percentage: 0, status: 'idle' });

                // Start API call with temp_project_id
                const apiPromise = processUrl(url, modulesArray, tempProjectId);

                // Connect to SSE after delay to allow backend to create channel
                setTimeout(() => connectSSE(tempProjectId), 500);

                res = await apiPromise;
            }

            // Close SSE connection
            if (sseRef.current) {
                sseRef.current.close();
                sseRef.current = null;
            }

            if (onUploadSuccess) {
                await onUploadSuccess();
            }

            // Use final project ID if it changed, otherwise use response ID
            const projectId = finalProjectIdRef.current || res.id;
            navigate(`/library/${projectId}`);
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

    // Group modules by category
    const modulesByCategory = modules.reduce((acc, module) => {
        const category = module.category || 'Uncategorized';
        if (!acc[category]) acc[category] = [];
        acc[category].push(module);
        return acc;
    }, {});

    // Render module checkbox
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

    // Show module selection only if file/url is selected
    const showModuleSelection = (mode === 'file' && file) || (mode === 'url' && url);

    return (
        <div className="upload-view fade-in">
            <div className="upload-card">
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
                                    .filter(m => !m.dependsOn) // Show only root modules
                                    .map(module => renderModuleCheckbox(module))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Progress Bars Section - shown during processing */}
                {isLoading && (Object.keys(moduleProgress).length > 0 || downloadProgress || modelDownloading) && (
                    <div className="progress-section">
                        {/* Download Progress (URL mode only) */}
                        {downloadProgress && (
                            <ProgressBar
                                label="Downloading"
                                percentage={downloadProgress.percentage}
                                status={downloadProgress.status}
                            />
                        )}

                        {/* Model Downloading Indicator */}
                        {modelDownloading && (
                            <div className="model-downloading-indicator">
                                <div className="loader-small"></div>
                                <span>Downloading model: {modelDownloading.model?.split('.')[0] || 'AI model'}...</span>
                            </div>
                        )}

                        {/* Module Progress Bars */}
                        {Object.entries(moduleProgress).map(([moduleId, progress]) => {
                            const module = modules.find(m => m.id === moduleId);
                            const label = module?.description || moduleId;
                            return (
                                <ProgressBar
                                    key={moduleId}
                                    label={label}
                                    percentage={progress.percentage}
                                    status={progress.status}
                                    dependencyName={progress.dependencyName}
                                />
                            );
                        })}
                    </div>
                )}

                {error && <div className="error-banner">{error}</div>}

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
            </div>
        </div>
    );
};

export default UploadView;
