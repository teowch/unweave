import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { getHistory, getProject, isElectron, unifyStems } from './services/api'
import { createSSEConnection } from './services/sse'
import './App.css'

import Sidebar from './components/Sidebar/Sidebar'
import UploadView from './components/UploadView/UploadView'
import LibraryView from './components/LibraryView/LibraryView'
import EditorView from './components/EditorView/EditorView'
import ModelsView from './components/ModelsView/ModelsView'
import SettingsView from './components/SettingsView/SettingsView'
import SetupView from './components/SetupView/SetupView'
import NotFound from './components/NotFound'
import { ContextMenuProvider } from './components/ContextMenu/ContextMenuProvider'

const CONSISTENCY_RETRY_MS = 1500

const isConsistencyRetryable = (error) => {
  const status = error?.response?.status
  const payload = error?.response?.data || {}
  return status === 409
    || status === 423
    || payload.consistency_checking === true
    || payload.status === 'consistency_checking'
}

const ProjectStateScreen = ({ title, message, isRetrying = false }) => (
  <div className="project-state-screen">
    <div className="project-state-card">
      <h2>{title}</h2>
      <p>{message}</p>
      {isRetrying ? <div className="project-state-loader" /> : null}
    </div>
  </div>
)

const EditorRoute = ({ onUnify, onProjectUpdated }) => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [track, setTrack] = useState(null)
  const [loadingProject, setLoadingProject] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [consistencyMessage, setConsistencyMessage] = useState(null)
  const retryTimeoutRef = useRef(null)
  const repairSseRef = useRef(null)
  const defaultConsistencyMessage = 'We found an inconsistency while loading this project. Consistency is being verified and this page will reload when ready.'

  const clearRetry = () => {
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
  }

  const closeRepairListener = () => {
    if (repairSseRef.current) {
      repairSseRef.current.close()
      repairSseRef.current = null
    }
  }

  const loadProject = useCallback(async ({ silent = false } = {}) => {
    clearRetry()

    if (!silent) {
      setLoadingProject(true)
    }

    try {
      const project = await getProject(id)
      setTrack(project)
      setNotFound(false)
      setConsistencyMessage(null)
      if (onProjectUpdated) {
        await onProjectUpdated()
      }
      return project
    } catch (err) {
      if (isConsistencyRetryable(err)) {
        setConsistencyMessage(
          err.response?.data?.message
          || defaultConsistencyMessage
        )
        return null
      }

      setTrack(null)
      setConsistencyMessage(null)
      setNotFound(err.response?.status === 404)
      return null
    } finally {
      if (!silent) {
        setLoadingProject(false)
      }
    }
  }, [defaultConsistencyMessage, id, onProjectUpdated])

  const handleConsistencyIssue = useCallback((message) => {
    setConsistencyMessage(message || defaultConsistencyMessage)
  }, [defaultConsistencyMessage])

  useEffect(() => {
    loadProject()

    return () => {
      clearRetry()
      closeRepairListener()
    }
  }, [loadProject])

  useEffect(() => {
    closeRepairListener()
    clearRetry()

    if (!consistencyMessage) {
      return undefined
    }

    repairSseRef.current = createSSEConnection(id, {
      onRepairStarted: (data) => {
        if (data?.message) {
          setConsistencyMessage(data.message)
        }
      },
      onRepairCompleted: () => {
        loadProject({ silent: true })
      },
      onRepairFailed: (data) => {
        setConsistencyMessage(
          data?.message
          || 'Consistency verification failed. Please retry loading this project.'
        )
      },
    })

    retryTimeoutRef.current = window.setTimeout(() => {
      loadProject({ silent: true })
    }, CONSISTENCY_RETRY_MS)

    return () => {
      clearRetry()
      closeRepairListener()
    }
  }, [consistencyMessage, id, loadProject])

  if (loadingProject) return <div className="loader"></div>
  if (consistencyMessage) {
    return (
      <ProjectStateScreen
        title="Checking Project Consistency"
        message={consistencyMessage}
        isRetrying={true}
      />
    )
  }
  if (notFound) return <NotFound />
  if (!track) return <div className="loader"></div>

  return (
    <EditorView
      track={track}
      onBack={() => navigate('/library')}
      onProjectRefresh={() => loadProject({ silent: true })}
      onConsistencyIssue={handleConsistencyIssue}
      onUnify={onUnify}
    />
  )
}

function App() {
  const [library, setLibrary] = useState([])
  const [setupRequired, setSetupRequired] = useState(() => {
    if (!isElectron || !window.electronAPI) return false
    return window.electronAPI.isSetupRequired === true
  })

  useEffect(() => {
    if (isElectron && window.electronAPI?.onSetupComplete) {
      window.electronAPI.onSetupComplete(() => {
        setSetupRequired(false)
      })
    }
  }, [])

  const handleSetupComplete = () => {
    setSetupRequired(false)
  }

  const refreshLibrary = useCallback(async () => {
    try {
      const data = await getHistory()
      setLibrary(data)
      return data
    } catch (err) {
      console.error('Failed to load library', err)
      return []
    }
  }, [])

  useEffect(() => {
    if (setupRequired) {
      return undefined
    }

    let cancelled = false

    refreshLibrary()
      .then(() => {
        if (cancelled) {
          return
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load library', err)
        }
      })

    return () => {
      cancelled = true
    }
  }, [refreshLibrary, setupRequired])

  const handleUnify = async (trackId, selectedStems) => {
    if (!selectedStems || selectedStems.length === 0) return alert('Select stems to unify first.')

    const hasUnified = selectedStems.some(s => s.includes('.unified'))
    if (hasUnified) return alert('Cannot unify already unified tracks.')

    try {
      await unifyStems(trackId, selectedStems)
      await refreshLibrary()
      alert('Unification complete!')
    } catch (err) {
      alert(err.response?.data?.error || 'Unification failed')
    }
  }

  if (setupRequired) {
    return (
      <Routes>
        <Route path="*" element={<SetupView onSetupComplete={handleSetupComplete} />} />
      </Routes>
    )
  }

  return (
    <ContextMenuProvider>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/split" replace />} />
            <Route path="/split" element={<UploadView onUploadSuccess={refreshLibrary} />} />
            <Route path="/library" element={<LibraryView items={library} refresh={refreshLibrary} />} />
            <Route path="/library/:id" element={<EditorRoute onUnify={handleUnify} onProjectUpdated={refreshLibrary} />} />
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
