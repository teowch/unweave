# Unweave API Documentation

The backend API is built using Flask. All endpoints differ to the `/api` prefix.

**Base URL**: `http://127.0.0.1:5000/api`

## Projects

### List History
Returns a list of all past projects/sessions stored in the history.
- **Endpoint**: `GET /history`
- **Response**:
  ```json
  [
    {
      "id": "20240101_projectname",
      "original": "filename.mp3",
      "date": "2024-01-01...",
      ...
    },
    ...
  ]
  ```

### Get Project Status
Retrieve metadata and execution status for a specific project.
- **Endpoint**: `GET /project/<project_id>/status`
- **Response**:
  ```json
  {
    "id": "20240101_projectname",
    "executed_modules": ["vocals", "drums"],
    "original_file": "filename.mp3"
  }
  ```

### Delete Project
Permanently delete a project and its files.
- **Endpoint**: `DELETE /delete/<folder_id>`
- **Response**: `200 OK` or `404 Not Found`

### Download File
Download a specific file (stem or original) from a project.
- **Endpoint**: `GET /download/<folder_id>/<filename>`

### Download ZIP
Download the entire project folder as a ZIP archive.
- **Endpoint**: `GET /zip/<folder_id>`

### Download Selected ZIP
Download specific tracks from a project as a ZIP archive.
- **Endpoint**: `POST /zip-selected`
- **Payload**:
  ```json
  {
    "id": "project_id",
    "tracks": ["vocals.mp3", "drums.mp3"]
  }
  ```

---

## Audio Processing

### Get Modules
List all available audio processing modules/models.
- **Endpoint**: `GET /modules`
- **Response**:
  ```json
  {
    "modules": [
      { "id": "vocals", "name": "Vocals", "description": "..." },
      ...
    ]
  }
  ```

### Process File
Upload and separate an audio file.
- **Endpoint**: `POST /process`
- **Content-Type**: `multipart/form-data`
- **Form Fields**:
    - `file`: The audio file to upload.
    - `modules`: JSON string of module IDs (e.g., `["vocals", "drums"]`).
    - `temp_project_id`: ID for SSE subscription.

### Process URL
Download and separate audio from a URL (e.g., YouTube).
- **Endpoint**: `POST /process-url`
- **Payload**:
  ```json
  {
    "url": "https://youtube.com/watch?v=...",
    "modules": ["vocals", "drums"],
    "temp_project_id": "temp_id_for_sse"
  }
  ```

### Run Additional Modules
Run new modules on an existing project.
- **Endpoint**: `POST /project/<project_id>/run-modules`
- **Payload**:
  ```json
  {
    "modules": ["bass", "piano"]
  }
  ```

### Unify Tracks
Merge multiple stems into a single track.
- **Endpoint**: `POST /unify`
- **Payload**:
  ```json
  {
    "id": "project_id",
    "tracks": ["vocals.wav", "drums.wav"]
  }
  ```

---

## Settings

### System Info
Get hardware and system configuration details.
- **Endpoint**: `GET /settings/system-info`
- **Response**:
  ```json
  {
    "os": "Windows",
    "gpu_accelerated": true,
    "execution_provider": "CUDAExecutionProvider",
    "acceleration_message": "..."
  }
  ```

---

## Real-time Events (SSE)

### Subscribe to Progress
Subscribe to real-time progress updates for a specific job/project.
- **Endpoint**: `GET /sse/<job_id>`
- **Events**:
    - `progress`: `{"progress": 50, "status": "Separating..."}`
    - `done`: Processing complete.
    - `error`: Error details.
