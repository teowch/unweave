import os
import json
import shutil
from datetime import datetime
from typing import List, Dict, Optional, Any

# Assuming these are in the python path (backend root)
try:
    from AudioProject import AudioProject
except ImportError:
    # If running from inside services/ for testing
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from AudioProject import AudioProject

class ProjectService:
    def __init__(self, library_folder: str):
        self.library_folder = library_folder
        self.track_sessions: Dict[str, Dict[str, Any]] = {}
        self.session_history: List[Dict[str, Any]] = []
        
        # Ensure library exists
        os.makedirs(self.library_folder, exist_ok=True)
        # Initial scan
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
            if os.path.isdir(folder_path):
                try:
                    metadata_path = os.path.join(folder_path, 'metadata.json')
                    
                    track_id = folder_name
                    track_name = folder_name
                    original_file = None
                    track_date = folder_name
                    
                    thumbnail = None  # Initialize before metadata loading
                    if os.path.exists(metadata_path):
                        try:
                            with open(metadata_path, 'r') as f:
                                meta = json.load(f)
                                track_id = meta.get('id', folder_name)
                                track_name = meta.get('name', folder_name)
                                original_file = meta.get('original_file')
                                thumbnail = meta.get('thumbnail')  # Extract thumbnail here
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
                        if original_file and f == original_file: continue
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

    def get_history(self) -> List[Dict[str, Any]]:
        return self.session_history

    def get_project_path(self, project_id: str) -> Optional[str]:
        if project_id in self.track_sessions:
            return self.track_sessions[project_id]['path']
        
        # Fallback: check disk directly
        path = os.path.join(self.library_folder, project_id)
        if os.path.exists(path):
            return path
        return None

    def get_project_metadata(self, project_id: str) -> Optional[Dict[str, Any]]:
        # Check in memory history first
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
        
        # Update Session Map
        self.track_sessions[project_id] = {
            'path': folder_path,
            'original': filename
        }

        # Update History List
        # Check if already exists (update)
        existing = next((item for item in self.session_history if item["id"] == project_id), None)
        
        # Read metadata for thumbnail and display name - easier than passing it down if we want full consistency
        thumbnail = None
        display_name = filename_no_ext  # Fallback to filename without extension
        metadata_path = os.path.join(folder_path, 'metadata.json')
        if os.path.exists(metadata_path):
             try:
                 with open(metadata_path, 'r') as f:
                     meta = json.load(f)
                     thumbnail = meta.get('thumbnail')
                     display_name = meta.get('name', filename_no_ext)  # Use saved display name if available
             except (json.JSONDecodeError, IOError):
                 pass  # Metadata read failed, use defaults

        stems = new_stems if new_stems is not None else []
        if not stems and os.path.exists(folder_path):
             for f in os.listdir(folder_path):
                if f == filename: continue
                if f == 'metadata.json': continue
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
            # Update existing
            existing.update(track_data)
        else:
            # Insert new
            self.session_history.insert(0, track_data)

    def delete_project(self, project_id: str) -> bool:
        if project_id not in self.track_sessions:
            return False
        
        directory = self.track_sessions[project_id]['path']
        
        # Security check
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
