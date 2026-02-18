const { spawn } = require('child_process');
const http = require('http');
const config = require('./config');

// ── State ──────────────────────────────────────────────────────
let pythonProcess = null;
let restartCount = 0;

/**
 * Start the Python Flask backend as a child process.
 */
function startBackend() {
    if (pythonProcess) {
        console.warn('[Sidecar] Backend already running (PID:', pythonProcess.pid, ')');
        return;
    }

    const pythonExe = config.paths.pythonExe;
    const apiScript = config.paths.apiScript;
    const cwd = config.paths.backendCwd;

    console.log('[Sidecar] Spawning Python backend...');
    console.log('[Sidecar]   Python:', pythonExe);
    console.log('[Sidecar]   Script:', apiScript);
    console.log('[Sidecar]   CWD:   ', cwd);

    pythonProcess = spawn(pythonExe, [apiScript], {
        cwd,
        env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',     // Force unbuffered output for real-time logs
            ELECTRON_MODE: '1',        // Let the backend know it's running inside Electron
            PORT: String(config.BACKEND_PORT),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    pythonProcess.stdout.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => console.log(`[Backend] ${line}`));
    });

    pythonProcess.stderr.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => console.error(`[Backend] ${line}`));
    });

    pythonProcess.on('error', (err) => {
        console.error('[Sidecar] Failed to start Python:', err.message);
        pythonProcess = null;
    });

    pythonProcess.on('close', (code, signal) => {
        console.log(`[Sidecar] Backend exited (code: ${code}, signal: ${signal})`);
        pythonProcess = null;

        // Auto-restart if it crashed unexpectedly (not killed by us)
        if (code !== 0 && code !== null && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
            if (restartCount < config.sidecar.maxRestarts) {
                restartCount++;
                const delay = Math.min(1000 * Math.pow(2, restartCount - 1), 8000);
                console.log(`[Sidecar] Restarting in ${delay}ms (attempt ${restartCount}/${config.sidecar.maxRestarts})...`);
                setTimeout(() => startBackend(), delay);
            } else {
                console.error('[Sidecar] Max restarts reached. Backend will not restart.');
            }
        }
    });
}

/**
 * Stop the Python backend gracefully.
 */
function stopBackend() {
    if (!pythonProcess) return;

    console.log('[Sidecar] Stopping backend (PID:', pythonProcess.pid, ')...');
    restartCount = config.sidecar.maxRestarts; // Prevent auto-restart on intentional kill

    if (process.platform === 'win32') {
        // On Windows, SIGTERM doesn't work well — use taskkill
        spawn('taskkill', ['/pid', String(pythonProcess.pid), '/f', '/t']);
    } else {
        pythonProcess.kill('SIGTERM');
        // Force kill after grace period if still running
        setTimeout(() => {
            if (pythonProcess && !pythonProcess.killed) {
                console.warn('[Sidecar] Force-killing backend...');
                pythonProcess.kill('SIGKILL');
            }
        }, config.sidecar.shutdownGracePeriodMs);
    }
}

/**
 * Restart the Python backend (stop → wait → start).
 * Used after GPU package installation so new packages are loaded.
 * @returns {Promise<void>} Resolves when backend is healthy again.
 */
function restartBackend() {
    return new Promise((resolve, reject) => {
        console.log('[Sidecar] Restarting backend to load new GPU packages...');

        if (!pythonProcess) {
            // Not running — just start fresh
            restartCount = 0;
            startBackend();
            waitForBackend().then(resolve).catch(reject);
            return;
        }

        // Listen for the process to actually exit, then start fresh
        pythonProcess.once('close', () => {
            console.log('[Sidecar] Backend stopped. Starting fresh...');
            restartCount = 0;
            startBackend();
            waitForBackend().then(resolve).catch(reject);
        });

        stopBackend();
    });
}

/**
 * Poll the backend health endpoint until it responds with 200.
 * @returns {Promise<void>} Resolves when backend is healthy, rejects on timeout.
 */
function waitForBackend() {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const poll = () => {
            if (Date.now() - startTime > config.sidecar.healthTimeoutMs) {
                return reject(new Error(
                    `Backend did not become healthy within ${config.sidecar.healthTimeoutMs / 1000}s`
                ));
            }

            const req = http.get(config.BACKEND_HEALTH_URL, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    setTimeout(poll, config.sidecar.healthPollIntervalMs);
                }
            });

            req.on('error', () => {
                // Connection refused — backend not ready yet
                setTimeout(poll, config.sidecar.healthPollIntervalMs);
            });

            req.setTimeout(2000, () => {
                req.destroy();
                setTimeout(poll, config.sidecar.healthPollIntervalMs);
            });
        };

        poll();
    });
}

module.exports = { startBackend, stopBackend, restartBackend, waitForBackend };
