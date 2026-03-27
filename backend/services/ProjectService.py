import os
import json
import shutil
from pathlib import Path
from typing import List, Dict, Optional, Any

from persistence.project_catalog import build_history_entry, build_project_snapshot


class ProjectService:
    def __init__(
        self,
        library_folder: str,
        project_repository=None,
        legacy_importer=None,
    ):
        self.library_folder = library_folder
        self.project_repository = project_repository
        self.legacy_importer = legacy_importer
        self.track_sessions: Dict[str, Dict[str, Any]] = {}
        self.session_history: List[Dict[str, Any]] = []

        os.makedirs(self.library_folder, exist_ok=True)
        self.refresh_history()

    def refresh_history(self):
        """Scans LIBRARY_FOLDER and populates session history."""
        print(f"Scanning for existing history in {self.library_folder}...")
        self.session_history = []
        self.track_sessions = {}

        if not os.path.exists(self.library_folder):
            return

        found_folders = []
        for folder_name in os.listdir(self.library_folder):
            folder_path = os.path.join(self.library_folder, folder_name)
            if folder_name == '.unweave' or not os.path.isdir(folder_path):
                continue
            try:
                metadata_path = os.path.join(folder_path, 'metadata.json')

                track_id = folder_name
                track_name = folder_name
                original_file = None
                track_date = folder_name

                thumbnail = None
                if os.path.exists(metadata_path):
                    try:
                        with open(metadata_path, 'r') as f:
                            meta = json.load(f)
                            track_id = meta.get('id', folder_name)
                            track_name = meta.get('name', folder_name)
                            original_file = meta.get('original_file')
                            thumbnail = meta.get('thumbnail')
                            if 'date' in meta:
                                track_date = meta['date']
                    except (json.JSONDecodeError, IOError) as e:
                        print(f"Error reading metadata for {folder_name}: {e}")

                stems_list = []
                all_audio = []
                for f in os.listdir(folder_path):
                    if f.endswith('.wav') or f.endswith('.mp3') or f.endswith('.flac'):
                        all_audio.append(f)

                for f in all_audio:
                    if original_file and f == original_file:
                        continue
                    stems_list.append(f)

                stems_list = sorted(stems_list)

                track_data = {
                    'id': track_id,
                    'name': track_name,
                    'date': track_date,
                    'stems': stems_list,
                }
                if original_file:
                    track_data['original'] = original_file

                if thumbnail:
                    track_data['thumbnail'] = thumbnail

                found_folders.append(track_data)

                self.track_sessions[track_id] = {
                    'path': folder_path,
                    'original': original_file
                }

            except Exception as e:
                print(f"Error loading {folder_name}: {e}")
                continue

        found_folders.sort(key=lambda x: x['id'], reverse=True)
        self.session_history.extend(found_folders)
        print(f"Loaded {len(found_folders)} tracks from disk.")

    def bootstrap_sqlite_metadata(self) -> bool:
        if not self.legacy_importer:
            return False
        return self.legacy_importer.bootstrap_if_needed()

    def list_sqlite_projects(self) -> List[Dict[str, Any]]:
        if not self.project_repository:
            return []
        return self.project_repository.list_projects()

    def get_sqlite_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        if not self.project_repository:
            return None
        return self.project_repository.get_project(project_id)

    def get_sqlite_project_files(self, project_id: str) -> List[Dict[str, Any]]:
        if not self.project_repository:
            return []
        return self.project_repository.list_project_files(project_id)

    def get_sqlite_history(self) -> List[Dict[str, Any]]:
        if not self.project_repository:
            return []

        history = []
        for project_row in self.project_repository.list_projects():
            file_rows = self.project_repository.list_project_files(project_row["id"])
            history.append(build_history_entry(project_row, file_rows))
        return history

    def get_sqlite_project_snapshot(self, project_id: str) -> Optional[Dict[str, Any]]:
        if not self.project_repository:
            return None

        snapshot = self.project_repository.get_project_snapshot(project_id)
        if not snapshot:
            return None
        return build_project_snapshot(snapshot["project"], snapshot["files"])

    def get_sqlite_project_status(self, project_id: str) -> Optional[Dict[str, Any]]:
        snapshot = self.get_sqlite_project_snapshot(project_id)
        if not snapshot:
            return None
        return snapshot["status"]

    def replace_sqlite_project_snapshot(self, project_row: Dict[str, Any], file_rows: List[Dict[str, Any]]) -> None:
        if not self.project_repository:
            raise RuntimeError("Project repository is not configured")

        self.project_repository.replace_project_snapshot(project_row, file_rows)
        self._sync_sqlite_cache(project_row["id"])

    def _sync_sqlite_cache(self, project_id: str) -> None:
        snapshot = self.get_sqlite_project_snapshot(project_id)
        if not snapshot:
            return

        history_entry = snapshot["history"]
        project_path = os.path.join(self.library_folder, project_id)
        self.track_sessions[project_id] = {
            "path": project_path,
            "original": snapshot["status"]["original_file"],
        }

        existing = next((item for item in self.session_history if item["id"] == project_id), None)
        if existing:
            existing.update(history_entry)
        else:
            self.session_history.insert(0, history_entry)

        self.session_history.sort(key=lambda item: item["id"], reverse=True)

    def resolve_sqlite_file_path(self, project_id: str, filename: str) -> Optional[str]:
        snapshot = self.get_sqlite_project_snapshot(project_id)
        if not snapshot:
            return None

        for file_row in snapshot["files"]:
            relative_path = file_row["relative_path"]
            if relative_path == filename or Path(relative_path).name == filename:
                project_path = self.get_project_path(project_id)
                if not project_path:
                    return None
                return os.path.join(project_path, relative_path)
        return None

    def list_sqlite_file_paths(self, project_id: str) -> List[str]:
        snapshot = self.get_sqlite_project_snapshot(project_id)
        if not snapshot:
            return []

        project_path = self.get_project_path(project_id)
        if not project_path:
            return []

        return [
            os.path.join(project_path, file_row["relative_path"])
            for file_row in snapshot["files"]
        ]

    def get_history(self) -> List[Dict[str, Any]]:
        return self.session_history

    def get_project_path(self, project_id: str) -> Optional[str]:
        if project_id in self.track_sessions:
            return self.track_sessions[project_id]['path']

        path = os.path.join(self.library_folder, project_id)
        if os.path.exists(path):
            return path
        return None

    def get_project_metadata(self, project_id: str) -> Optional[Dict[str, Any]]:
        for track in self.session_history:
            if track['id'] == project_id:
                return track
        return None

    def create_project_folder(self, folder_name: str) -> str:
        path = os.path.join(self.library_folder, folder_name)
        os.makedirs(path, exist_ok=True)
        return path

    def register_project(self, project_id: str, folder_path: str, filename: str, timestamp: str, new_stems: List[str] = None):
        """Updates in-memory state after a new project creation or update."""
        filename_no_ext = os.path.splitext(filename)[0]

        self.track_sessions[project_id] = {
            'path': folder_path,
            'original': filename
        }

        existing = next((item for item in self.session_history if item["id"] == project_id), None)

        thumbnail = None
        display_name = filename_no_ext
        metadata_path = os.path.join(folder_path, 'metadata.json')
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r') as f:
                    meta = json.load(f)
                    thumbnail = meta.get('thumbnail')
                    display_name = meta.get('name', filename_no_ext)
            except (json.JSONDecodeError, IOError):
                pass

        stems = new_stems if new_stems is not None else []
        if not stems and os.path.exists(folder_path):
            for f in os.listdir(folder_path):
                if f == filename:
                    continue
                if f == 'metadata.json':
                    continue
                if f.endswith(('.wav', '.mp3', '.flac')):
                    stems.append(f)
            stems = sorted(stems)

        track_data = {
            'id': project_id,
            'name': display_name,
            'date': timestamp,
            'stems': stems,
            'original': filename,
        }
        if thumbnail:
            track_data['thumbnail'] = thumbnail

        if existing:
            existing.update(track_data)
        else:
            self.session_history.insert(0, track_data)

    def delete_project(self, project_id: str) -> bool:
        if project_id not in self.track_sessions:
            return False

        directory = self.track_sessions[project_id]['path']

        try:
            resolved_directory = os.path.realpath(directory)
            resolved_library = os.path.realpath(self.library_folder)
            if not resolved_directory.startswith(resolved_library):
                raise PermissionError("Access denied: path outside library folder")
        except Exception:
            return False

        try:
            shutil.rmtree(directory)
            del self.track_sessions[project_id]
            self.session_history[:] = [t for t in self.session_history if t['id'] != project_id]
            return True
        except Exception as e:
            print(f"Error deleting project {project_id}: {e}")
            raise e
