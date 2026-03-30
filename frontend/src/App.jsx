import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { acknowledgeProcessing, discardProcessing, getActiveJob, getHistory, getProject, isElectron, recoverProcessing, unifyStems } from './services/api'
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
import CurrentProcessing from './components/CurrentProcessing/CurrentProcessing'
import RecoveryPrompt from './components/RecoveryPrompt/RecoveryPrompt'

const CONSISTENCY_RETRY_MS = 1500
const ACTIVE_JOB_HYDRATION_ATTEMPTS = 6
const ACTIVE_JOB_HYDRATION_DELAY_MS = 250
const RECOVERY_STATES = new Set(['awaiting_recovery', 'recovering', 'interrupted'])

const normalizeActiveJobSnapshot = (snapshot) => {
  if (!snapshot?.job) {
    return null
  }

  const recovery = snapshot.recovery || {}

  const steps = Array.isArray(snapshot.steps)
    ? [...snapshot.steps].sort((left, right) => (left.order || 0) - (right.order || 0))
    : []
  const currentStep = steps.find((step) => step.state === 'running')
    || steps[steps.length - 1]
    || null
  const overallProgress = Number.isFinite(snapshot.overall_progress)
    ? Math.max(0, Math.min(100, Math.round(snapshot.overall_progress)))
    : 0

  return {
    jobId: snapshot.job.id,
    projectId: snapshot.job.project_id,
    projectName: snapshot.project?.name || snapshot.job.source_name || 'Untitled Project',
    state: snapshot.job.state,
    canSafeResume: Boolean(recovery.canSafeResume),
    canRerunFromSource: Boolean(recovery.canRerunFromSource),
    recoveryMode: recovery.recoveryMode || 'discard_only',
    recoveryMessage: recovery.recoveryMessage || null,
    completionAcknowledgedAt: snapshot.job.completion_acknowledged_at || null,
    steps,
    currentStep,
    overallProgress,
    isFinished: snapshot.job.state === 'completed',
  }
}

const wait = (delay) => new Promise((resolve) => {
  window.setTimeout(resolve, delay)
})

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
  const location = useLocation()
  const navigate = useNavigate()
  const [library, setLibrary] = useState([])
  const [activeJob, setActiveJob] = useState(null)
  const [completedJob, setCompletedJob] = useState(null)
  const [lastCompletedJob, setLastCompletedJob] = useState(null)
  const [recoveryJob, setRecoveryJob] = useState(null)
  const [recoveryPendingAction, setRecoveryPendingAction] = useState(null)
  const [recoveryError, setRecoveryError] = useState(null)
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)
  const [processingRefreshError, setProcessingRefreshError] = useState(null)
  const [setupRequired, setSetupRequired] = useState(() => {
    if (!isElectron || !window.electronAPI) return false
    return window.electronAPI.isSetupRequired === true
  })
  const activeSseRef = useRef(null)
  const activeJobRef = useRef(null)
  const hydrateActiveProcessingRef = useRef(null)

  const closeActiveSse = useCallback(() => {
    if (activeSseRef.current) {
      activeSseRef.current.close()
      activeSseRef.current = null
    }
  }, [])

  const subscribeToActiveJob = useCallback((projectId) => {
    if (!projectId) {
      closeActiveSse()
      return
    }

    closeActiveSse()
    activeSseRef.current = createSSEConnection(projectId, {
      onProcessingUpdated: async () => {
        if (hydrateActiveProcessingRef.current) {
          await hydrateActiveProcessingRef.current()
        }
      },
      onIdChanged: async (data) => {
        if (!data?.new_id) {
          return
        }

        if (hydrateActiveProcessingRef.current) {
          await hydrateActiveProcessingRef.current(data.new_id)
        }
      },
      onError: (data) => {
        if (data?.message === 'unknown job_id') {
          return
        }

        console.error('Active processing stream error', data)
      },
      onDone: async () => {
        if (hydrateActiveProcessingRef.current) {
          await hydrateActiveProcessingRef.current()
        }
      },
      onConnectionError: (error) => {
        console.error('Failed to subscribe to active processing updates', error)
      },
    })
  }, [closeActiveSse])

  const hydrateActiveProcessing = useCallback(async (expectedProjectId = null, options = {}) => {
    const { preserveSubscriptionOnEmpty = false } = options
    let lastError = null

    for (let attempt = 0; attempt < ACTIVE_JOB_HYDRATION_ATTEMPTS; attempt += 1) {
      try {
        const response = await getActiveJob()
        const normalized = normalizeActiveJobSnapshot(response?.active_job)

        if (!normalized) {
          if (expectedProjectId && attempt < ACTIVE_JOB_HYDRATION_ATTEMPTS - 1) {
            await wait(ACTIVE_JOB_HYDRATION_DELAY_MS)
            continue
          }

          if (!preserveSubscriptionOnEmpty) {
            closeActiveSse()
            activeJobRef.current = null
            setActiveJob(null)
          }
          setProcessingRefreshError(null)
          return null
        }

        if (expectedProjectId && normalized.projectId !== expectedProjectId) {
          if (attempt < ACTIVE_JOB_HYDRATION_ATTEMPTS - 1) {
            await wait(ACTIVE_JOB_HYDRATION_DELAY_MS)
            continue
          }
        }

        if (normalized.isFinished) {
          const completionSource = activeJobRef.current?.jobId === normalized.jobId
            ? 'transition'
            : 'hydrated'
          closeActiveSse()
          activeJobRef.current = null
          setActiveJob(null)
          setCompletedJob((current) => (
            current?.jobId === normalized.jobId
              ? current
              : {
                  ...normalized,
                  completedFromPath: location.pathname,
                  completionSource,
                }
          ))
          setProcessingRefreshError(null)
          return normalized
        }

        if (RECOVERY_STATES.has(normalized.state)) {
          closeActiveSse()
          activeJobRef.current = null
          setActiveJob(null)
          setCompletedJob(null)
          setRecoveryJob(normalized)
          setProcessingRefreshError(null)
          return normalized
        }

        activeJobRef.current = normalized
        setCompletedJob(null)
        setRecoveryJob(null)
        setRecoveryError(null)
        setIsConfirmingDiscard(false)
        setActiveJob(normalized)
        setProcessingRefreshError(null)
        subscribeToActiveJob(normalized.projectId)
        return normalized
      } catch (error) {
        lastError = error

        if (attempt < ACTIVE_JOB_HYDRATION_ATTEMPTS - 1) {
          await wait(ACTIVE_JOB_HYDRATION_DELAY_MS)
          continue
        }
      }
    }

    console.error('Failed to load active processing snapshot', lastError)
    setProcessingRefreshError(lastError?.userMessage || lastError?.message || 'Processing status could not be refreshed.')
    return null
  }, [closeActiveSse, location.pathname, subscribeToActiveJob])

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

  useEffect(() => {
    if (!completedJob?.isFinished) {
      return undefined
    }

    const completionTimeout = window.setTimeout(() => {
      refreshLibrary()

      if (
        completedJob.completedFromPath === '/split'
        && completedJob.completionSource === 'transition'
      ) {
        setCompletedJob(null)
        navigate(`/library/${completedJob.projectId}`)
        return
      }

      setLastCompletedJob(completedJob)
      setCompletedJob(null)
    }, 0)

    return () => {
      window.clearTimeout(completionTimeout)
    }
  }, [completedJob, navigate, refreshLibrary])

  const hasGlobalProcessingState = Boolean(activeJob || lastCompletedJob)
  const isRecoveryGateOpen = Boolean(recoveryJob)

  const handleOpenActiveProcessing = useCallback(() => {
    if (isRecoveryGateOpen) {
      return
    }
    navigate('/split')
  }, [isRecoveryGateOpen, navigate])

  const handleProcessingStarted = useCallback(async (startPayload = null) => {
    const snapshot = startPayload?.job ? startPayload : null
    const expectedProjectId = typeof startPayload === 'string'
      ? startPayload
      : startPayload?.projectId || null
    const normalized = normalizeActiveJobSnapshot(snapshot)

    if (normalized) {
      setLastCompletedJob(null)
      setCompletedJob(null)
      setRecoveryJob(null)
      setRecoveryError(null)
      setIsConfirmingDiscard(false)
      setProcessingRefreshError(null)
      activeJobRef.current = normalized
      setActiveJob(normalized)
      subscribeToActiveJob(normalized.projectId)
      return normalized
    }

    if (typeof startPayload === 'string' && expectedProjectId) {
      setLastCompletedJob(null)
      setCompletedJob(null)
      setRecoveryJob(null)
      setRecoveryError(null)
      setIsConfirmingDiscard(false)
      setProcessingRefreshError(null)
      subscribeToActiveJob(expectedProjectId)
      const hydrated = await hydrateActiveProcessing(null, { preserveSubscriptionOnEmpty: true })
      if (hydrated) {
        setLastCompletedJob(null)
        setCompletedJob(null)
        setProcessingRefreshError(null)
      }
      return hydrated
    }

    const hydrated = await hydrateActiveProcessing(expectedProjectId)
    if (hydrated) {
      setLastCompletedJob(null)
      setCompletedJob(null)
      if (!RECOVERY_STATES.has(hydrated.state)) {
        setRecoveryJob(null)
      }
      setRecoveryError(null)
      setIsConfirmingDiscard(false)
      setProcessingRefreshError(null)
    }
    return hydrated
  }, [hydrateActiveProcessing, subscribeToActiveJob])

  const acknowledgeFinishedJob = useCallback(async (job) => {
    if (!job?.jobId) {
      return true
    }

    try {
      await acknowledgeProcessing(job.jobId)
      setProcessingRefreshError(null)
      return true
    } catch (error) {
      console.error('Failed to acknowledge finished processing', error)
      setProcessingRefreshError(
        error?.userMessage
        || error?.response?.data?.error
        || 'Processing status could not be refreshed.'
      )
      return false
    }
  }, [])

  const handleOpenCompletedProject = useCallback(async () => {
    if (!lastCompletedJob?.projectId) {
      return
    }

    const acknowledged = await acknowledgeFinishedJob(lastCompletedJob)
    if (!acknowledged) {
      return
    }

    setLastCompletedJob(null)
    navigate(`/library/${lastCompletedJob.projectId}`)
  }, [acknowledgeFinishedJob, lastCompletedJob, navigate])

  const handleDismissCompletedState = useCallback(async () => {
    if (lastCompletedJob) {
      const acknowledged = await acknowledgeFinishedJob(lastCompletedJob)
      if (!acknowledged) {
        return
      }
    }

    setLastCompletedJob(null)
  }, [acknowledgeFinishedJob, lastCompletedJob])

  useEffect(() => {
    if (!lastCompletedJob?.projectId) {
      return undefined
    }

    const projectPath = `/library/${lastCompletedJob.projectId}`
    if (location.pathname !== projectPath) {
      return undefined
    }

    let cancelled = false

    const acknowledgeOnProjectPage = async () => {
      const acknowledged = await acknowledgeFinishedJob(lastCompletedJob)
      if (!acknowledged || cancelled) {
        return
      }

      setLastCompletedJob(null)
    }

    acknowledgeOnProjectPage()

    return () => {
      cancelled = true
    }
  }, [acknowledgeFinishedJob, lastCompletedJob, location.pathname])

  const handleProcessingReset = useCallback(() => {
    closeActiveSse()
    activeJobRef.current = null
    setActiveJob(null)
    setCompletedJob(null)
    setLastCompletedJob(null)
    setRecoveryJob(null)
    setRecoveryError(null)
    setIsConfirmingDiscard(false)
    setProcessingRefreshError(null)
  }, [closeActiveSse])

  const handleRecoverProcessing = useCallback(async (mode) => {
    if (!recoveryJob?.jobId) {
      return
    }

    setRecoveryPendingAction(mode)
    setRecoveryError(null)

    try {
      await recoverProcessing(recoveryJob.jobId, mode)
      const refreshed = await hydrateActiveProcessing(recoveryJob.projectId)

      if (!refreshed || !RECOVERY_STATES.has(refreshed.state)) {
        setRecoveryJob(null)
        setRecoveryError(null)
        setIsConfirmingDiscard(false)
      }
    } catch (error) {
      console.error('Failed to recover processing', error)
      setRecoveryError(
        error?.userMessage
        || error?.response?.data?.error
        || 'Review the interrupted project details and choose rerun from source or discard the project.'
      )
    } finally {
      setRecoveryPendingAction(null)
    }
  }, [hydrateActiveProcessing, recoveryJob])

  const handleDiscardRecovery = useCallback(async () => {
    if (!recoveryJob?.jobId) {
      return
    }

    setRecoveryPendingAction('discard')
    setRecoveryError(null)

    try {
      await discardProcessing(recoveryJob.jobId)
      closeActiveSse()
      activeJobRef.current = null
      setRecoveryJob(null)
      setActiveJob(null)
      setCompletedJob(null)
      setLastCompletedJob(null)
      setIsConfirmingDiscard(false)
      setProcessingRefreshError(null)
      await refreshLibrary()
    } catch (error) {
      console.error('Failed to discard interrupted processing', error)
      setRecoveryError(
        error?.userMessage
        || error?.response?.data?.error
        || 'Discard could not be completed. Review the interrupted project details and try again.'
      )
    } finally {
      setRecoveryPendingAction(null)
    }
  }, [closeActiveSse, recoveryJob, refreshLibrary])

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
        <main
          className={`main-content ${isRecoveryGateOpen ? 'main-content--locked' : ''}`}
          data-processing-state={hasGlobalProcessingState ? 'active' : 'idle'}
          aria-hidden={isRecoveryGateOpen ? 'true' : 'false'}
        >
          <CurrentProcessing
            activeJob={activeJob}
            finishedJob={lastCompletedJob}
            onOpenActive={handleOpenActiveProcessing}
            onOpenFinished={handleOpenCompletedProject}
            onDismissFinished={handleDismissCompletedState}
            isLocked={isRecoveryGateOpen}
          />
          <div className="main-route-content">
            <Routes>
              <Route path="/" element={<Navigate to="/split" replace />} />
              <Route
                path="/split"
                element={
                  <UploadView
                    onUploadSuccess={refreshLibrary}
                    activeJob={activeJob}
                    isInteractionLocked={isRecoveryGateOpen}
                    processingRefreshError={processingRefreshError}
                    onProcessingStarted={handleProcessingStarted}
                    onProcessingFinished={hydrateActiveProcessing}
                    onProcessingReset={handleProcessingReset}
                  />
                }
              />
              <Route path="/library" element={<LibraryView items={library} refresh={refreshLibrary} />} />
              <Route path="/library/:id" element={<EditorRoute onUnify={handleUnify} onProjectUpdated={refreshLibrary} />} />
              <Route path="/models" element={<ModelsView />} />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="/setup" element={<SetupView onSetupComplete={handleSetupComplete} />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </main>
        <RecoveryPrompt
          recoveryJob={recoveryJob}
          pendingAction={recoveryPendingAction}
          errorMessage={recoveryError}
          confirmingDiscard={isConfirmingDiscard}
          onRecover={handleRecoverProcessing}
          onDiscard={handleDiscardRecovery}
          onStartDiscard={() => setIsConfirmingDiscard(true)}
          onCancelDiscard={() => setIsConfirmingDiscard(false)}
        />
      </div>
    </ContextMenuProvider>
  )
}

export default App
