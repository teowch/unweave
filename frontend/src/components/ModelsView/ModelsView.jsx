import React, { useState, useEffect } from 'react';
import './ModelsView.css';
import { getModules } from '../../services/api';

const ModelCard = ({ module }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div
            className={`model-card ${isExpanded ? 'expanded' : ''}`}
            onMouseLeave={() => setIsExpanded(false)}
        >
            <div className="model-header-row">
                <h3 className="model-name">{module.id.replace(/_/g, ' ')}</h3>
                {module.dependsOn && (
                    <span className="model-badge dependency" title={`Requires ${module.dependsOn}`}>
                        🔗 {module.dependsOn.replace(/_/g, ' ')}
                    </span>
                )}
            </div>

            {module.welcomeText && (
                <p className="model-welcome-text">{module.welcomeText}</p>
            )}

            <div className="model-details">
                <div className="model-section">
                    <span className="detail-label">Outputs</span>
                    <div className="output-tags">
                        {module.outputs.map((output) => (
                            <span key={output} className="output-tag">{output}</span>
                        ))}
                    </div>
                </div>

                <div className="model-technical-wrapper">
                    <div
                        className="technical-toggle"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        <span>Technical Details</span>
                        <span className={`toggle-icon ${isExpanded ? 'rotated' : ''}`}>▼</span>
                    </div>

                    {isExpanded && (
                        <div className="technical-content-overlay">
                            <p className="model-description">{module.description}</p>
                            <div className="model-file-info">
                                <span className="detail-label">Model Checkpoint</span>
                                <code className="model-filename">{module.model}</code>
                            </div>

                            {module.scores && Object.keys(module.scores).length > 0 && (
                                <div className="model-section" style={{ marginTop: '1rem' }}>
                                    <span className="detail-label">Performance Scores</span>
                                    <div className="scores-grid">
                                        {Object.entries(module.scores).map(([stem, scores]) => (
                                            <div key={stem} className="score-group">
                                                <span className="score-stem-name">{stem}</span>
                                                <div className="score-values">
                                                    {scores.SDR && (
                                                        <div className="score-item" title="Signal-to-Distortion Ratio">
                                                            <span className="score-label">SDR</span>
                                                            <span className="score-value">{scores.SDR.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                    {scores.SIR && (
                                                        <div className="score-item" title="Signal-to-Interference Ratio">
                                                            <span className="score-label">SIR</span>
                                                            <span className="score-value">{scores.SIR.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ModelsView = () => {
    const [modules, setModules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchModules = async () => {
            try {
                const data = await getModules();
                setModules(data.modules || []);
            } catch (err) {
                console.error('Failed to fetch modules:', err);
                setError('Failed to load modules');
            } finally {
                setLoading(false);
            }
        };
        fetchModules();
    }, []);

    // Group modules by category
    const groupedModules = modules.reduce((acc, module) => {
        if (!acc[module.category]) {
            acc[module.category] = [];
        }
        acc[module.category].push(module);
        return acc;
    }, {});

    return (
        <div className="models-view">
            <header className="models-header">
                <h1>Available Models</h1>
                <p className="models-subtitle">
                    These are the AI models available for audio separation. Models are downloaded automatically when first used.
                </p>
            </header>

            {loading && (
                <div className="models-loading">Loading models...</div>
            )}

            {error && (
                <div className="models-error">{error}</div>
            )}

            {!loading && !error && (
                <div className="models-content">
                    {Object.entries(groupedModules).map(([category, modules]) => (
                        <section key={category} className="models-category">
                            <h2 className="category-title">{category}</h2>
                            <div className="models-grid">
                                {modules.map((module) => (
                                    <ModelCard key={module.id} module={module} />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ModelsView;
