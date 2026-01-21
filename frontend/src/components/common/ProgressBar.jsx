import React from 'react';
import './ProgressBar.css';

/**
 * Reusable progress bar component for displaying processing status
 * 
 * @param {Object} props
 * @param {string} props.label - Text label (e.g., "Downloading" or module name)
 * @param {number} props.percentage - Progress percentage (0-100)
 * @param {string} props.status - Status: 'idle' | 'running' | 'resolving_dependency' | 'complete' | 'error'
 * @param {string} props.dependencyName - Name of the dependency being resolved (when status is 'resolving_dependency')
 */
const ProgressBar = ({
    label,
    percentage = 0,
    status = 'idle',
    dependencyName = ''
}) => {
    const getStatusClass = () => {
        switch (status) {
            case 'running': return 'progress-running';
            case 'resolving_dependency': return 'progress-resolving';
            case 'complete': return 'progress-complete';
            case 'error': return 'progress-error';
            default: return 'progress-idle';
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'running': return `${percentage}%`;
            case 'resolving_dependency': return `Waiting for ${dependencyName}...`;
            case 'complete': return 'Complete';
            case 'error': return 'Error';
            default: return 'Pending';
        }
    };

    const displayPercentage = status === 'complete' ? 100 : percentage;

    return (
        <div className={`progress-bar-component ${getStatusClass()}`}>
            <div className="progress-header">
                <span className="progress-label">{label}</span>
                <span className="progress-status-text">{getStatusText()}</span>
            </div>
            <div className="progress-track">
                <div
                    className="progress-fill"
                    style={{ width: `${displayPercentage}%` }}
                />
            </div>
        </div>
    );
};

export default ProgressBar;
