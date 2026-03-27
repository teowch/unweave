import os
import zipfile
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FileResolution:
    project_id: str
    filename: str
    status: str
    path: Optional[str] = None
    relative_path: Optional[str] = None


class ConsistencyRepairRequired(RuntimeError):
    def __init__(self, project_id: str, filename: str, relative_path: Optional[str] = None):
        self.project_id = project_id
        self.filename = filename
        self.relative_path = relative_path or filename
        super().__init__(f"Consistency repair required for {project_id}:{self.relative_path}")


class FileService:
    def __init__(self, project_service, upload_folder: str):
        self.project_service = project_service
        self.upload_folder = upload_folder
        os.makedirs(self.upload_folder, exist_ok=True)
        self.cleanup_upload_folder()

    def resolve_file(self, project_id: str, filename: str) -> FileResolution:
        file_ref = self.project_service.resolve_sqlite_file(project_id, filename)
        if not file_ref:
            return FileResolution(project_id=project_id, filename=filename, status="not_tracked")

        if os.path.exists(file_ref["path"]):
            return FileResolution(
                project_id=project_id,
                filename=filename,
                status="ready",
                path=file_ref["path"],
                relative_path=file_ref["relative_path"],
            )

        return FileResolution(
            project_id=project_id,
            filename=filename,
            status="tracked_missing",
            path=file_ref["path"],
            relative_path=file_ref["relative_path"],
        )

    def repair_tracked_file(self, project_id: str, filename: str) -> FileResolution:
        resolution = self.resolve_file(project_id, filename)
        if resolution.status != "tracked_missing":
            return resolution

        self.project_service.repair_sqlite_project(project_id)
        return self.resolve_file(project_id, filename)

    def get_file_path(self, project_id: str, filename: str) -> Optional[str]:
        resolution = self.resolve_file(project_id, filename)
        if resolution.status == "ready":
            return resolution.path
        return None

    def require_file_path(self, project_id: str, filename: str) -> str:
        resolution = self.resolve_file(project_id, filename)
        if resolution.status == "ready":
            return resolution.path
        if resolution.status == "tracked_missing":
            raise ConsistencyRepairRequired(project_id, filename, resolution.relative_path)
        raise FileNotFoundError(filename)

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
                    file_path = self.require_file_path(project_id, name)
                    zipf.write(file_path, Path(file_path).name)
            else:
                snapshot = self.project_service.get_sqlite_project_snapshot(project_id)
                if not snapshot:
                    raise FileNotFoundError("Project not found")

                for file_row in snapshot["files"]:
                    resolution = self.resolve_file(project_id, file_row["relative_path"])
                    if resolution.status == "tracked_missing":
                        raise ConsistencyRepairRequired(project_id, file_row["relative_path"], resolution.relative_path)
                    if resolution.status == "ready":
                        zipf.write(resolution.path, Path(resolution.path).name)

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
