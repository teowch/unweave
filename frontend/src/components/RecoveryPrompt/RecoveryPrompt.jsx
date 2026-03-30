import { useEffect, useMemo, useRef } from 'react'
import './RecoveryPrompt.css'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const RecoveryPrompt = ({
  recoveryJob,
  pendingAction,
  errorMessage,
  confirmingDiscard,
  onRecover,
  onDiscard,
  onStartDiscard,
  onCancelDiscard,
}) => {
  const dialogRef = useRef(null)
  const primaryActionRef = useRef(null)

  const canSafeResume = Boolean(recoveryJob?.canSafeResume)
  const canRerunFromSource = Boolean(recoveryJob?.canRerunFromSource)
  const recoveryMode = recoveryJob?.recoveryMode || 'discard_only'
  const primaryMode = canSafeResume ? 'safe_resume' : (canRerunFromSource ? 'rerun_from_source' : null)
  const primaryLabel = canSafeResume ? 'Recover Project' : 'Rerun From Source'
  const primaryPendingLabel = canSafeResume ? 'Recovering...' : 'Rerunning...'
  const helperCopy = canSafeResume
    ? 'Completed steps will be kept. The interrupted step will be cleaned and run again before processing continues.'
    : 'Safe step-by-step recovery is not available for this project. You can rerun it from the original source or discard it.'

  const projectName = recoveryJob?.projectName || 'Untitled Project'
  const discardDetail = useMemo(() => (
    `Discard interrupted project: Remove ${projectName} from Unweave and delete its folder from Library? This cannot be undone.`
  ), [projectName])

  useEffect(() => {
    primaryActionRef.current?.focus()
  }, [recoveryJob?.jobId, confirmingDiscard])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Tab' || !dialogRef.current) {
        if (event.key === 'Escape') {
          event.preventDefault()
        }
        return
      }

      const focusable = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  if (!recoveryJob) {
    return null
  }

  return (
    <div className="recovery-prompt" role="presentation">
      <div className="recovery-prompt__scrim" />
      <div
        ref={dialogRef}
        className="recovery-prompt__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-prompt-title"
        aria-describedby="recovery-prompt-description"
      >
        <div className="recovery-prompt__eyebrow">
          {recoveryMode === 'safe_resume' ? 'Recoverable Interruption' : 'Recovery Required'}
        </div>
        <h2 id="recovery-prompt-title" className="recovery-prompt__title">Recover interrupted processing?</h2>
        <p className="recovery-prompt__project-name">{projectName}</p>
        <p id="recovery-prompt-description" className="recovery-prompt__body">
          {recoveryJob?.recoveryMessage || `${projectName} was interrupted before processing finished. Recover to keep completed steps and continue from the interrupted batch, or discard to remove this project and its files from Library.`}
        </p>

        <section className={`recovery-prompt__detail ${canSafeResume ? 'is-accented' : ''}`}>
          <h3>{canSafeResume ? 'Safe Resume Available' : 'Rerun Required'}</h3>
          <p>{helperCopy}</p>
        </section>

        {errorMessage ? (
          <section className="recovery-prompt__detail is-error">
            <h3>Recovery could not continue safely.</h3>
            <p>{errorMessage}</p>
          </section>
        ) : null}

        <div className="recovery-prompt__actions">
          {primaryMode ? (
            <button
              ref={primaryActionRef}
              type="button"
              className={`recovery-prompt__button ${canSafeResume ? 'is-primary' : 'is-rerun'}`}
              onClick={() => onRecover(primaryMode)}
              disabled={Boolean(pendingAction)}
            >
              {pendingAction === primaryMode ? primaryPendingLabel : primaryLabel}
            </button>
          ) : null}

          {canSafeResume && canRerunFromSource ? (
            <button
              type="button"
              className="recovery-prompt__button is-secondary"
              onClick={() => onRecover('rerun_from_source')}
              disabled={Boolean(pendingAction)}
            >
              {pendingAction === 'rerun_from_source' ? 'Rerunning...' : 'Rerun From Source'}
            </button>
          ) : null}

          <button
            type="button"
            className="recovery-prompt__button is-ghost"
            onClick={confirmingDiscard ? onCancelDiscard : onStartDiscard}
            disabled={Boolean(pendingAction)}
          >
            {confirmingDiscard ? 'Keep Prompt Open' : 'Discard'}
          </button>
        </div>

        {confirmingDiscard ? (
          <section className="recovery-prompt__confirm">
            <p className="recovery-prompt__confirm-copy">{discardDetail}</p>
            <div className="recovery-prompt__confirm-actions">
              <button
                type="button"
                className="recovery-prompt__button is-danger"
                onClick={onDiscard}
                disabled={Boolean(pendingAction)}
              >
                {pendingAction === 'discard' ? 'Discarding...' : 'Delete Project Folder'}
              </button>
              <button
                type="button"
                className="recovery-prompt__button is-secondary"
                onClick={onCancelDiscard}
                disabled={Boolean(pendingAction)}
              >
                Keep Prompt Open
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

export default RecoveryPrompt
