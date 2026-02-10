import os
import zipfile
import shutil
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)

class FileService:
    def __init__(self, project_service, upload_folder: str):
        self.project_service = project_service
        self.upload_folder = upload_folder
        os.makedirs(self.upload_folder, exist_ok=True)
        # Clean stale files from previous runs/crashes
        self.cleanup_upload_folder()

    def get_file_path(self, project_id: str, filename: str) -> Optional[str]:
        project_path = self.project_service.get_project_path(project_id)
        if not project_path:
            return None
        
        file_path = os.path.join(project_path, filename)
        if os.path.exists(file_path):
            return file_path
        return None

    def create_zip(self, project_id: str, selected_tracks: List[str] = None) -> str:
        """
        Creates a zip file for the project. If selected_tracks is provided, only zips those.
        Returns the path to the zip file.
        """
        project_path = self.project_service.get_project_path(project_id)
        if not project_path:
            raise FileNotFoundError("Project not found")
        
        suffix = "_selected" if selected_tracks else ""
        zip_filename = f"{project_id}{suffix}.zip"
        zip_path = os.path.join(self.upload_folder, zip_filename)
        
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            if selected_tracks:
                 for name in selected_tracks:
                    p = os.path.join(project_path, name)
                    if os.path.exists(p):
                        zipf.write(p, name)
            else:
                for root, dirs, files in os.walk(project_path):
                    for file in files:
                        zipf.write(os.path.join(root, file), file)
        
        return zip_path

    def cleanup_zip(self, zip_path: str) -> None:
        """Delete a ZIP file after it has been served."""
        try:
            if zip_path and os.path.exists(zip_path):
                os.remove(zip_path)
                logger.debug(f"Cleaned up ZIP: {zip_path}")
        except OSError as e:
            logger.warning(f"Failed to clean up ZIP {zip_path}: {e}")

    def cleanup_upload_folder(self) -> None:
        """Remove all files from the uploads folder (stale downloads, ZIPs, etc.)."""
        try:
            for filename in os.listdir(self.upload_folder):
                filepath = os.path.join(self.upload_folder, filename)
                if os.path.isfile(filepath):
                    os.remove(filepath)
                    logger.debug(f"Cleaned up stale file: {filepath}")
        except OSError as e:
            logger.warning(f"Failed to clean uploads folder: {e}")

