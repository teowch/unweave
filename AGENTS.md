<!-- GSD:project-start source:PROJECT.md -->
## Project

**Unweave**

Unweave is a local-first desktop audio separation app built with Electron, a Flask backend, and a React frontend. It processes tracks into stems and lets the user browse and work with project outputs locally; the current effort is to replace filesystem metadata files with SQLite as the source of truth for project and file state.

**Core Value:** Project and library state must be reliable, centralized, and consistent so the app can manage local audio projects without fragile folder-scanning or per-project metadata files.

### Constraints

- **Architecture**: Keep the existing Electron + Flask + React application structure ? this migration should fit the current local-app model
- **Persistence boundary**: SQLite stores project and file metadata only ? audio and waveform artifacts remain on disk
- **Behavior continuity**: User-facing frontend behavior should continue to work as it does today even if frontend internals and API contracts change
- **Authority**: SQLite is the source of truth for projects and files ? folder scans should not remain the primary library-building mechanism
- **Repair policy**: Consistency repair runs only on concrete missing-file errors from SQLite-backed lookups, not as a general background reconciliation process
- **Module tracking**: Executed module history will no longer be stored explicitly ? backend must derive module state from filename conventions
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- Python 3.10+ - Flask backend and audio-processing pipeline in `backend/api.py`, `backend/services/AudioService.py`, `backend/AudioProcessor.py`, and related modules.
- JavaScript (ES modules/CommonJS) - React/Vite frontend in `frontend/src/` and Electron shell in `electron/`.
- JSON - project configuration and model metadata in `package.json`, `frontend/package.json`, `electron/package.json`, `backend/models.json`, and root `models.json`.
- CSS - frontend styling in `frontend/src/App.css`, `frontend/src/index.css`, and component-local `*.css` files under `frontend/src/components/`.
## Runtime
- Node.js 18+ - top-level dev orchestration from `package.json`, frontend dev/build via `frontend/package.json`, and Electron packaging/runtime via `electron/package.json`.
- Python 3.10+ - backend API and ML tooling launched from `backend/api.py` and embedded by the Electron sidecar in `electron/sidecar.js`.
- npm - lockfiles present at `package-lock.json`, `frontend/package-lock.json`, and `electron/package-lock.json`.
- pip - requirements files in `backend/requirements.txt`, `backend/requirements-base.txt`, `backend/requirements-win-linux.txt`, and `backend/requirements-macos.txt`.
## Frameworks
- Flask 3.x - REST API and blueprint composition in `backend/api.py` and `backend/routes/*.py`.
- React 19 - renderer UI in `frontend/src/App.jsx` and `frontend/src/components/`.
- Electron 34 - desktop shell, IPC, and sidecar process management in `electron/main.js`, `electron/preload.js`, and `electron/sidecar.js`.
- Not detected - no dedicated automated test framework is declared in `package.json`, `frontend/package.json`, `electron/package.json`, or backend requirements.
- Vite 5 - frontend dev server and production build in `frontend/package.json` and `frontend/vite.config.js`.
- ESLint 9 - frontend linting in `frontend/package.json` and `frontend/eslint.config.js`.
- concurrently - root dev workflow that starts backend and frontend together from `package.json`.
- electron-builder 25 - desktop packaging in `electron/package.json`.
- cross-env - Electron dev-mode environment setup in `electron/package.json`.
## Key Dependencies
- `audio-separator` / `audio-separator[gpu]` - primary model execution engine referenced by requirements in `backend/requirements.txt` and `backend/requirements-base.txt`, orchestrated through `backend/AudioProcessor.py` and `backend/services/AudioService.py`.
- `torch`, `torchaudio`, `torchvision` - PyTorch runtime selected per platform in `backend/requirements.txt`, `backend/requirements-win-linux.txt`, `backend/requirements-macos.txt`, and installed dynamically from `electron/first-run-setup.js`.
- `demucs` - separation model dependency declared in `backend/requirements.txt` and `backend/requirements-base.txt`.
- `yt-dlp` - URL/audio download dependency used directly in `backend/services/AudioService.py`.
- `soundfile` and `numpy` - waveform and stem manipulation in `backend/services/AudioService.py`.
- `flask-cors` - cross-origin access for local dev and custom Electron schemes in `backend/api.py`.
- `axios` - frontend REST client in `frontend/src/services/api.js`.
- `react-router-dom` - client routing in `frontend/src/App.jsx`.
- `wavesurfer.js` - waveform/editor UI support in the frontend dependency graph from `frontend/package.json`.
- `@dnd-kit/core` and `@dnd-kit/utilities` - drag/drop interactions declared in `frontend/package.json`.
- `static_ffmpeg` - fallback FFmpeg provisioning in `backend/api.py`.
- `onnxruntime`, `onnxruntime-gpu`, and `onnxruntime-silicon` - inference backends selected by platform in backend requirement files and GPU setup flows.
## Configuration
- Backend network settings come from `PORT` and `FLASK_DEBUG` in `backend/api.py`.
- Electron runtime mode comes from `NODE_ENV`, `BACKEND_PORT`, and `FRONTEND_PORT` in `electron/config.js`.
- Electron marks embedded execution with `ELECTRON_MODE=1` in `electron/sidecar.js`, which changes FFmpeg path resolution in `backend/api.py`.
- A backend-local setup marker `.gpu-setup-complete` is written and read by `electron/first-run-setup.js`.
- Root dev commands are defined in `package.json`.
- Frontend build/lint settings live in `frontend/package.json`, `frontend/vite.config.js`, and `frontend/eslint.config.js`.
- Electron packaging configuration lives inline in `electron/package.json`.
- Platform-specific FFmpeg bundling is handled by `backend/utils/ffmpeg_setup.py` and `backend/download.py`.
## Platform Requirements
- Python virtual environment expected at `backend/.venv` by root `package.json` scripts and `electron/config.js`.
- Node/npm required for root, `frontend/`, and `electron/` package installs.
- FFmpeg binaries are resolved from `backend/vendor/ffmpeg/*` by `backend/utils/ffmpeg_setup.py`, with fallback to `static_ffmpeg` in `backend/api.py`.
- GPU acceleration depends on platform-specific PyTorch/ONNX packages from backend requirements and `electron/first-run-setup.js`.
- Desktop-first distribution target via Electron packages in `electron/package.json` for Windows NSIS, macOS DMG, and Linux AppImage/deb.
- Production app bundles `backend/`, embedded Python resources, and `frontend/dist` into Electron `extraResources` per `electron/package.json`.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Use PascalCase for React feature components and CSS pairs, for example `frontend/src/components/LibraryView/LibraryView.jsx` and `frontend/src/components/LibraryView/LibraryView.css`.
- Use `useX` camelCase names for React hooks, for example `frontend/src/hooks/useAudioPlayer.js` and `frontend/src/hooks/useProjectData.js`.
- Use snake_case for backend route and utility modules such as `backend/routes/audio_routes.py` and `backend/utils/hardware.py`.
- Keep backend service/domain filenames aligned with the exported class name, for example `backend/services/ProjectService.py` and `backend/AudioProject.py`.
- Frontend functions use camelCase and are often declared as arrow functions, for example `refreshLibrary` and `handleUnify` in `frontend/src/App.jsx`.
- Backend functions and methods use snake_case, for example `process_separation` in `backend/services/AudioService.py` and `get_project_status` in `backend/routes/projects_routes.py`.
- Frontend local variables and state use camelCase, for example `setupRequired` in `frontend/src/App.jsx`.
- Backend locals use snake_case, for example `downloaded_filepath` and `modules_to_run` in `backend/routes/audio_routes.py`.
- No TypeScript or Python typing discipline is enforced across the codebase; Python uses selective annotations in files like `backend/services/AudioService.py`, while the frontend is plain JavaScript.
## Code Style
- Frontend style is the de facto formatter output from the Vite/ESLint starter, visible in `frontend/src/main.jsx` and `frontend/src/components/UploadView/UploadView.jsx`.
- JavaScript code uses semicolons inconsistently: many frontend service files include semicolons (`frontend/src/services/api.js`), while top-level app files often omit them (`frontend/src/App.jsx`).
- Python follows PEP 8 loosely but without autoformat guarantees; line wrapping and comment style vary between `backend/routes/audio_routes.py` and `backend/services/ProjectService.py`.
- Frontend linting is the only configured static analysis, defined in `frontend/eslint.config.js`.
- Follow the existing rule set: recommended JS rules, React Hooks rules, React Refresh constraints, and `no-unused-vars` with an uppercase ignore pattern.
- No backend linter, formatter, or type checker is configured in repo manifests.
## Import Organization
- None detected; imports are relative across the frontend and backend codebases.
## Error Handling
- Backend handlers wrap route bodies in `try`/`except` and return JSON error payloads, as in `backend/routes/audio_routes.py` and `backend/routes/projects_routes.py`.
- Frontend network calls rely on the Axios response interceptor in `frontend/src/services/api.js` and then surface failures with `alert`, `console.error`, or local component state.
- Electron code logs and continues where possible, for example backend restart failure handling in `electron/main.js`.
## Logging
- Use `console.error` for request and UI failures, as in `frontend/src/services/api.js` and `frontend/src/components/SettingsView/SettingsView.jsx`.
- Use `console.log` and `console.warn` generously in Electron lifecycle code such as `electron/sidecar.js` and `electron/main.js`.
- Use Python `logger` only in some services, while route and service code still prints directly in `backend/api.py` and `backend/services/ProjectService.py`.
## Comments
- Comments usually explain runtime mode branches or subtle synchronization behavior, for example router selection in `frontend/src/main.jsx` and playback synchronization in `frontend/src/hooks/useAudioPlayer.js`.
- Prefer concise comments for platform-specific behavior and cross-process handshakes; the repo already contains those patterns.
- JSDoc-style block comments are used heavily in `frontend/src/services/api.js`.
- Python docstring coverage exists on public helpers and routes, but it is inconsistent across backend modules.
## Function Design
## Module Design
## Consistency Guidance
- Match the surrounding file?s style instead of trying to normalize the whole repo in one change.
- In frontend files, preserve the existing component-folder pattern of colocated `.jsx` and `.css`.
- In backend files, keep route parsing in `backend/routes/` and move reusable logic into `backend/services/` or `backend/utils/`.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- The renderer communicates only with the local backend over HTTP and SSE through `frontend/src/services/api.js` and `frontend/src/services/sse.js`
- Desktop mode adds a Node/Electron control plane for backend lifecycle, setup, and local-file streaming in `electron/main.js`, `electron/sidecar.js`, and `electron/protocol.js`
- Audio processing is organized around project folders keyed by `project_id`, managed by `backend/services/ProjectService.py`
## Layers
- Purpose: route between views, manage interaction state, and render upload/library/editor/settings screens
- Location: `frontend/src/App.jsx`, `frontend/src/components/`, `frontend/src/hooks/`
- Contains: route composition, feature components, local UI state, playback state hooks
- Depends on: `frontend/src/services/api.js`, `frontend/src/services/sse.js`, and `window.electronAPI`
- Used by: `frontend/src/main.jsx`
- Purpose: isolate HTTP endpoints, SSE connection logic, and Electron mode detection
- Location: `frontend/src/services/api.js` and `frontend/src/services/sse.js`
- Contains: Axios wrappers, base URLs, EventSource retry logic, direct-audio URL helpers
- Depends on: backend REST/SSE endpoints and Electron preload bridge
- Used by: components such as `frontend/src/components/UploadView/UploadView.jsx` and hooks such as `frontend/src/hooks/useProjectData.js`
- Purpose: launch the desktop window, manage the Python sidecar, expose preload-safe APIs, and handle first-run GPU setup
- Location: `electron/main.js`, `electron/sidecar.js`, `electron/config.js`, `electron/first-run-setup.js`, `electron/preload.js`, `electron/protocol.js`
- Contains: app lifecycle, IPC handlers, health polling, setup marker management, custom protocol registration
- Depends on: packaged frontend build, embedded or local Python runtime, backend health endpoint
- Used by: the renderer through `window.electronAPI` and by packaged desktop startup
- Purpose: expose REST and SSE endpoints and translate transport details into service calls
- Location: `backend/api.py` and `backend/routes/*.py`
- Contains: blueprints for projects, audio processing, SSE, and settings/system info
- Depends on: singleton services from `backend/services/container.py`
- Used by: frontend service layer and Electron health polling
- Purpose: manage project folders, file access, processing orchestration, and event publication
- Location: `backend/services/`
- Contains: `ProjectService`, `FileService`, `AudioService`, `SSEManager`, and `SSEMessageHandler`
- Depends on: `AudioProject`, `AudioProcessor`, filesystem, and ML/media libraries
- Used by: route handlers in `backend/routes/*.py`
- Purpose: represent project state, available module graphs, and low-level processing helpers
- Location: `backend/AudioProject.py`, `backend/AudioProcessor.py`, `backend/modules.py`, and `backend/utils/`
- Contains: module registry, waveform generation, sanitization, hardware/FFmpeg helpers
- Depends on: audio libraries and model runtimes
- Used by: `backend/services/AudioService.py` and route handlers
## Data Flow
- Frontend state is component- and hook-local (`useState`, `useEffect`, `useMemo`) with no global store in `frontend/src/App.jsx`, `frontend/src/components/EditorView/EditorView.jsx`, and `frontend/src/hooks/useAudioPlayer.js`
- Backend mutable state is process-local in service singletons created by `backend/services/container.py`
- Durable state lives in filesystem project folders plus `metadata.json` managed by `backend/services/ProjectService.py` and `backend/AudioProject.py`
## Key Abstractions
- Purpose: every track/project is a folder containing original audio, derived stems, waveform JSON, and metadata
- Examples: `backend/services/ProjectService.py`, `backend/routes/projects_routes.py`, `backend/services/FileService.py`
- Pattern: filesystem-backed aggregate keyed by `project_id`
- Purpose: define selectable processing modules, required parent modules, output naming, and API-facing metadata
- Examples: `backend/modules.py`
- Pattern: declarative registry plus dependency resolution helpers
- Purpose: bridge long-running processing to UI progress bars
- Examples: `backend/services/SSEManager.py`, `backend/services/SSEMessageHandler.py`, `frontend/src/services/sse.js`
- Pattern: per-job event queue with reconnection on job ID changes
## Entry Points
- Location: `frontend/src/main.jsx`
- Triggers: Vite dev server or packaged frontend load
- Responsibilities: choose `BrowserRouter` vs `HashRouter` and mount `App`
- Location: `electron/main.js`
- Triggers: `npm run dev` or packaged Electron startup
- Responsibilities: register custom scheme, manage backend startup, gate first-run setup, create the main window
- Location: `backend/api.py`
- Triggers: direct Python launch from root script, Electron sidecar, or backend dev command
- Responsibilities: configure FFmpeg paths, create Flask app, register blueprints, and expose `/api/health`
## Error Handling
- Flask routes return `{error: ...}` payloads with HTTP status codes in `backend/routes/audio_routes.py`, `backend/routes/projects_routes.py`, and `backend/routes/settings_routes.py`
- Axios interceptor normalizes backend and network failures in `frontend/src/services/api.js`
- Electron sidecar watches process exit codes and retries failed backend startups in `electron/sidecar.js`
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
