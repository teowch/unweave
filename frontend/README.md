# Unweave Frontend

The frontend is a React Single Page Application (SPA) built with Vite. It interacts with the Flask backend to provide a seamless audio separation experience.

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm run dev
   ```
   Access at `http://localhost:5173`.

3. **Build for Production**:
   ```bash
   npm run build
   ```
   Output will be in the `dist` folder.

## Project Structure

- **`src/components`**: Reusable UI components (`StemBrowser`, `TrackCard`, etc.).
- **`src/views`**: Main page layouts.
    - `LibraryView`: Displays past projects.
    - `UploadView`: Drag-and-drop file upload.
    - `EditorView`: Main workspace for processing and managing stems.
    - `SettingsView`: System configuration and info.
- **`src/services/api.js`**: Centralized Axios instance for backend communication.
- **`src/services/sse.js`**: Handling of Server-Sent Events for real-time progress.
- **`src/index.css`**: Global styles and design tokens.

## Key Features

- **Drag & Drop Upload**: Intuitive file handling.
- **Real-time Progress**: Visual feedback during audio separation.
- **Waveform Visualization**: `wavesurfer.js`.
