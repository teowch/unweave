const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script — exposes a safe API to the renderer process.
 * 
 * The renderer (React app) can access these via `window.electronAPI`.
 * This keeps Node.js APIs out of the renderer for security.
 */
contextBridge.exposeInMainWorld('electronAPI', {
    // ── Platform Info ──
    isElectron: true,
    platform: process.platform,  // 'win32', 'darwin', 'linux'

    // ── Setup State ──
    // Set synchronously by main process via --setup-required launch arg.
    // True = first-run setup hasn't completed, app should show setup page.
    isSetupRequired: process.argv.includes('--setup-required'),

    // ── IPC: Backend Status ──
    onBackendStatus: (callback) => {
        ipcRenderer.on('backend-status', (_event, status) => callback(status));
    },

    // ── IPC: GPU Setup ──
    onGpuSetupProgress: (callback) => {
        ipcRenderer.on('gpu-setup-progress', (_event, progress) => callback(progress));
    },
    // Renderer asks main process to start GPU setup
    startGpuSetup: (isRedetect = false) => {
        ipcRenderer.send('start-gpu-setup', { isRedetect });
    },
    // Fires when setup completes successfully (so App can ungate routes)
    onSetupComplete: (callback) => {
        ipcRenderer.on('setup-complete', () => callback());
    },

    // ── IPC: App Info ──
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getAppPath: () => ipcRenderer.invoke('get-app-path'),
});

