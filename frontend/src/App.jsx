import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { getHistory, unifyStems, isElectron } from './services/api'
import './App.css'

// Components
import Sidebar from './components/Sidebar/Sidebar'
import UploadView from './components/UploadView/UploadView'
import LibraryView from './components/LibraryView/LibraryView'
import EditorView from './components/EditorView/EditorView'
import ModelsView from './components/ModelsView/ModelsView'
import SettingsView from './components/SettingsView/SettingsView'
import SetupView from './components/SetupView/SetupView'
import NotFound from './components/NotFound'
import { ContextMenuProvider } from './components/ContextMenu/ContextMenuProvider'

// Wrapper for EditorView to handle ID from params
const EditorRoute = ({ library, onUnify, isLoading }) => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [track, setTrack] = useState(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      if (library.length > 0) {
        const found = library.find(t => t.id === id)
        if (found) {
          setTrack(found)
          setNotFound(false)
        } else {
          setNotFound(true)
        }
      } else if (library.length === 0) {
        // Library is empty after loading, so definitely not found
        setNotFound(true)
      }
    }
  }, [id, library, isLoading])

  if (isLoading) return <div className="loader"></div>
  if (notFound) return <NotFound />
  if (!track) return <div className="loader"></div>

  return <EditorView track={track} onBack={() => navigate('/library')} onUnify={onUnify} />
}

function App() {
  const [library, setLibrary] = useState([])
  const [loading, setLoading] = useState(true)

  // ── Setup gate (Electron only) ──
  // If setup hasn't been completed, block all routes and show the setup page.
  const [setupRequired, setSetupRequired] = useState(() => {
    if (!isElectron || !window.electronAPI) return false;
    // Main process tells us via preload whether setup is needed
    return window.electronAPI.isSetupRequired === true;
  });

  useEffect(() => {
    // Listen for setup-complete event from main process
    if (isElectron && window.electronAPI?.onSetupComplete) {
      window.electronAPI.onSetupComplete(() => {
        setSetupRequired(false);
      });
    }
  }, []);

  const handleSetupComplete = () => {
    setSetupRequired(false);
  };

  const refreshLibrary = async () => {
    try {
      const data = await getHistory()
      setLibrary(data)
      setLoading(false)
      return data
    } catch (err) {
      console.error("Failed to load library", err)
      setLoading(false)
      return []
    }
  }

  useEffect(() => {
    if (!setupRequired) {
      refreshLibrary()
    }
  }, [setupRequired])

  const handleUnify = async (trackId, selectedStems) => {
    if (!selectedStems || selectedStems.length === 0) return alert("Select stems to unify first.")

    const hasUnified = selectedStems.some(s => s.includes('.unified'))
    if (hasUnified) return alert("Cannot unify already unified tracks.")

    try {
      await unifyStems(trackId, selectedStems)
      await refreshLibrary()
      alert("Unification complete!")
    } catch (err) {
      alert(err.response?.data?.error || "Unification failed")
    }
  }

  // ── Setup gate: only show setup page, no sidebar, no other routes ──
  if (setupRequired) {
    return (
      <Routes>
        <Route path="*" element={<SetupView onSetupComplete={handleSetupComplete} />} />
      </Routes>
    );
  }

  // ── Normal app (setup complete or non-Electron) ──
  return (
    <ContextMenuProvider>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/split" replace />} />
            <Route path="/split" element={<UploadView onUploadSuccess={refreshLibrary} />} />
            {/* Note: UploadView onSuccess handling needs improvement to use useNavigate from within or pass navigate */}

            <Route path="/library" element={<LibraryView items={library} refresh={refreshLibrary} />} />
            <Route path="/library/:id" element={<EditorRoute library={library} onUnify={handleUnify} isLoading={loading} />} />
            <Route path="/models" element={<ModelsView />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="/setup" element={<SetupView onSetupComplete={handleSetupComplete} />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </ContextMenuProvider>
  )
}

export default App

