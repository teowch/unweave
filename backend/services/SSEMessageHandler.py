class SSEMessageHandler():
    def __init__(self, project_id: str, sse_manager: "SSEManager"):
        self.project_id = project_id
        self.sse_manager = sse_manager
        self.module = None
        self.current_model = None

    def set_module(self, module_name: str):
        self.module = module_name

    def set_current_model(self, model_name: str):
        """Set the current model being loaded/downloaded."""
        self.current_model = model_name

    def _send_raw(self, event: str, data: dict):
        self.sse_manager.publish(self.project_id, event, data)

    def _send(self, event: str, status: str, message: str):
        return None

    def interceptor_callback(self, message: str, event_type: str = "processing"):
        """
        Callback for log interceptor. Handles both model download and processing events.
        
        Args:
            message: The log message
            event_type: "model_download" or "processing"
        """
        if event_type == "model_download":
            return
        else:
            return

    def download_callback(self, message: dict):
        return None

    def send_error(self, message: str):
        self._send('error', 'error', message)
    
    def send_resolving_dependency(self, module_name: str):
        self._send('module_processing', 'resolving_dependency', module_name)

    def send_running(self, event: str, percentage: str):
        self._send(event, 'running', percentage)

    def send_model_downloading(self, progress: str):
        return None

    def send_model_download_complete(self):
        return None

    def send_module_completed(self):
        self.send_running('module_processing', 100)

    def publish_processing_updated(self, job_id: str, project_id: str, state: str):
        self._send_raw('processing_updated', {
            'job_id': job_id,
            'project_id': project_id,
            'state': state,
        })

    def send_id_changed(self, new_id: str):
        self._send_raw('id_changed', {'new_id': new_id})

    def set_project_id(self, new_id: str):
        # Send id_changed to the OLD channel first (so client receives it)
        self.send_id_changed(new_id)
        self.sse_manager.close(self.project_id)
        # Create a new channel for the new project_id (so client can reconnect)
        self.sse_manager.create(new_id)
        # Update internal project_id for future messages
        self.project_id = new_id
