import { useMemo, useState } from 'react'
import './CurrentProcessing.css'

const STATE_LABELS = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
}

const formatSummaryLine = (job, isFinished) => {
  if (!job) {
    return ''
  }

  if (isFinished) {
    return 'Finished'
  }

  const label = job.currentStep?.label || 'Preparing'
  const progress = job.currentStep?.progress ?? job.overallProgress ?? 0
  return `${label} - ${progress}%`
}

const CurrentProcessing = ({
  activeJob,
  finishedJob,
  onOpenActive,
  onOpenFinished,
  onDismissFinished,
}) => {
  const [showDetails, setShowDetails] = useState(false)
  const job = activeJob || finishedJob
  const isFinished = !activeJob && Boolean(finishedJob)

  const orderedSteps = useMemo(() => {
    if (!job?.steps) {
      return []
    }

    return job.steps.map((step, index) => ({
      id: step.id || `step-${index}`,
      label: step.label || `Step ${index + 1}`,
      state: step.state || 'pending',
      progress: Number.isFinite(step.progress) ? step.progress : 0,
    }))
  }, [job])

  if (!job) {
    return null
  }

  const handleCardClick = () => {
    if (isFinished) {
      onOpenFinished?.()
      return
    }

    onOpenActive?.()
  }

  const handleToggleDetails = (event) => {
    event.stopPropagation()
    setShowDetails((current) => !current)
  }

  const handleDismiss = (event) => {
    event.stopPropagation()
    onDismissFinished?.()
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleCardClick()
    }
  }

  const hoverLabel = `${job.projectName} - ${job.overallProgress}%`

  return (
    <section
      className={`current-processing ${isFinished ? 'is-finished' : 'is-active'} ${showDetails ? 'is-expanded' : ''}`}
    >
      <div className="current-processing__anchor">
        <div className="current-processing__hover-card">
          <span>{hoverLabel}</span>
        </div>

        <button
          type="button"
          className="current-processing__fab"
          onClick={handleToggleDetails}
          aria-expanded={showDetails}
          aria-label={isFinished ? 'Open finished processing details' : 'Open current processing details'}
        >
          <span className="current-processing__fab-ring" />
          <span className="current-processing__fab-core">
            {isFinished ? 'Done' : `${job.overallProgress}%`}
          </span>
        </button>
      </div>

      {showDetails ? (
        <div
          className="current-processing__surface"
          onClick={handleCardClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
        >
          <div className="current-processing__header">
            <div className="current-processing__title-block">
              <p className="current-processing__eyebrow">{isFinished ? 'Finished' : 'Current Processing'}</p>
              <h2 className="current-processing__title" title={job.projectName}>{job.projectName}</h2>
              <p className="current-processing__status">{formatSummaryLine(job, isFinished)}</p>
            </div>

            <div className="current-processing__actions" onClick={(event) => event.stopPropagation()}>
              {isFinished ? (
                <>
                  <button type="button" className="current-processing__link" onClick={onOpenFinished}>
                    Open Project
                  </button>
                  <button type="button" className="current-processing__dismiss" onClick={handleDismiss} aria-label="Dismiss finished status">
                    Dismiss
                  </button>
                </>
              ) : null}

              <button type="button" className="current-processing__toggle" onClick={handleToggleDetails}>
                {showDetails ? 'Hide Details' : 'Show Details'}
              </button>
            </div>
          </div>

          <div className="current-processing__progress">
            <div className="current-processing__progress-meta">
              <span>{isFinished ? 'Finished' : 'Overall Progress'}</span>
              <span>{`${job.overallProgress}%`}</span>
            </div>
            <div className="current-processing__progress-track" aria-hidden="true">
              <div className="current-processing__progress-fill" style={{ width: `${job.overallProgress}%` }} />
            </div>
          </div>

          <div className="current-processing__details">
            <h3 className="current-processing__details-heading">Ordered Steps</h3>
            <ol className="current-processing__batch-list">
              {orderedSteps.map((step) => (
                <li key={step.id} className={`current-processing__batch-item state-${step.state}`}>
                  <span className="current-processing__step-label">{step.label}</span>
                  <span className="current-processing__step-meta">{`${STATE_LABELS[step.state] || 'Pending'} - ${step.progress}%`}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default CurrentProcessing
