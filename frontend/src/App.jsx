import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { getHistory, unifyStems } from './services/api'
import './App.css'

// Components
import Sidebar from './components/Sidebar/Sidebar'
import UploadView from './components/UploadView/UploadView'
import LibraryView from './components/LibraryView/LibraryView'
import EditorView from './components/EditorView/EditorView'
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
    refreshLibrary()
  }, []) // Initial load

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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </ContextMenuProvider>
  )
}

export default App
