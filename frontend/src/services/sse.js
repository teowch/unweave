import { SSE_BASE } from './api';

/**
 * SSE Service for receiving real-time processing status updates
 * 
 * Events emitted by the backend:
 * - 'download': Download progress { module, status: 'running', message: '<percentage>' }
 * - 'module_processing': Module processing { module, status: 'running'|'resolving_dependency', message: '<percentage>|<module_name>' }
 * - 'model_downloading': Model download progress { module, model, status: 'downloading'|'complete', progress: '<percentage>|<message>' }
 * - 'id_changed': Project ID changed { new_id: '<new_project_id>' }
 * - 'error': Error occurred { module, status: 'error', message: '<error_message>' }
 * - 'done': Stream completed { message: 'closed' }
 */

/**
 * Creates an SSE connection for a specific project channel
 * @param {string} projectId - The project ID to subscribe to
 * @param {Object} handlers - Event handler callbacks
 * @param {Function} handlers.onDownloadProgress - Called with { module, status, message } for download updates
 * @param {Function} handlers.onModuleProgress - Called with { module, status, message } for module processing updates
 * @param {Function} handlers.onIdChanged - Called with { new_id } when project ID changes
 * @param {Function} handlers.onError - Called with { module, status, message } on error
 * @param {Function} handlers.onDone - Called when stream is complete
 * @param {Function} handlers.onRepairStarted - Called with repair lifecycle payload when consistency repair starts
 * @param {Function} handlers.onRepairCompleted - Called with repair lifecycle payload when consistency repair finishes
 * @param {Function} handlers.onRepairFailed - Called with repair lifecycle payload when consistency repair fails
 * @param {Function} handlers.onConnectionError - Called when SSE connection fails
 * @returns {Object} Controller with { close, reconnect }
 */
export function createSSEConnection(projectId, handlers = {}) {
    let currentJobId = projectId;
    let eventSource = null;
    let retryCount = 0;
    const MAX_RETRIES = 10;
    const RETRY_DELAY = 1000; // 1 second
    let retryTimeout = null;
    let closed = false;

    const {
        onDownloadProgress,
        onModuleProgress,
        onModelDownloading,
        onIdChanged,
        onError,
        onDone,
        onRepairStarted,
        onRepairCompleted,
        onRepairFailed,
        onConnectionError
    } = handlers;

    const handleJsonEvent = (eventName, callback) => {
        eventSource.addEventListener(eventName, (event) => {
            retryCount = 0;
            try {
                const data = JSON.parse(event.data);
                if (callback) {
                    callback(data);
                }
            } catch (e) {
                console.error(`Failed to parse ${eventName} event:`, e);
            }
        });
    };

    function connect(id) {
        if (closed) return; // Don't connect if explicitly closed

        // Close existing connection if any
        if (eventSource) {
            eventSource.close();
        }

        const sseUrl = `${SSE_BASE}/${id}`;
        eventSource = new EventSource(sseUrl);
        currentJobId = id;

        // Handle download progress events
        handleJsonEvent('download', onDownloadProgress);

        // Handle module processing events
        handleJsonEvent('module_processing', onModuleProgress);

        // Handle model downloading events
        handleJsonEvent('model_downloading', onModelDownloading);

        // Handle project ID change events - reconnect to new ID
        eventSource.addEventListener('id_changed', (event) => {
            retryCount = 0;
            try {
                const data = JSON.parse(event.data);
                if (onIdChanged) {
                    onIdChanged(data);
                }
                // Close current connection and reconnect to new ID
                if (data.new_id && data.new_id !== currentJobId) {
                    connect(data.new_id);
                }
            } catch (e) {
                console.error('Failed to parse id_changed event:', e);
            }
        });

        handleJsonEvent('repair_started', onRepairStarted);
        handleJsonEvent('repair_completed', onRepairCompleted);
        handleJsonEvent('repair_failed', onRepairFailed);

        // Handle error events from the backend
        eventSource.addEventListener('error', (event) => {
            if (event.data) {
                try {
                    const data = JSON.parse(event.data);
                    if (onError) {
                        onError(data);
                    }
                } catch (e) {
                    console.error('Failed to parse error event:', e);
                }
            }
        });

        // Handle done events
        eventSource.addEventListener('done', (event) => {
            try {
                const data = JSON.parse(event.data);
                eventSource.close();
                eventSource = null;
                if (onDone) {
                    onDone(data);
                }
            } catch (e) {
                console.error('Failed to parse done event:', e);
                eventSource.close();
                eventSource = null;
            }
        });

        // Handle connection errors - retry if channel not ready yet
        eventSource.onerror = (error) => {
            if (closed) return;

            if (eventSource.readyState === EventSource.CLOSED ||
                eventSource.readyState === EventSource.CONNECTING) {
                eventSource.close();

                // Retry if we haven't exceeded max retries
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    console.log(`SSE connection failed, retrying (${retryCount}/${MAX_RETRIES})...`);
                    retryTimeout = setTimeout(() => connect(currentJobId), RETRY_DELAY);
                } else {
                    if (onConnectionError) {
                        onConnectionError(error);
                    }
                }
            }
        };
    }

    // Initial connection
    connect(projectId);

    return {
        /** Close the SSE connection */
        close: () => {
            closed = true;
            if (retryTimeout) {
                clearTimeout(retryTimeout);
                retryTimeout = null;
            }
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }
        },
        /** Reconnect to a different job ID */
        reconnect: (newJobId) => {
            connect(newJobId);
        },
        /** Get current job ID */
        getJobId: () => currentJobId
    };
}

export default { createSSEConnection };
