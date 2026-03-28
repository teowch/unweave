import { useMemo, useState } from 'react'
import './CurrentProcessing.css'

const formatStatusLine = (job) => {
  if (!job) {
    return ''
  }

  if (job.state === 'completed') {
    return 'Finished'
  }

  return `${job.statusText} - ${job.currentBatchLabel}`
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

  const orderedBatches = useMemo(() => {
    if (!job?.batches) {
      return []
    }

    return job.batches.map((batch, index) => ({
      id: `${batch.module_id || batch.module_name || index}`,
      label: batch.module_name || batch.module_id || `Batch ${index + 1}`,
      state: batch.state || 'pending',
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

  return (
    <section
      className={`current-processing ${isFinished ? 'is-finished' : 'is-active'} ${showDetails ? 'is-expanded' : ''}`}
    >
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
            <p className="current-processing__status">{formatStatusLine(job)}</p>
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
            <span>{`Batch ${job.completedBatchCount} of ${job.totalBatchCount}`}</span>
            <span>{`${job.overallProgress}%`}</span>
          </div>
          <div className="current-processing__progress-track" aria-hidden="true">
            <div className="current-processing__progress-fill" style={{ width: `${job.overallProgress}%` }} />
          </div>
        </div>

        {showDetails ? (
          <div className="current-processing__details">
            <h3 className="current-processing__details-heading">{isFinished ? 'Open Project' : 'Current Processing'}</h3>
            <ol className="current-processing__batch-list">
              {orderedBatches.map((batch) => (
                <li key={batch.id} className={`current-processing__batch-item state-${batch.state}`}>
                  <span>{batch.label}</span>
                  <span>{batch.state}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default CurrentProcessing
