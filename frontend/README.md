# Music Track Separator - Frontend

The user interface for Music Track Separator, built with React and Vite. It provides a clean, modern interface for uploading songs, managing history, and playing back isolated stems.

## 💻 Tech Stack

- **Framework**: React 19
- **Build Tool**: Vite
- **HTTP Client**: Axios
- **Linting**: ESLint

## 🚀 Getting Started

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   The app will run on `http://localhost:5173`.

## 📜 Available Scripts

- **`npm run dev`**: Starts the development server.
- **`npm run build`**: Builds the app for production.
- **`npm run lint`**: Runs ESLint to check for code quality issues.
- **`npm run preview`**: Preview the production build locally.

## 🧩 Key Components

- **Upload/URL Input**: Drag & drop support and URL field for initiating processing.
- **Player Modal**: Advanced Multi-track player to toggle stems (Vocals, Drums, Bass, Other), adjust global/individual volume, Unify tracks, and download original/processed files.
- **History List**: View and access previously processed tracks.
- **Unify Tracks**: Select specific stems and merge them into a single track directly in the browser.

## 📸 Screenshots

![Player Modal](../docs/images/player_modal.png)

## 🌐 API Integration

The frontend assumes the backend is running at `http://localhost:5000`. Ensure the flask server is active for full functionality.
