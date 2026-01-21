import React, { useState, useEffect, useRef } from 'react';
import { getModules, runModules, getProjectStatus } from '../../services/api';
import { createSSEConnection } from '../../services/sse';
import ProgressBar from '../common/ProgressBar';
import './EditorView.css';
import {
    ChevronRightIcon,
    ChevronDownIcon,
    PlayIcon,
    XIcon,
    EyeIcon,
    EyeOffIcon,
    DownloadIcon,
    CheckIcon,
    PlusIcon,
    MusicIcon,
    SlidersIcon,
    CpuIcon
} from '../common/Icons';
import { getInstrumentType, getIconForType } from '../utils/getStemIcon';

// Capitalize first letter
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

/**
 * StemItem - A single stem/audio item with action buttons
 */
const StemItem = ({
    stem,
    displayName,
    isInPlayer,
    isHidden,
    isOriginal = false,
    onAddToPlayer,
    onRemoveFromPlayer,
    onHide,
    onUnhide,
    onDownload
}) => {
    // Use displayName if provided, otherwise derive from stem filename
    const nameToShow = displayName || stem.replace(/\.(wav|mp3|flac)$/, '');

    return (
        <div className={`stem-browser-item ${isOriginal ? 'original-item' : ''} ${isInPlayer ? 'in-player' : ''} ${isHidden ? 'is-hidden' : ''}`}>
            <span className="browser-stem-name">{nameToShow}</span>

            <div className="stem-item-actions">
                {isInPlayer ? (
                    <>
                        <span className="in-player-badge">In Player</span>
                        <button
                            className="stem-action-btn remove-btn"
                            onClick={() => onRemoveFromPlayer(stem)}
                            title="Remove from Player"
                        >
                            <XIcon size={14} />
                        </button>
                    </>
                ) : (
                    <button
                        className="stem-action-btn add-btn"
                        onClick={() => onAddToPlayer(stem)}
                        title="Add to Player"
                    >
                        <PlusIcon size={14} />
                    </button>
                )}

                {!isOriginal && (
                    isHidden ? (
                        <button
                            className="stem-action-btn unhide-btn"
                            onClick={() => onUnhide(stem)}
                            title="Show Stem"
                        >
                            <EyeIcon size={14} />
                        </button>
                    ) : (
                        <button
                            className="stem-action-btn hide-btn"
                            onClick={() => onHide(stem)}
                            title="Hide Stem"
                        >
                            <EyeOffIcon size={14} />
                        </button>
                    )
                )}

                <button
                    className="stem-action-btn download-btn"
                    onClick={() => onDownload(stem)}
                    title="Download"
                >
                    <DownloadIcon size={14} />
                </button>
            </div>
        </div>
    );
};

/**
 * CollapsibleGroup - Reusable component for collapsible sections
 */
const CollapsibleGroup = ({
    title,
    count,
    children,
    icon,
    className = "",
    defaultExpanded = false,
    headerExtra = null
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className={`stem-type-group ${className}`}>
            <button
                className={`type-toggle ${isExpanded ? 'expanded' : ''}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="toggle-icon">
                    {isExpanded ? <ChevronDownIcon size={10} /> : <ChevronRightIcon size={10} />}
                </span>
                {icon && <span className="type-icon-wrapper">{icon}</span>}
                <span className="type-name">{title}</span>
                {count !== undefined && <span className="type-count">{count}</span>}
                {headerExtra}
            </button>

            <div className={`collapsible-content ${isExpanded ? 'expanded' : ''}`}>
                <div className="collapsible-inner">
                    <div className="browser-list type-stems-list">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};


const StemBrowser = ({
    allStems,           // All stems (not filtered by player status)
    activeStemIds,      // Stems currently in player
    trackId,
    trackName,          // Track name from metadata (for original file display)
    originalFile,
    onAddToPlayer,
    onRemoveFromPlayer,
    onDownloadStem,
    onNewStemsAvailable,
    thumbnail
}) => {
    // Collapsible sections state
    const [originalExpanded, setOriginalExpanded] = useState(true);
    const [stemsExpanded, setStemsExpanded] = useState(true);
    const [hiddenExpanded, setHiddenExpanded] = useState(false);
    const [processExpanded, setProcessExpanded] = useState(false);

    // Expanded instrument type categories (all expanded by default)
    const [expandedTypes, setExpandedTypes] = useState({});

    // Hidden stems state
    const [hiddenStems, setHiddenStems] = useState([]);

    // Modules state
    const [modules, setModules] = useState([]);
    const [executedModules, setExecutedModules] = useState([]);
    const [selectedModules, setSelectedModules] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState(null);

    // SSE and progress state
    const sseRef = useRef(null);
    const [moduleProgress, setModuleProgress] = useState({}); // { moduleId: { percentage, status, dependencyName } }

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
        // Only include ancestors that haven't been executed yet
        const ancestors = [];
        if (!isModuleExecuted(module.dependsOn)) {
            ancestors.push(module.dependsOn);
            ancestors.push(...getAllAncestors(module.dependsOn));
        }
        return ancestors;
    };

    const toggleModule = (moduleId) => {
        setSelectedModules(prev => {
            const newSelected = [...prev];

            if (newSelected.includes(moduleId)) {
                // Unchecking: remove this module and all descendants
                const toRemove = [moduleId, ...getAllDescendants(moduleId)];
                return newSelected.filter(id => !toRemove.includes(id));
            } else {
                // Checking: add this module and all unexecuted ancestors
                const toAdd = [moduleId, ...getAllAncestors(moduleId)];
                // Filter out duplicates
                const uniqueToAdd = toAdd.filter(id => !newSelected.includes(id));
                return [...newSelected, ...uniqueToAdd];
            }
        });
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
        if (sseRef.current) {
            sseRef.current.close();
        }

        sseRef.current = createSSEConnection(jobId, {
            onModuleProgress: (data) => {
                const { module, status, message } = data;
                if (!module) return;

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
                // Processing complete
            }
        });
    };

    const handleRunModules = async () => {
        if (selectedModules.length === 0 || !trackId) return;

        setProcessing(true);
        setError(null);

        // Initialize progress for selected modules
        initializeModuleProgress(selectedModules);

        try {
            // Start API call - SSE is created by backend when processing starts
            const apiPromise = runModules(trackId, selectedModules);

            // Connect to SSE after delay to allow backend to create channel
            setTimeout(() => connectSSE(trackId), 500);

            const result = await apiPromise;
            console.log('Modules processed:', result);

            // Close SSE connection
            if (sseRef.current) {
                sseRef.current.close();
                sseRef.current = null;
            }

            setExecutedModules(result.executed_modules || []);
            setModuleProgress({}); // Clear progress

            if (onNewStemsAvailable && result.stems) {
                onNewStemsAvailable(result.stems);
            }

            setSelectedModules([]);
        } catch (err) {
            if (sseRef.current) {
                sseRef.current.close();
                sseRef.current = null;
            }
            console.error('Failed to run modules:', err);
            setError(err.response?.data?.error || 'Failed to process modules');
        } finally {
            setProcessing(false);
        }
    };

    // Separate stems into visible and hidden
    const visibleStems = allStems.filter(s => !isHidden(s));
    const hiddenStemsList = allStems.filter(s => isHidden(s));

    // Group visible stems by instrument type
    const stemsByType = visibleStems.reduce((acc, stem) => {
        const type = getInstrumentType(stem);
        if (!acc[type]) acc[type] = [];
        acc[type].push(stem);
        return acc;
    }, {});

    // Get sorted list of types (consistent ordering)
    const typeOrder = ['drums', 'bass', 'guitar', 'vocal', 'piano', 'instrumental', 'other'];
    const sortedTypes = Object.keys(stemsByType).sort((a, b) => {
        const indexA = typeOrder.indexOf(a);
        const indexB = typeOrder.indexOf(b);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    // Toggle type expansion
    const toggleTypeExpanded = (type) => {
        setExpandedTypes(prev => ({
            ...prev,
            [type]: prev[type] === undefined ? true : !prev[type]
        }));
    };

    // Check if type is expanded (default to false)
    const isTypeExpanded = (type) => !!expandedTypes[type];

    // Separate modules into executed and available
    const availableModules = modules.filter(m => !isModuleExecuted(m.id));
    const completedModules = modules.filter(m => isModuleExecuted(m.id));

    // Count stems in player
    const stemsInPlayerCount = visibleStems.filter(s => isInPlayer(s)).length;

    return (
        <div className="stem-browser">
            {/* Thumbnail Section - Fixed at top */}
            {thumbnail && (
                <div className="browser-thumbnail">
                    <img src={thumbnail} alt="Track Art" />
                </div>
            )}

            <div className="browser-content" ref={browserRef}>
                {/* Original Song Section */}
                {originalFile && (
                    <div className="browser-section original-section">
                        <button
                            className={`section-toggle ${originalExpanded ? 'expanded' : ''}`}
                            onClick={() => setOriginalExpanded(!originalExpanded)}
                        >
                            <span className="toggle-icon">
                                {originalExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                            </span>
                            <span className="section-title"><MusicIcon size={14} style={{ marginRight: 6 }} /> Original Song</span>
                        </button>

                        <div className={`collapsible-content ${originalExpanded ? 'expanded' : ''}`}>
                            <div className="collapsible-inner">
                                <div className="browser-list">
                                    <StemItem
                                        stem={originalFile}
                                        displayName={trackName}
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
                        <span className="toggle-icon">
                            {stemsExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                        </span>
                        <span className="section-title"><SlidersIcon size={14} style={{ marginRight: 6 }} /> Stems</span>
                        <span className="section-count">{visibleStems.length}</span>
                        {stemsInPlayerCount > 0 && (
                            <span className="section-count in-player-count"><PlayIcon size={10} style={{ marginRight: 2 }} fill="currentColor" /> {stemsInPlayerCount}</span>
                        )}
                    </button>

                    <div className={`collapsible-content ${stemsExpanded ? 'expanded' : ''}`}>
                        <div className="collapsible-inner">
                            {visibleStems.length === 0 ? (
                                <div className="browser-list">
                                    <div className="empty-msg">No stems available</div>
                                </div>
                            ) : (
                                <div className="stem-type-groups">
                                    {sortedTypes.map(type => {
                                        const stemsOfType = stemsByType[type];
                                        const typeExpanded = isTypeExpanded(type);
                                        const stemsInPlayerOfType = stemsOfType.filter(s => isInPlayer(s)).length;

                                        return (
                                            <div key={type} className="stem-type-group">
                                                <button
                                                    className={`type-toggle ${typeExpanded ? 'expanded' : ''}`}
                                                    onClick={() => toggleTypeExpanded(type)}
                                                >
                                                    <span className="toggle-icon">
                                                        {typeExpanded ? <ChevronDownIcon size={10} /> : <ChevronRightIcon size={10} />}
                                                    </span>
                                                    <img
                                                        src={getIconForType(type)}
                                                        alt={type}
                                                        className="type-icon"
                                                    />
                                                    <span className="type-name">{capitalize(type)}</span>
                                                    <span className="type-count">{stemsOfType.length}</span>
                                                    {stemsInPlayerOfType > 0 && (
                                                        <span className="type-count in-player-count">
                                                            <PlayIcon size={8} style={{ marginRight: 2 }} fill="currentColor" />
                                                            {stemsInPlayerOfType}
                                                        </span>
                                                    )}
                                                </button>

                                                <div className={`collapsible-content ${typeExpanded ? 'expanded' : ''}`}>
                                                    <div className="collapsible-inner">
                                                        <div className="browser-list type-stems-list">
                                                            {stemsOfType.map(stem => (
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
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
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
                            <span className="toggle-icon">
                                {hiddenExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                            </span>
                            <span className="section-title"><EyeOffIcon size={14} style={{ marginRight: 6 }} /> Hidden</span>
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
                        <span className="toggle-icon">
                            {processExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                        </span>
                        <span className="section-title"><CpuIcon size={14} style={{ marginRight: 6 }} /> Process More</span>
                        {completedModules.length > 0 && (
                            <span className="section-count completed"><CheckIcon size={10} style={{ marginRight: 2 }} /> {completedModules.length}</span>
                        )}
                    </button>

                    <div className={`collapsible-content ${processExpanded ? 'expanded' : ''}`}>
                        <div className="collapsible-inner">
                            <div className="module-selector">
                                {/* Completed Modules - display only */}
                                {completedModules.length > 0 && (
                                    <div className="module-group">
                                        <p className="module-group-label"><CheckIcon size={12} color="currentColor" style={{ marginRight: 4 }} /> Completed</p>
                                        <div className="module-list completed-list">
                                            {completedModules.map(m => (
                                                <div key={m.id} className="module-option completed">
                                                    <span className="module-check"><CheckIcon size={14} color="#4caf50" /></span>
                                                    <span className="module-info">
                                                        <span className="module-desc">{m.description}</span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Available Modules Grouped by Category */}
                                {availableModules.length > 0 && (
                                    <>
                                        {/* Group modules by category */}
                                        {(() => {
                                            const groupedModules = availableModules.reduce((acc, m) => {
                                                const cat = m.category || 'Other';
                                                if (!acc[cat]) acc[cat] = [];
                                                acc[cat].push(m);
                                                return acc;
                                            }, {});

                                            // Sort categories - put Vocal Processing and Instrument Separation first
                                            const categoryOrder = ['Vocal Processing', 'Instrument Separation', 'Other'];
                                            const sortedCategories = Object.keys(groupedModules).sort((a, b) => {
                                                const idxA = categoryOrder.indexOf(a);
                                                const idxB = categoryOrder.indexOf(b);
                                                // If both known, sort by index
                                                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                                                // If a known, it comes first
                                                if (idxA !== -1) return -1;
                                                if (idxB !== -1) return 1;
                                                // Otherwise alphabetical
                                                return a.localeCompare(b);
                                            });

                                            return sortedCategories.map(category => (
                                                <CollapsibleGroup
                                                    key={category}
                                                    title={category}
                                                    count={groupedModules[category].length}
                                                    defaultExpanded={true}
                                                    icon={<CpuIcon size={12} />} // Generic icon for now, or could map specific icons
                                                >
                                                    {groupedModules[category].map(m => {
                                                        const isDepMet = !m.dependsOn || isModuleExecuted(m.dependsOn);
                                                        const depName = m.dependsOn ? (modules.find(mod => mod.id === m.dependsOn)?.description || m.dependsOn) : '';

                                                        return (
                                                            <label
                                                                key={m.id}
                                                                className={`module-option ${selectedModules.includes(m.id) ? 'selected' : ''}`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedModules.includes(m.id)}
                                                                    onChange={() => toggleModule(m.id)}
                                                                    disabled={processing}
                                                                />
                                                                <span className="module-info">
                                                                    <span className="module-desc">{m.description}</span>
                                                                    {m.dependsOn && (
                                                                        <span className="module-dep">
                                                                            requires: {depName}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </CollapsibleGroup>
                                            ));
                                        })()}
                                    </>
                                )}

                                {/* Module Progress Bars - shown during processing */}
                                {processing && Object.keys(moduleProgress).length > 0 && (
                                    <div className="module-progress-section">
                                        {Object.entries(moduleProgress).map(([moduleId, progress]) => {
                                            const moduleInfo = modules.find(m => m.id === moduleId);
                                            const label = moduleInfo?.description || moduleId;
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

                                <button
                                    className="btn btn-primary run-modules-btn"
                                    onClick={handleRunModules}
                                    disabled={processing || selectedModules.length === 0}
                                >
                                    {processing ? '⏳ Processing...' : `▶ Run Selected (${selectedModules.length})`}
                                </button>
                            </div>


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
