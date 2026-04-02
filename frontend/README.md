# Unweave Frontend

The frontend is a React 19 application built with Vite. It is the renderer UI used both in browser-based development and inside the Electron desktop shell.

## Responsibilities

- Upload files and submit URL processing requests
- Display the project library and project detail views
- Render the editor workspace for stems, waveform playback, volume, mute/solo, and pan controls
- Subscribe to backend SSE updates for long-running processing
- Surface settings and hardware/runtime information

## Setup

```bash
cd frontend
npm install
```

## Development

Run the Vite dev server:

```bash
npm run dev
```

Default URL:

- `http://localhost:5173`

In desktop development, Electron points at this renderer while the backend runs separately on `http://127.0.0.1:5000`.

## Production Build

```bash
npm run build
```

Build output goes to `frontend/dist/` and is bundled into Electron packages from there.

## Main Areas

- `src/App.jsx`: top-level route composition and app shell
- `src/components/`: feature UI such as upload, library, editor, settings, and current-processing views
- `src/hooks/`: playback and project data hooks
- `src/services/api.js`: REST client and environment-aware URL helpers
- `src/services/sse.js`: SSE subscription logic

## Editor Notes

The editor currently supports:

- per-stem waveform loading
- shared transport playback
- per-stem volume, mute, solo, and pan state
- waveform seeking and stem download/remove actions

## Related Docs

- [Project Overview](../README.md)
- [Backend Guide](../backend/README.md)
- [API Reference](../API_DOCUMENTATION.md)
