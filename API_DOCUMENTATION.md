# Track Splitter API Documentation

## Overview

The Track Splitter API is a Flask-based REST API that provides audio processing capabilities. It allows users to upload audio files or YouTube URLs, which are then processed to extract various stems (vocals, instruments, etc.) using AI-powered separation models.

**Base URL:** `http://localhost:5000`

**Technology Stack:**
- Flask (Web Framework)
- Flask-CORS (Cross-Origin Resource Sharing)
- AudioProcessor (Custom audio separation engine)
- yt-dlp (YouTube download)
- soundfile (Audio I/O)
- static-ffmpeg (Audio processing)

---

## Quick Reference

| Method | Endpoint | Purpose | Input | Output |
|--------|----------|---------|-------|--------|
| `GET` | [`/api/history`](#1-get-history) | List all processed tracks | None | Array of track objects |
| `POST` | [`/api/process`](#2-process-audio-file-upload) | Upload & process audio | Audio file (multipart/form-data) | Track ID + stem filenames |
| `POST` | [`/api/process-url`](#3-process-audio-url) | Download & process from URL | JSON: `{url: string}` | Track ID + stem filenames |
| `GET` | [`/api/download/<folder_id>/<filename>`](#4-download-file) | Download a specific file | Path params: folder_id, filename | File (binary) |
| `POST` | [`/api/unify`](#5-unify-tracks) | Mix multiple stems together | JSON: `{id, tracks[]}` | New unified track name |
| `GET` | [`/api/zip/<folder_id>`](#6-download-zip-all-files) | Download all files as ZIP | Path param: folder_id | ZIP file (binary) |
| `POST` | [`/api/zip-selected`](#7-download-zip-selected-files) | Download selected files as ZIP | JSON: `{id, tracks[]}` | ZIP file (binary) |

---

## Configuration

### Directories

- **LIBRARY_FOLDER:** `<project_root>/Library` - Persistent storage for all processed tracks
- **UPLOAD_FOLDER:** `<backend>/uploads` - Temporary storage for uploads
- **OUTPUT_FOLDER:** Same as LIBRARY_FOLDER

### File Structure

Each processed track is stored in a folder with the following structure:
```
Library/
└── {timestamp}_{filename}/
    ├── metadata.json
    ├── {original_file}.wav
    ├── vocals.flac
    ├── instrumental.flac
    └── ... (other stems)
```

---

## State Management

### In-Memory State

- **TRACK_SESSIONS:** Dictionary mapping `folder_id` → `{path, original}`
- **SESSION_HISTORY:** List of all track metadata for history display

### Persistence

On startup, the API scans the `Library` folder and loads existing tracks into memory using `load_history_from_disk()`.

---

## API Endpoints

### 1. Get History

**Endpoint:** `GET /api/history`

**Description:** Retrieves the list of all processed tracks.

**Response:**
```json
[
  {
    "id": "20231225123456_song_name",
    "name": "song_name",
    "date": "20231225123456",
    "stems": ["vocals.flac", "instrumental.flac", ...],
    "original": "song_name.wav"
  }
]
```

**Status Codes:**
- `200 OK` - Success

---

### 2. Process Audio (File Upload)

**Endpoint:** `POST /api/process`

**Description:** Upload an audio file for processing.

**Request:**
- **Content-Type:** `multipart/form-data`
- **Body:**
  - `file` (required): Audio file (`.wav`, `.mp3`, `.ogg`, `.flac`)

**Process:**
1. File is saved to Library folder
2. AudioProcessor runs multiple separation modules:
   - `vocal_instrumental` - Separates vocals from instrumentals
   - `lead_backing` - Separates lead vocals from backing vocals
   - `male_female` - Separates male from female vocals
   - `male_female_secondary` - Secondary gender separation
   - `htdemucs_6s` - 6-stem separation (drums, bass, etc.)
3. Metadata is saved
4. Results are registered in session history

**Response:**
```json
{
  "message": "Separation successful",
  "id": "20231225123456_song_name",
  "stems": [
    "vocals.flac",
    "instrumental.flac",
    "lead.flac",
    "backing.flac",
    ...
  ]
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - No file, empty filename, or invalid file type
- `500 Internal Server Error` - Processing failed

---

### 3. Process Audio (URL)

**Endpoint:** `POST /api/process-url`

**Description:** Download audio from a URL (YouTube, etc.) and process it.

**Request:**
- **Content-Type:** `application/json`
- **Body:**
```json
{
  "url": "https://youtube.com/watch?v=..."
}
```

**Process:**
1. Downloads audio using yt-dlp
2. Converts to WAV format
3. Follows same processing workflow as file upload

**Response:**
```json
{
  "message": "Separation successful",
  "id": "20231225123456_song_name",
  "stems": [
    "vocals.flac",
    "instrumental.flac",
    ...
  ]
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - No URL provided
- `500 Internal Server Error` - Download or processing failed

---

### 4. Download File

**Endpoint:** `GET /api/download/<folder_id>/<filename>`

**Description:** Download a specific stem or original file.

**Parameters:**
- `folder_id` (path): Track session ID (e.g., `20231225123456_song_name`)
- `filename` (path): File name to download (e.g., `vocals.flac`)

**Response:**
- File download (binary data)

**Status Codes:**
- `200 OK` - Success
- `404 Not Found` - Session not found or file doesn't exist

**Example:**
```
GET /api/download/20231225123456_song_name/vocals.flac
```

---

### 5. Unify Tracks

**Endpoint:** `POST /api/unify`

**Description:** Mix/combine multiple stems into a single unified track.

**Request:**
- **Content-Type:** `application/json`
- **Body:**
```json
{
  "id": "20231225123456_song_name",
  "tracks": ["vocals.flac", "drums.flac"]
}
```

**Process:**
1. Reads all specified audio files
2. Normalizes to same sample rate and channel configuration
3. Mixes by summing waveforms
4. Clips to prevent distortion
5. Saves as `{track1}+{track2}.unified.wav`

**Response:**
```json
{
  "message": "Unify successful",
  "new_track": "vocals+drums.unified.wav"
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Missing data, sample rate mismatch, or channel mismatch
- `404 Not Found` - Session not found
- `500 Internal Server Error` - Processing failed

---

### 6. Download ZIP (All Files)

**Endpoint:** `GET /api/zip/<folder_id>`

**Description:** Download all files for a track as a ZIP archive.

**Parameters:**
- `folder_id` (path): Track session ID

**Response:**
- ZIP file download containing all stems and metadata

**Status Codes:**
- `200 OK` - Success
- `404 Not Found` - Session not found
- `500 Internal Server Error` - ZIP creation failed

**Example:**
```
GET /api/zip/20231225123456_song_name
```

---

### 7. Download ZIP (Selected Files)

**Endpoint:** `POST /api/zip-selected`

**Description:** Download selected stems as a ZIP archive.

**Request:**
- **Content-Type:** `application/json`
- **Body:**
```json
{
  "id": "20231225123456_song_name",
  "tracks": ["vocals.flac", "drums.flac"]
}
```

**Response:**
- ZIP file download containing only selected files

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Missing data
- `404 Not Found` - Session not found
- `500 Internal Server Error` - ZIP creation failed

---

## Data Models

### Track Object

```json
{
  "id": "string",           // Unique identifier (timestamp_filename)
  "name": "string",         // Display name
  "date": "string",         // Timestamp in YYYYMMDDHHMMSS format
  "stems": ["string"],      // Array of stem filenames
  "original": "string"      // Original filename (optional)
}
```



### Metadata File (metadata.json)

```json
{
  "id": "string",
  "name": "string",
  "original_file": "string",
  "date": "string"
}
```

---

## Audio Processing

### Supported Input Formats
- WAV (`.wav`)
- MP3 (`.mp3`)
- OGG (`.ogg`)
- FLAC (`.flac`)

### Separation Modules

The AudioProcessor runs the following modules in sequence:

1. **vocal_instrumental** - Separates vocals from instrumentals
2. **lead_backing** - Separates lead from backing vocals
3. **male_female** - Primary gender separation
4. **male_female_secondary** - Secondary gender separation
5. **htdemucs_6s** - 6-stem separation (drums, bass, guitar, piano, other)

### Output Format
- Stems are typically saved as FLAC files for quality
- Unified tracks are saved as WAV files

---

## Error Handling

All endpoints return JSON error responses in the following format:

```json
{
  "error": "Error description"
}
```

Common error scenarios:
- **File validation errors** - Invalid file types, missing files
- **Session errors** - Expired or non-existent sessions
- **Processing errors** - Audio separation or mixing failures
- **Download errors** - Failed YouTube downloads

---

## Usage Examples

### Example 1: Upload and Process Audio

```bash
# Note: The @ symbol is required before the filename to upload the file
curl -X POST http://localhost:5000/api/process \
  -F "file=@song.mp3"
```

### Example 2: Process from URL

```bash
curl -X POST http://localhost:5000/api/process-url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtube.com/watch?v=dQw4w9WgXcQ"}'
```

### Example 3: Get History

```bash
curl http://localhost:5000/api/history
```

### Example 4: Download Stem

```bash
curl http://localhost:5000/api/download/20231225123456_song_name/vocals.flac \
  -o vocals.flac
```

### Example 5: Unify Stems

```bash
curl -X POST http://localhost:5000/api/unify \
  -H "Content-Type: application/json" \
  -d '{
    "id": "20231225123456_song_name",
    "tracks": ["vocals.flac", "drums.flac"]
  }'
```

### Example 6: Download All as ZIP

```bash
curl http://localhost:5000/api/zip/20231225123456_song_name \
  -o track.zip
```

---

## Running the API

### Start Server

```bash
python api.py
```

The server will start on port 5000 by default.

### Environment Requirements

- Python 3.x
- Flask and Flask-CORS
- AudioProcessor module
- yt-dlp (for URL downloads)
- soundfile and numpy (for audio processing)
- static-ffmpeg

---

## Notes

- All processed tracks are persisted in the `Library` folder
- Track IDs are generated using timestamp + filename format
- The API automatically loads existing tracks on startup
- Temporary files are stored in the `uploads` folder
- Session state is maintained in memory but backed by disk storage
