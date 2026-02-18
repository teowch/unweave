const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { startBackend, stopBackend, restartBackend, waitForBackend } = require('./sidecar');
const { registerProtocol, registerScheme } = require('./protocol');
const { isSetupComplete, runFirstTimeSetup } = require('./first-run-setup');

// Register privileged schemes BEFORE app is ready
registerScheme();

// ── IPC Handlers ──────────────────────────────────────────────
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-app-path', () => app.getAppPath());

// GPU setup: triggered by SetupView (first-run or re-detect from Settings)
ipcMain.on('start-gpu-setup', async (event, { isRedetect } = {}) => {
    try {
        console.log(`[Main] GPU setup requested (redetect=${!!isRedetect})`);
        const gpuInfo = await runFirstTimeSetup((update) => {
            // Forward progress to the renderer
            event.sender.send('gpu-setup-progress', update);
        });

        // Restart backend so it picks up the new GPU packages
        if (!config.isDev) {
            event.sender.send('gpu-setup-progress', {
                step: 'Restarting backend', detail: 'Loading new GPU packages...', progress: 97,
            });
            try {
                await restartBackend();
                console.log('[Main] Backend restarted with GPU packages.');
            } catch (err) {
                console.error('[Main] Backend restart failed:', err.message);
            }
        }

        event.sender.send('gpu-setup-progress', {
            step: 'Complete', detail: 'GPU setup finished', progress: 100, gpuInfo,
        });
        // Tell App.jsx to ungate routes
        event.sender.send('setup-complete');
        console.log('[Main] GPU setup complete.');
    } catch (err) {
        console.error('[Main] GPU setup failed:', err);
        event.sender.send('gpu-setup-progress', {
            step: 'Error', detail: err.message, progress: 0,
        });
        // Still ungate — CPU fallback works
        event.sender.send('setup-complete');
    }
});

let mainWindow = null;

// Check setup state once at startup (before creating window).
// Works in both dev and prod — marker file is in backendCwd.
const needsSetup = !isSetupComplete();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: config.window.width,
        height: config.window.height,
        minWidth: config.window.minWidth,
        minHeight: config.window.minHeight,
        title: 'Unweave',
        backgroundColor: config.window.backgroundColor,
        show: false, // Don't show until ready
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false, // Needed for preload to use require()
            // Pass setup-required flag to preload via command line args
            additionalArguments: needsSetup ? ['--setup-required'] : [],
        },
    });

    // Show when ready to avoid white flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Load the frontend
    if (config.isDev) {
        mainWindow.loadURL(config.FRONTEND_DEV_URL);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(config.paths.frontendDist, 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ── App Lifecycle ─────────────────────────────────────────────

app.whenReady().then(async () => {
    // Register custom protocol for serving local files
    registerProtocol();

    // In dev mode: expect backend + frontend to be started manually.
    // In prod mode: spawn the Python sidecar.
    if (!config.isDev) {
        console.log('[Main] ── Path Diagnostics ──');
        console.log('[Main]   pythonExe:', config.paths.pythonExe, '| exists:', fs.existsSync(config.paths.pythonExe));
        console.log('[Main]   apiScript:', config.paths.apiScript, '| exists:', fs.existsSync(config.paths.apiScript));
        console.log('[Main]   setupComplete:', !needsSetup);

        console.log('[Main] Starting Python backend...');
        startBackend();
    } else {
        console.log(`[Main] Dev mode — expecting backend at ${config.BACKEND_URL} (start it manually).`);
    }

    if (needsSetup) {
        // First-run: show window immediately (setup page doesn't need backend)
        console.log('[Main] First-run setup required — showing setup page.');
        createWindow();
        // Backend will finish starting in background; setup page handles its own flow
    } else {
        // Normal launch: wait for backend, then show window
        try {
            await waitForBackend();
            console.log('[Main] Backend is ready.');
        } catch (err) {
            console.error('[Main] Backend not reachable:', err.message);
            if (config.isDev) {
                console.error('[Main] Make sure to start the backend: cd backend && .venv/Scripts/python.exe api.py');
            }
        }
        createWindow();
    }
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// macOS: Re-create window when dock icon is clicked
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Cleanup: kill the Python backend before exiting
app.on('before-quit', () => {
    console.log('[Main] Shutting down backend...');
    stopBackend();
});

// Handle uncaught errors gracefully
process.on('uncaughtException', (err) => {
    console.error('[Main] Uncaught exception:', err);
});

