# Unweave

Unweave is a local-first desktop app for audio separation. It packages an Electron shell, a Flask backend, and a React renderer into one workstation-oriented tool for splitting tracks into stems, browsing a local project library, and working with outputs on disk.

## What It Does

- Separate uploaded audio files into stems with `audio-separator` and related model backends.
- Download and process supported URLs, including video/audio sources handled by `yt-dlp`.
- Keep project and file state locally so the editor, library, and recovery flows can operate without cloud services.
- Stream processing progress to the UI over SSE.
- Package the frontend, backend, Python runtime, and supporting assets into an Electron build.

## Project Layout

- `frontend/`: React 19 + Vite renderer UI.
- `backend/`: Flask API, audio pipeline, project services, and utilities.
- `electron/`: desktop shell, backend sidecar startup, preload bridge, packaging config.
- `dist-electron/`: packaged Electron outputs.
- `docs/`: screenshots and supporting project assets.

## Documentation Index

- [Backend Guide](backend/README.md)
- [Frontend Guide](frontend/README.md)
- [API Reference](API_DOCUMENTATION.md)

## Prerequisites

- Node.js 18+
- Python 3.10+
- npm
- A Python virtual environment at `backend/.venv`

Optional:

- NVIDIA CUDA 12.x or another supported GPU runtime if you want hardware acceleration
- System FFmpeg as a fallback, though the app can bundle/provision FFmpeg for packaged use

## Development Setup

### 1. Install Node Dependencies

At the repo root:

```bash
npm install
```

In the frontend:

```bash
cd frontend
npm install
```

In Electron:

```bash
cd electron
npm install
```

### 2. Set Up the Backend Environment

```bash
cd backend
python -m venv .venv
```

Activate it:

```bash
# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

Install backend dependencies:

```bash
# Windows / Linux
pip install -r requirements-win-linux.txt

# macOS
pip install -r requirements-macos.txt
```

These platform files include the shared backend dependency set from `requirements-base.txt`.

## Running in Development

### Backend + Frontend

From the repo root:

```bash
npm run start
```

This starts:

- Flask backend on `http://127.0.0.1:5000`
- Vite frontend on `http://localhost:5173`

### Electron Shell

In another terminal:

```bash
cd electron
npm run dev
```

Electron will launch the desktop shell and connect to the local backend/frontend dev servers.

## Production Builds

Build the renderer:

```bash
cd frontend
npm run build
```

Create a Windows installer:

```bash
cd electron
npm run dist:win
```

Other Electron packaging commands:

```bash
npm run pack
npm run dist:mac
npm run dist:linux
```

Packaged output is written to `dist-electron/`.

## Architecture Summary

- `frontend/` handles library, upload, editor, and settings UI.
- `backend/` exposes REST and SSE endpoints for project state, processing, downloads, recovery, and system info.
- `electron/` manages the desktop window, startup mode, backend sidecar lifecycle, and custom protocol/file access.

The current migration direction is to use SQLite as the source of truth for project and file metadata while audio artifacts remain on disk.

## Notes

- The root `npm run start` command is for backend + frontend development, not packaged Electron output.
- The Electron package version is defined in [electron/package.json](/E:/dev/unweave/electron/package.json).
- API endpoints are documented in [API_DOCUMENTATION.md](API_DOCUMENTATION.md).
