class SSEMessageHandler():
    def __init__(self, project_id: str, sse_manager: "SSEManager"):
        self.project_id = project_id
        self.sse_manager = sse_manager
        self.module = None

    def set_module(self, module_name: str):
        self.module = module_name

    def _send_raw(self, event: str, data: dict):
        self.sse_manager.publish(self.project_id, event, data)

    def _send(self, event: str, status: str, message: str):
        """
        Sends a message to the client.
        event can be: 'module_processing', 'download'
        status can be: 'running', 'resolving_dependency', 'error'
        if status is 'resolving_dependency', message should be the name of the module that is being resolved
        if status is 'running', message should be the percentage (without %) of the module that is being processed
        if status is 'error', message should be the error message
        """
        self._send_raw(event, {'module': self.module, 'status': status, 'message': message})

    def interceptor_callback(self, message: str):
        if '%' not in message:
            return
        percentage = message.split('%')[0]
        self.send_running('module_processing', percentage)

    def download_callback(self, message: dict):
        if message['status'] == 'downloading':
            percentage = message.get('_percent_str').split('.')[0]
            self.send_running('download', percentage)

    def send_error(self, message: str):
        self._send('error', 'error', message)
    
    def send_resolving_dependency(self, module_name: str):
        self._send('module_processing', 'resolving_dependency', module_name)

    def send_running(self, event: str, percentage: str):
        self._send(event, 'running', percentage)

    def send_module_completed(self):
        self.send_running('module_processing', 100)

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