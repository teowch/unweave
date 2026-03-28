import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { getActiveJob, getHistory, getProject, isElectron, unifyStems } from './services/api'
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

const toTitleCase = (value = '') => (
  value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
)

const normalizeProgressValue = (value) => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    return 0
  }

  return Math.max(0, Math.min(100, parsed))
}

const normalizeActiveJobSnapshot = (snapshot) => {
  if (!snapshot?.job) {
    return null
  }

  const batches = Array.isArray(snapshot.batches) ? snapshot.batches : []
  const completedBatchCount = batches.filter((batch) => batch.state === 'completed').length
  const totalBatchCount = batches.length
  const currentBatch = batches.find((batch) => batch.state === 'running')
    || batches.find((batch) => batch.state === 'pending')
    || batches[batches.length - 1]
    || null
  const currentBatchLabel = currentBatch?.module_name
    || currentBatch?.module_id
    || 'Preparing'

  return {
    jobId: snapshot.job.id,
    projectId: snapshot.job.project_id,
    projectName: snapshot.project?.name || snapshot.job.source_name || 'Untitled Project',
    state: snapshot.job.state,
    batches,
    currentBatchLabel,
    overallProgress: totalBatchCount > 0
      ? Math.round((completedBatchCount / totalBatchCount) * 100)
      : 0,
    completedBatchCount,
    totalBatchCount,
    statusText: toTitleCase(snapshot.job.state || 'processing'),
    downloadProgress: null,
    modelDownloading: null,
    moduleProgress: {},
    lastEvent: null,
  }
}

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
  const [activeJob, setActiveJob] = useState(null)
  const [lastCompletedJob, setLastCompletedJob] = useState(null)
  const [processingToast, setProcessingToast] = useState(null)
  const [setupRequired, setSetupRequired] = useState(() => {
    if (!isElectron || !window.electronAPI) return false
    return window.electronAPI.isSetupRequired === true
  })
  const activeSseRef = useRef(null)
  const completionToastKeyRef = useRef(null)
  const hydrateActiveProcessingRef = useRef(null)

  const closeActiveSse = useCallback(() => {
    if (activeSseRef.current) {
      activeSseRef.current.close()
      activeSseRef.current = null
    }
  }, [])

  const handleActiveJobTerminal = useCallback((job) => {
    if (!job) {
      return
    }

    setActiveJob(null)
    setLastCompletedJob(job)

    if (completionToastKeyRef.current === job.jobId) {
      return
    }

    completionToastKeyRef.current = job.jobId
    setProcessingToast({
      jobId: job.jobId,
      projectId: job.projectId,
      projectName: job.projectName,
    })
  }, [])

  const updateActiveJob = useCallback((updater) => {
    setActiveJob((current) => {
      if (!current) {
        return current
      }

      const next = typeof updater === 'function'
        ? updater(current)
        : updater

      if (!next) {
        return next
      }

      return {
        ...current,
        ...next,
      }
    })
  }, [])

  const subscribeToActiveJob = useCallback((projectId) => {
    if (!projectId) {
      closeActiveSse()
      return
    }

    closeActiveSse()
    activeSseRef.current = createSSEConnection(projectId, {
      onDownloadProgress: (data) => {
        const percentage = normalizeProgressValue(data?.message)
        updateActiveJob({
          downloadProgress: {
            percentage,
            status: data?.status || 'running',
          },
          statusText: 'Downloading',
          lastEvent: 'download',
        })
      },
      onModelDownloading: (data) => {
        updateActiveJob({
          modelDownloading: data?.status === 'complete'
            ? null
            : {
                model: data?.model || null,
                status: data?.status || 'downloading',
                progress: data?.progress || null,
              },
          lastEvent: 'model_downloading',
        })
      },
      onModuleProgress: (data) => {
        const moduleId = data?.module
        if (!moduleId) {
          return
        }

        updateActiveJob((current) => {
          const percentage = normalizeProgressValue(data?.message)
          const nextModuleProgress = {
            ...current.moduleProgress,
            [moduleId]: {
              percentage,
              status: data?.status || 'running',
              dependencyName: data?.status === 'resolving_dependency' ? data?.message || '' : '',
            },
          }
          const batchLabel = current.batches.find((batch) => batch.module_id === moduleId)?.module_name
            || current.batches.find((batch) => batch.module_id === moduleId)?.module_id
            || moduleId

          return {
            moduleProgress: nextModuleProgress,
            currentBatchLabel: batchLabel,
            statusText: data?.status === 'resolving_dependency'
              ? `Waiting on ${data?.message || 'dependency'}`
              : 'Processing',
            modelDownloading: null,
            lastEvent: 'module_processing',
          }
        })
      },
      onError: (data) => {
        updateActiveJob({
          state: 'failed',
          statusText: data?.message || 'Processing failed',
          lastEvent: 'error',
        })
      },
      onDone: async () => {
        closeActiveSse()
        if (hydrateActiveProcessingRef.current) {
          const refreshedJob = await hydrateActiveProcessingRef.current()
          if (refreshedJob) {
            return
          }
        }

        setActiveJob((current) => {
          if (current) {
            handleActiveJobTerminal({
              ...current,
              state: 'completed',
              statusText: 'Finished',
              overallProgress: 100,
              completedBatchCount: current.totalBatchCount || current.completedBatchCount,
            })
          }

          return null
        })
      },
      onConnectionError: (error) => {
        console.error('Failed to subscribe to active processing updates', error)
      },
    })
  }, [closeActiveSse, handleActiveJobTerminal, updateActiveJob])

  const hydrateActiveProcessing = useCallback(async () => {
    try {
      const response = await getActiveJob()
      const normalized = normalizeActiveJobSnapshot(response?.active_job)

      if (!normalized) {
        closeActiveSse()
        setActiveJob(null)
        return null
      }

      setActiveJob(normalized)
      subscribeToActiveJob(normalized.projectId)
      return normalized
    } catch (error) {
      console.error('Failed to load active processing snapshot', error)
      closeActiveSse()
      setActiveJob(null)
      return null
    }
  }, [closeActiveSse, subscribeToActiveJob])

  useEffect(() => {
    hydrateActiveProcessingRef.current = hydrateActiveProcessing
  }, [hydrateActiveProcessing])

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
    const refreshTimeout = window.setTimeout(() => {
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
    }, 0)

    return () => {
      window.clearTimeout(refreshTimeout)
      cancelled = true
    }
  }, [refreshLibrary, setupRequired])

  useEffect(() => {
    if (setupRequired) {
      return undefined
    }

    const hydrateTimeout = window.setTimeout(() => {
      hydrateActiveProcessing()
    }, 0)

    return () => {
      window.clearTimeout(hydrateTimeout)
      closeActiveSse()
    }
  }, [closeActiveSse, hydrateActiveProcessing, setupRequired])

  const hasGlobalProcessingState = Boolean(activeJob || lastCompletedJob || processingToast)

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
        <main className="main-content" data-processing-state={hasGlobalProcessingState ? 'active' : 'idle'}>
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
