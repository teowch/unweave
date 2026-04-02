# Unweave Backend

The backend is a Flask API that owns audio processing, project/file lookup, waveform access, download/export endpoints, recovery flows, and SSE updates for the renderer.

## Responsibilities

- Accept file and URL processing requests
- Coordinate stem separation and follow-up module runs
- Expose the project library and project snapshots
- Serve tracked files, waveform JSON, and ZIP exports
- Publish long-running job progress over SSE
- Report system and GPU status to the desktop UI

## Important Directories

- `routes/`: Flask blueprints for projects, audio processing, SSE, and settings
- `services/`: orchestration, project/file access, SSE, and processing services
- `utils/`: FFmpeg, hardware, waveform, sanitization, and related helpers
- `requirements*.txt`: platform-specific dependency definitions

## Environment

- Python 3.10+
- Virtual environment expected at `backend/.venv`

Set up:

```bash
cd backend
python -m venv .venv
```

Activate:

```bash
# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

Install dependencies:

```bash
# Windows / Linux
pip install -r requirements-win-linux.txt

# macOS
pip install -r requirements-macos.txt
```

The backend dependency layout is:

- `requirements-base.txt`: shared backend/runtime dependencies
- `requirements-win-linux.txt`: Windows and Linux GPU/runtime stack, including `requirements-base.txt`
- `requirements-macos.txt`: macOS runtime stack, including `requirements-base.txt`
- `requirements.txt`: combined/general backend requirements file that is also present in the repo

## Running the API

```bash
python api.py
```

Defaults:

- Host: Flask default host
- Port: `5000`
- Health endpoint: `GET /api/health`

Optional environment variables:

- `PORT`: override the backend port
- `FLASK_DEBUG=true`: enable debug mode
- `ELECTRON_MODE=1`: marks packaged/sidecar execution and changes FFmpeg path resolution

## Core Route Groups

- `projects_routes.py`
  - history, project status, project snapshot, downloads, waveform, ZIP export, delete
- `audio_routes.py`
  - modules, active processing snapshot, process file, process URL, run modules, unify, recovery actions
- `sse_routes.py`
  - SSE stream subscription by job ID
- `settings_routes.py`
  - system info, GPU setup status, GPU re-detection

## Runtime Notes

- FFmpeg is resolved from bundled/vendor paths first, with a dev fallback to `static_ffmpeg`.
- The backend now reads project state from the current service layer instead of relying on ad hoc folder scans alone.
- Consistency repair is triggered on concrete missing tracked files, returning a `409` with `consistency_checking` metadata when applicable.

## Related Docs

- [Project Overview](../README.md)
- [Frontend Guide](../frontend/README.md)
- [API Reference](../API_DOCUMENTATION.md)
