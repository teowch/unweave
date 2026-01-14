from .ProjectService import ProjectService
from .AudioService import AudioService
from .FileService import FileService
from .SSEManager import SSEManager
import os

# Configuration (Could be moved to config.py)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
LIBRARY_FOLDER = os.path.join(PROJECT_ROOT, 'Library')
UPLOAD_FOLDER = os.path.abspath(os.path.join(BASE_DIR, 'uploads'))

# Initialize Services
sse_manager = SSEManager()
project_service = ProjectService(LIBRARY_FOLDER)
file_service = FileService(project_service, UPLOAD_FOLDER)
audio_service = AudioService(project_service, file_service)
