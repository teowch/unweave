import axios from 'axios';

export const BASE = 'http://127.0.0.1:5000';
export const API_BASE = `${BASE}/api`;
export const SSE_BASE = `${BASE}/api/sse`;

// Global Axios interceptor for centralized error handling
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        // Extract error message from response
        const message = error.response?.data?.error
            || error.response?.data?.message
            || error.message
            || 'An unexpected error occurred';

        // Log all API errors for debugging
        console.error('[API Error]', {
            url: error.config?.url,
            status: error.response?.status,
            message: message
        });

        // Network errors (no response)
        if (!error.response) {
            console.error('[API Error] Network error - server may be offline');
        }

        // Preserve original error structure but ensure message is accessible
        error.userMessage = message;
        return Promise.reject(error);
    }
);

/**
 * Get list of stems
 */
export const getStems = async () => {
    const response = await axios.get(`${API_BASE}/stems`);
    return response.data;
};

/**
 * Load all tracks
 */
export const loadAllTracks = async () => {
    const response = await axios.get(`${API_BASE}/load-all-tracks`);
    return response.data;
};

/**
 * Get available processing modules
 * @returns {Promise<Object>} Response data with modules list
 */
export const getModules = async () => {
    const response = await axios.get(`${API_BASE}/modules`);
    return response.data;
};

/**
 * Download a specific stem audio file as a blob
 * @param {string} trackId - The track ID
 * @param {string} stemName - The stem name/filename
 * @returns {Promise<Blob>} The audio file blob
 */
export const downloadStem = async (trackId, stemName) => {
    const response = await axios.get(`${API_BASE}/download/${trackId}/${stemName}`, {
        responseType: 'blob'
    });
    return response.data;
};

/**
 * Upload and process an audio file
 * @param {File} file - The audio file to process
 * @param {Array<string>} modules - Array of module IDs to run (required)
 * @param {string} temp_project_id - Temporary project ID for SSE tracking
 * @returns {Promise<Object>} Response data with track ID
 */
export const processFile = async (file, modules, temp_project_id) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('modules', JSON.stringify(modules));
    formData.append('temp_project_id', temp_project_id);
    const response = await axios.post(`${API_BASE}/process`, formData);
    return response.data;
};

/**
 * Process audio from a URL (e.g., YouTube)
 * @param {string} url - The URL to process audio from
 * @param {Array<string>} modules - Array of module IDs to run (required)
 * @returns {Promise<Object>} Response data with track ID
 */
export const processUrl = async (url, modules) => {
    url = url.split('&')[0]
    let temp_project_id = url.split('=')
    temp_project_id = temp_project_id[temp_project_id.length - 1]
    const response = await axios.post(`${API_BASE}/process-url`, { url, modules, temp_project_id });
    return response.data;
};

/**
 * Get track history/library
 * @returns {Promise<Array>} Array of tracks
 */
export const getHistory = async () => {
    const response = await axios.get(`${API_BASE}/history`);
    return response.data;
};

/**
 * Unify selected stems into a single track
 * @param {string} trackId - The track ID
 * @param {Array<string>} stemNames - Array of stem names to unify
 * @returns {Promise<Object>} Response data
 */
export const unifyStems = async (trackId, stemNames) => {
    const response = await axios.post(`${API_BASE}/unify`, {
        id: trackId,
        tracks: stemNames
    });
    return response.data;
};

/**
 * Download all files for a track as a ZIP archive
 * @param {string} trackId - The track ID
 * @returns {Promise<Blob>} The ZIP file blob
 */
export const downloadZip = async (trackId) => {
    const response = await axios.get(`${API_BASE}/zip/${trackId}`, {
        responseType: 'blob'
    });
    return response.data;
};

/**
 * Download selected stems as a ZIP archive
 * @param {string} trackId - The track ID
 * @param {Array<string>} stemNames - Array of stem names to include
 * @returns {Promise<Blob>} The ZIP file blob
 */
export const downloadSelectedZip = async (trackId, stemNames) => {
    const response = await axios.post(`${API_BASE}/zip-selected`, {
        id: trackId,
        tracks: stemNames
    }, {
        responseType: 'blob'
    });
    return response.data;
};

/**
 * Delete a track
 * @param {string} trackId - The track ID
 * @returns {Promise<Object>} Response data
 */
export const deleteTrack = async (trackId) => {
    const response = await axios.delete(`${API_BASE}/delete/${trackId}`);
    return response.data;
};




/**
 * Run additional modules on an existing project
 * @param {string} trackId - The track/project ID
 * @param {Array<string>} modules - Array of module IDs to run
 * @returns {Promise<Object>} Response with executed modules and updated stems
 */
export const runModules = async (trackId, modules) => {
    const response = await axios.post(`${API_BASE}/project/${trackId}/run-modules`, { modules });
    return response.data;
};

/**
 * Get project status including executed modules
 * @param {string} trackId - The track/project ID
 * @returns {Promise<Object>} Response with executed_modules and original_file
 */
export const getProjectStatus = async (trackId) => {
    const response = await axios.get(`${API_BASE}/project/${trackId}/status`);
    return response.data;
};
