import React, { useEffect, useState } from 'react';
import { getModules, processFile, processUrl } from '../../services/api';
import ProgressBar from '../common/ProgressBar';
import './UploadView.css';

const STEP_STATUS_MAP = {
    pending: 'idle',
    running: 'running',
    completed: 'complete',
    failed: 'error',
};

const UploadView = ({
    onUploadSuccess,
    activeJob,
    processingRefreshError,
    onProcessingStarted,
    onProcessingReset
}) => {
    const [mode, setMode] = useState('file');
    const [file, setFile] = useState(null);
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [modules, setModules] = useState([]);
    const [selectedModules, setSelectedModules] = useState(new Set());

    useEffect(() => {
        const fetchModules = async () => {
            try {
                const data = await getModules();
                setModules(data.modules || []);
                const allModuleIds = (data.modules || []).map((module) => module.id);
                setSelectedModules(new Set(allModuleIds));
            } catch (err) {
                console.error('Failed to fetch modules:', err);
            }
        };

        fetchModules();
    }, []);

    const getChildren = (moduleId) => {
        return modules.filter((module) => module.dependsOn === moduleId).map((module) => module.id);
    };

    const getAllDescendants = (moduleId) => {
        const children = getChildren(moduleId);
        const descendants = [...children];
        children.forEach((childId) => {
            descendants.push(...getAllDescendants(childId));
        });
        return descendants;
    };

    const getAllAncestors = (moduleId) => {
        const module = modules.find((item) => item.id === moduleId);
        if (!module || !module.dependsOn) return [];
        const ancestors = [module.dependsOn];
        ancestors.push(...getAllAncestors(module.dependsOn));
        return ancestors;
    };

    const handleModuleToggle = (moduleId) => {
        setSelectedModules((previous) => {
            const nextSelected = new Set(previous);

            if (nextSelected.has(moduleId)) {
                nextSelected.delete(moduleId);
                const descendants = getAllDescendants(moduleId);
                descendants.forEach((id) => nextSelected.delete(id));
            } else {
                nextSelected.add(moduleId);
                const ancestors = getAllAncestors(moduleId);
                ancestors.forEach((id) => nextSelected.add(id));
            }

            return nextSelected;
        });
    };

    const handleDrag = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.type === 'dragenter' || event.type === 'dragover') {
            setDragActive(true);
        } else if (event.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragActive(false);
        if (event.dataTransfer.files && event.dataTransfer.files[0]) {
            setFile(event.dataTransfer.files[0]);
            setMode('file');
        }
    };

    const handleUpload = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const modulesArray = Array.from(selectedModules);
            if (modulesArray.length === 0) {
                setError('Please select at least one processing module');
                setIsLoading(false);
                return;
            }

            const tempProjectId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

            if (mode === 'file') {
                if (!file) {
                    setIsLoading(false);
                    return;
                }

                await processFile(file, modulesArray, tempProjectId);
            } else {
                if (!url) {
                    setIsLoading(false);
                    return;
                }

                await processUrl(url, modulesArray, tempProjectId);
            }

            if (onProcessingStarted) {
                await onProcessingStarted(tempProjectId);
            }

            if (onUploadSuccess) {
                await onUploadSuccess();
            }
        } catch (err) {
            if (err.response?.data?.error === 'job already active' && err.response?.data?.active_job) {
                setError(null);
                if (onProcessingStarted) {
                    await onProcessingStarted(err.response.data.active_job);
                }
                return;
            }

            setError(err.response?.data?.error || 'Error processing request');
            if (onProcessingReset) {
                onProcessingReset();
            }
        } finally {
            setIsLoading(false);
        }
    };

    const modulesByCategory = modules.reduce((accumulator, module) => {
        const category = module.category || 'Uncategorized';
        if (!accumulator[category]) accumulator[category] = [];
        accumulator[category].push(module);
        return accumulator;
    }, {});

    const renderModuleCheckbox = (module, level = 0) => {
        const isChecked = selectedModules.has(module.id);
        const children = modules.filter((item) => item.dependsOn === module.id);

        return (
            <div key={module.id} className={level === 0 ? 'module-sublist' : 'module-sublist-child'} style={{ marginLeft: `${level * 20}px` }}>
                <label className="module-checkbox">
                    <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleModuleToggle(module.id)}
                    />
                    <span>{module.description}</span>
                </label>
                {children.map((child) => renderModuleCheckbox(child, level + 1))}
            </div>
        );
    };

    const visibleJob = activeJob || null;
    const visibleError = error || processingRefreshError;
    const orderedSteps = Array.isArray(visibleJob?.steps) ? visibleJob.steps : [];
    const isSnapshotMode = Boolean(visibleJob);
    const currentStepLabel = visibleJob?.currentStep?.label || 'Preparing';
    const currentStepProgress = visibleJob?.currentStep?.progress ?? visibleJob?.overallProgress ?? 0;

    return (
        <div className="upload-view fade-in">
            <div className="upload-card">
                {isSnapshotMode ? (
                    <>
                        <header className="processing-header">
                            <div className="processing-badge">{visibleJob.isFinished ? 'Finished' : 'Current Processing'}</div>
                            <h2>{`Processing ${visibleJob.projectName}`}</h2>
                            <p className="subtitle">Live progress is synced from the backend snapshot.</p>
                            <p className="processing-summary">{`${visibleJob.overallProgress}% overall`}</p>
                            <p className="processing-current-step">{`${currentStepLabel} - ${currentStepProgress}%`}</p>
                        </header>

                        <div className="progress-section">
                            <ProgressBar
                                label="Overall Progress"
                                percentage={visibleJob.overallProgress}
                                status={visibleJob.isFinished ? 'complete' : 'running'}
                            />

                            {orderedSteps.map((step) => (
                                <ProgressBar
                                    key={step.id}
                                    label={step.label}
                                    percentage={step.progress}
                                    status={STEP_STATUS_MAP[step.state] || 'idle'}
                                />
                            ))}
                        </div>
                    </>
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
                                        onChange={(event) => setFile(event.target.files[0])}
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
                                        onChange={(event) => setUrl(event.target.value)}
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
                                            .filter((module) => !module.dependsOn)
                                            .map((module) => renderModuleCheckbox(module))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {visibleError ? <div className="error-banner">{visibleError}</div> : null}

                {!isSnapshotMode ? (
                    <div className="actions">
                        <button
                            onClick={handleUpload}
                            disabled={(mode === 'file' && !file) || (mode === 'url' && !url) || isLoading}
                            className="btn btn-primary btn-large"
                        >
                            {isLoading ? (
                                <>
                                    <div className="loader" />
                                    <span>Processing...</span>
                                </>
                            ) : (
                                <span>Process Track</span>
                            )}
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default UploadView;
