import React, { useState, useEffect, useRef } from 'react';
import { getModules, runModules, getProjectStatus } from '../../services/api';
import './EditorView.css';

/**
 * StemItem - A single stem/audio item with action buttons
 */
const StemItem = ({
    stem,
    isInPlayer,
    isHidden,
    isOriginal = false,
    onAddToPlayer,
    onRemoveFromPlayer,
    onHide,
    onUnhide,
    onDownload
}) => {
    const displayName = stem.replace(/\.(wav|mp3|flac)$/, '');

    return (
        <div className={`stem-browser-item ${isOriginal ? 'original-item' : ''} ${isInPlayer ? 'in-player' : ''} ${isHidden ? 'is-hidden' : ''}`}>
            <span className="browser-stem-name">{displayName}</span>

            <div className="stem-item-actions">
                {isInPlayer ? (
                    <>
                        <span className="in-player-badge">In Player</span>
                        <button
                            className="stem-action-btn remove-btn"
                            onClick={() => onRemoveFromPlayer(stem)}
                            title="Remove from Player"
                        >
                            ✕
                        </button>
                    </>
                ) : (
                    <button
                        className="stem-action-btn add-btn"
                        onClick={() => onAddToPlayer(stem)}
                        title="Add to Player"
                    >
                        ▶
                    </button>
                )}

                {!isOriginal && (
                    isHidden ? (
                        <button
                            className="stem-action-btn unhide-btn"
                            onClick={() => onUnhide(stem)}
                            title="Show Stem"
                        >
                            👁
                        </button>
                    ) : (
                        <button
                            className="stem-action-btn hide-btn"
                            onClick={() => onHide(stem)}
                            title="Hide Stem"
                        >
                            👁‍🗨
                        </button>
                    )
                )}

                <button
                    className="stem-action-btn download-btn"
                    onClick={() => onDownload(stem)}
                    title="Download"
                >
                    ⬇
                </button>
            </div>
        </div>
    );
};

const StemBrowser = ({
    allStems,           // All stems (not filtered by player status)
    activeStemIds,      // Stems currently in player
    trackId,
    originalFile,
    onAddToPlayer,
    onRemoveFromPlayer,
    onDownloadStem,
    onNewStemsAvailable
}) => {
    // Collapsible sections state
    const [originalExpanded, setOriginalExpanded] = useState(true);
    const [stemsExpanded, setStemsExpanded] = useState(true);
    const [hiddenExpanded, setHiddenExpanded] = useState(false);
    const [processExpanded, setProcessExpanded] = useState(false);

    // Hidden stems state
    const [hiddenStems, setHiddenStems] = useState([]);

    // Modules state
    const [modules, setModules] = useState([]);
    const [executedModules, setExecutedModules] = useState([]);
    const [selectedModules, setSelectedModules] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState(null);

    const browserRef = useRef(null);

    // Fetch available modules and project status on mount/trackId change
    useEffect(() => {
        getModules()
            .then(data => setModules(data.modules || []))
            .catch(err => console.error('Failed to load modules:', err));

        if (trackId) {
            getProjectStatus(trackId)
                .then(data => setExecutedModules(data.executed_modules || []))
                .catch(err => console.error('Failed to load project status:', err));
        }
    }, [trackId]);

    // Auto-scroll when Process section expands
    useEffect(() => {
        if (processExpanded && browserRef.current) {
            // Wait slightly for animation to start/finish to ensure correct scroll target
            setTimeout(() => {
                browserRef.current.scrollTo({
                    top: browserRef.current.scrollHeight,
                    behavior: 'smooth'
                });
            }, 300);
        }
    }, [processExpanded]);

    // Helpers
    const isInPlayer = (stem) => activeStemIds.includes(stem);
    const isHidden = (stem) => hiddenStems.includes(stem);
    const isModuleExecuted = (moduleId) => executedModules.includes(moduleId);

    // Actions
    const hideStem = (stem) => {
        setHiddenStems(prev => [...prev, stem]);
    };

    const unhideStem = (stem) => {
        setHiddenStems(prev => prev.filter(s => s !== stem));
    };

    const toggleModule = (moduleId) => {
        setSelectedModules(prev =>
            prev.includes(moduleId)
                ? prev.filter(id => id !== moduleId)
                : [...prev, moduleId]
        );
    };

    const handleRunModules = async () => {
        if (selectedModules.length === 0 || !trackId) return;

        setProcessing(true);
        setError(null);

        try {
            const result = await runModules(trackId, selectedModules);
            console.log('Modules processed:', result);

            setExecutedModules(result.executed_modules || []);

            if (onNewStemsAvailable && result.stems) {
                onNewStemsAvailable(result.stems);
            }

            setSelectedModules([]);
        } catch (err) {
            console.error('Failed to run modules:', err);
            setError(err.response?.data?.error || 'Failed to process modules');
        } finally {
            setProcessing(false);
        }
    };

    // Separate stems into visible and hidden
    const visibleStems = allStems.filter(s => !isHidden(s));
    const hiddenStemsList = allStems.filter(s => isHidden(s));

    // Separate modules into executed and available
    const availableModules = modules.filter(m => !isModuleExecuted(m.id));
    const completedModules = modules.filter(m => isModuleExecuted(m.id));

    // Count stems in player
    const stemsInPlayerCount = visibleStems.filter(s => isInPlayer(s)).length;

    return (
        <div className="stem-browser" ref={browserRef}>
            {/* Original Song Section */}
            {originalFile && (
                <div className="browser-section original-section">
                    <button
                        className={`section-toggle ${originalExpanded ? 'expanded' : ''}`}
                        onClick={() => setOriginalExpanded(!originalExpanded)}
                    >
                        <span className="toggle-icon">{originalExpanded ? '▼' : '▶'}</span>
                        <span className="section-title">🎵 Original Song</span>
                    </button>

                    <div className={`collapsible-content ${originalExpanded ? 'expanded' : ''}`}>
                        <div className="collapsible-inner">
                            <div className="browser-list">
                                <StemItem
                                    stem={originalFile}
                                    isInPlayer={isInPlayer(originalFile)}
                                    isHidden={false}
                                    isOriginal={true}
                                    onAddToPlayer={onAddToPlayer}
                                    onRemoveFromPlayer={onRemoveFromPlayer}
                                    onDownload={onDownloadStem}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Stems Section */}
            <div className="browser-section">
                <button
                    className={`section-toggle ${stemsExpanded ? 'expanded' : ''}`}
                    onClick={() => setStemsExpanded(!stemsExpanded)}
                >
                    <span className="toggle-icon">{stemsExpanded ? '▼' : '▶'}</span>
                    <span className="section-title">🎚️ Stems</span>
                    <span className="section-count">{visibleStems.length}</span>
                    {stemsInPlayerCount > 0 && (
                        <span className="section-count in-player-count">▶ {stemsInPlayerCount}</span>
                    )}
                </button>

                <div className={`collapsible-content ${stemsExpanded ? 'expanded' : ''}`}>
                    <div className="collapsible-inner">
                        <div className="browser-list">
                            {visibleStems.map(stem => (
                                <StemItem
                                    key={stem}
                                    stem={stem}
                                    isInPlayer={isInPlayer(stem)}
                                    isHidden={false}
                                    onAddToPlayer={onAddToPlayer}
                                    onRemoveFromPlayer={onRemoveFromPlayer}
                                    onHide={hideStem}
                                    onDownload={onDownloadStem}
                                />
                            ))}
                            {visibleStems.length === 0 && (
                                <div className="empty-msg">No stems available</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Hidden Stems Section */}
            {hiddenStemsList.length > 0 && (
                <div className="browser-section hidden-section">
                    <button
                        className={`section-toggle ${hiddenExpanded ? 'expanded' : ''}`}
                        onClick={() => setHiddenExpanded(!hiddenExpanded)}
                    >
                        <span className="toggle-icon">{hiddenExpanded ? '▼' : '▶'}</span>
                        <span className="section-title">👁‍🗨 Hidden</span>
                        <span className="section-count">{hiddenStemsList.length}</span>
                    </button>

                    <div className={`collapsible-content ${hiddenExpanded ? 'expanded' : ''}`}>
                        <div className="collapsible-inner">
                            <div className="browser-list">
                                {hiddenStemsList.map(stem => (
                                    <StemItem
                                        key={stem}
                                        stem={stem}
                                        isInPlayer={isInPlayer(stem)}
                                        isHidden={true}
                                        onAddToPlayer={onAddToPlayer}
                                        onRemoveFromPlayer={onRemoveFromPlayer}
                                        onUnhide={unhideStem}
                                        onDownload={onDownloadStem}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Process More Section */}
            <div className="browser-section process-more-section">
                <button
                    className={`section-toggle ${processExpanded ? 'expanded' : ''}`}
                    onClick={() => setProcessExpanded(!processExpanded)}
                >
                    <span className="toggle-icon">{processExpanded ? '▼' : '▶'}</span>
                    <span className="section-title">🔄 Process More</span>
                    {completedModules.length > 0 && (
                        <span className="section-count completed">✓ {completedModules.length}</span>
                    )}
                </button>

                <div className={`collapsible-content ${processExpanded ? 'expanded' : ''}`}>
                    <div className="collapsible-inner">
                        <div className="module-selector">
                            {/* Completed Modules - display only */}
                            {completedModules.length > 0 && (
                                <div className="module-group">
                                    <p className="module-group-label">✓ Completed</p>
                                    <div className="module-list completed-list">
                                        {completedModules.map(m => (
                                            <div key={m.id} className="module-option completed">
                                                <span className="module-check">✓</span>
                                                <span className="module-info">
                                                    <span className="module-desc">{m.description}</span>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Available Modules */}
                            {availableModules.length > 0 && (
                                <div className="module-group">
                                    <p className="module-group-label">Available to run</p>
                                    <div className="module-list">
                                        {availableModules.map(m => (
                                            <label key={m.id} className="module-option">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedModules.includes(m.id)}
                                                    onChange={() => toggleModule(m.id)}
                                                    disabled={processing}
                                                />
                                                <span className="module-info">
                                                    <span className="module-desc">{m.description}</span>
                                                    {m.depends_on && (
                                                        <span className="module-dep">
                                                            requires: {m.depends_on}
                                                        </span>
                                                    )}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                    <button
                                        className="btn btn-primary run-modules-btn"
                                        onClick={handleRunModules}
                                        disabled={processing || selectedModules.length === 0}
                                    >
                                        {processing ? '⏳ Processing...' : `▶ Run Selected (${selectedModules.length})`}
                                    </button>
                                </div>
                            )}

                            {/* All modules executed */}
                            {availableModules.length === 0 && completedModules.length > 0 && (
                                <p className="all-done-msg">All modules have been executed!</p>
                            )}

                            {error && <div className="module-error">{error}</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default StemBrowser;
