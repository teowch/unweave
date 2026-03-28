from .ProjectService import ProjectService
from .AudioService import AudioService
from .FileService import FileService
from .SSEManager import SSEManager
from persistence import Database
from persistence.project_repository import ProjectRepository
from persistence.processing_job_repository import ProcessingJobRepository
from persistence.import_legacy import LegacyProjectImporter
import os

# Configuration (Could be moved to config.py)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
LIBRARY_FOLDER = os.environ.get('LIBRARY_PATH', os.path.join(PROJECT_ROOT, 'Library'))
UPLOAD_FOLDER = os.path.abspath(os.path.join(BASE_DIR, 'uploads'))

# Initialize Services
sse_manager = SSEManager()
database = Database(LIBRARY_FOLDER)
database.bootstrap()
project_repository = ProjectRepository(database)
processing_job_repository = ProcessingJobRepository(database)
legacy_importer = LegacyProjectImporter(LIBRARY_FOLDER, project_repository)
project_service = ProjectService(
    LIBRARY_FOLDER,
    project_repository=project_repository,
    processing_job_repository=processing_job_repository,
    legacy_importer=legacy_importer,
)
project_service.bootstrap_sqlite_metadata()
file_service = FileService(project_service, UPLOAD_FOLDER)
audio_service = AudioService(project_service, file_service)
