# Unweave Backend

The backend is a Flask-based API handling audio processing, file management, and real-time state updates.

## Setup

1. **Python Environment**: Ensure Python 3.10+ is installed.
2. **Virtual Environment**:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate  # Windows
   source .venv/bin/activate  # Linux/Mac
   ```
3. **Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
   This setup includes PyTorch with CUDA 12.4 support for GPU acceleration.

4. **FFmpeg**:
   - The project uses `static-ffmpeg` to automatically provision FFmpeg binaries.
   - For optimal performance or troubleshooting, installing FFmpeg system-wide is recommended.

## Key Services

- **`AudioService`**: Orchestrates `audio-separator`, manages demultiplexing, and handles download logic.
- **`AudioProject`**: Encapsulates the state of a single separation project, including tracking executed modules and metadata.
- **`SSEManager` & `SSEMessageHandler`**: Manages Server-Sent Events to push progress updates to the frontend.
- **`ProjectService`**: Manages file system operations, project creation, retrieval, and deletion.

## Running the Server

```bash
python api.py
```
- Runs on `http://127.0.0.1:5000` by default.
- Set `FLASK_DEBUG=true` environment variable to enable debug mode.

## Configuration

- **`models.json`**: local cache of model info (downloaded/managed by `audio-separator`).
- **`modules.py`**: Registry of available processing modules. Add new models/separators here.
