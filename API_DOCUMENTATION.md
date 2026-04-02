# Unweave API Reference

All backend endpoints are served from the Flask app under the `/api` prefix.

Base URL in development:

```text
http://127.0.0.1:5000/api
```

## Health

### `GET /health`

Simple backend health check used by Electron startup and local development checks.

## Project and File Endpoints

### `GET /history`

Returns the library/history list from the current project store.

### `GET /project/<project_id>/status`

Returns the lightweight status payload for a project, including executed and available modules.

### `GET /project/<project_id>`

Returns the canonical project snapshot used by the editor.

Typical response includes:

- `history`
- `files`
- `project`
- `state`
- `status`

### `GET /waveform/<project_id>/<stem_name>`

Returns waveform JSON for a tracked file. If a tracked file is missing on disk, the backend may respond with `409` and a `consistency_checking` payload while repair is triggered.

### `GET /download/<folder_id>/<filename>`

Streams a tracked project file.

### `GET /zip/<folder_id>`

Creates and downloads a ZIP archive for the full project.

### `POST /zip-selected`

Creates and downloads a ZIP archive for selected tracks.

Payload:

```json
{
  "id": "project_id",
  "tracks": ["vocals.wav", "drums.wav"]
}
```

### `DELETE /delete/<folder_id>`

Deletes a project.

## Processing Endpoints

### `GET /modules`

Returns the available module list in API-friendly format.

### `GET /active`

Returns the current active processing snapshot:

```json
{
  "active_job": {}
}
```

### `POST /process`

Starts processing for an uploaded audio file.

Content type:

```text
multipart/form-data
```

Form fields:

- `file`
- `modules`: JSON array string
- `temp_project_id`

### `POST /process-url`

Starts processing from a remote URL.

Payload:

```json
{
  "url": "https://example.com/audio",
  "modules": ["vocals", "drums"],
  "temp_project_id": "temp_job_id"
}
```

### `POST /project/<project_id>/run-modules`

Runs additional modules against an existing project.

Payload:

```json
{
  "modules": ["bass", "piano"]
}
```

### `POST /unify`

Creates a unified file from selected tracks.

Payload:

```json
{
  "id": "project_id",
  "tracks": ["vocals.wav", "drums.wav"]
}
```

## Processing Recovery Endpoints

### `POST /processing/<job_id>/recover`

Recovers an interrupted processing job.

Payload:

```json
{
  "recoveryMode": "safe_resume"
}
```

Allowed values:

- `safe_resume`
- `rerun_from_source`

### `POST /processing/<job_id>/discard`

Discards a recoverable processing job and deletes its backing project state when appropriate.

### `POST /processing/<job_id>/acknowledge`

Acknowledge a completed processing job so it no longer appears in the global active-processing surface.

## SSE

### `GET /sse/<job_id>`

Subscribes to the processing event stream for a specific job ID.

Response type:

```text
text/event-stream
```

The exact event set is driven by the backend SSE manager, but this stream is used for progress, state transitions, and completion updates during processing and recovery flows.

## Settings and Hardware

### `GET /settings/system-info`

Returns runtime and hardware information used by the settings UI.

Typical fields include:

- `gpu_accelerated`
- `execution_provider`
- `gpu_name`
- `acceleration_message`

### `GET /gpu/setup-status`

Returns current in-memory GPU setup status used by the setup/settings flows.

### `POST /gpu/re-setup`

Triggers GPU re-detection and returns whether the runtime should change.

## Related Docs

- [Project Overview](README.md)
- [Backend Guide](backend/README.md)
- [Frontend Guide](frontend/README.md)
