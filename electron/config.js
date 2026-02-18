const path = require('path');

/**
 * Centralized configuration for the Electron app.
 * All ports, URLs, paths, and timeouts in ONE place.
 */

const isDev = process.env.NODE_ENV === 'development';

// ── Network ────────────────────────────────────────────────────
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '5000', 10);
const FRONTEND_PORT = parseInt(process.env.FRONTEND_PORT || '5173', 10);

const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const BACKEND_HEALTH_URL = `${BACKEND_URL}/api/health`;
const FRONTEND_DEV_URL = `http://localhost:${FRONTEND_PORT}`;

// ── Paths ──────────────────────────────────────────────────────
// Project root (one level up from electron/)
const PROJECT_ROOT = path.join(__dirname, '..');

const paths = {
    // Python executable
    pythonExe: isDev
        ? (process.platform === 'win32'
            ? path.join(PROJECT_ROOT, 'backend', '.venv', 'Scripts', 'python.exe')
            : path.join(PROJECT_ROOT, 'backend', '.venv', 'bin', 'python3'))
        : (process.platform === 'win32'
            ? path.join(process.resourcesPath, 'python', 'python.exe')
            : path.join(process.resourcesPath, 'python', 'bin', 'python3')),

    // Backend API script
    apiScript: isDev
        ? path.join(PROJECT_ROOT, 'backend', 'api.py')
        : path.join(process.resourcesPath, 'backend', 'api.py'),

    // Backend working directory
    backendCwd: isDev
        ? path.join(PROJECT_ROOT, 'backend')
        : path.join(process.resourcesPath, 'backend'),

    // Frontend dist (for production loading)
    frontendDist: isDev
        ? path.join(PROJECT_ROOT, 'frontend', 'dist')
        : path.join(process.resourcesPath, 'frontend-dist'),

    // Library (audio projects)
    library: isDev
        ? path.join(PROJECT_ROOT, 'Library')
        : path.join(PROJECT_ROOT, 'Library'), // TODO: Phase 6 — user-configurable
};

// ── Sidecar Settings ───────────────────────────────────────────
const sidecar = {
    maxRestarts: 3,
    healthPollIntervalMs: 500,
    healthTimeoutMs: 30000,
    shutdownGracePeriodMs: 5000,
};

// ── Window Settings ────────────────────────────────────────────
const window = {
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0f',
};

module.exports = {
    isDev,
    BACKEND_PORT,
    FRONTEND_PORT,
    BACKEND_URL,
    BACKEND_HEALTH_URL,
    FRONTEND_DEV_URL,
    paths,
    sidecar,
    window,
};
