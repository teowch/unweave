import './ProcessingToast.css'

const ProcessingToast = ({ job, onOpenProject, onDismiss }) => {
  if (!job) {
    return null
  }

  return (
    <aside className="processing-toast" role="status" aria-live="polite">
      <div className="processing-toast__body">
        <div>
          <p className="processing-toast__title">Processing Finished</p>
          <p className="processing-toast__message">{job.projectName} is ready to open.</p>
        </div>

        <div className="processing-toast__actions">
          <button type="button" className="processing-toast__action" onClick={onOpenProject}>
            Open Project
          </button>
          <button type="button" className="processing-toast__dismiss" onClick={onDismiss} aria-label="Dismiss finished status">
            Open Later
          </button>
        </div>
      </div>
    </aside>
  )
}

export default ProcessingToast
