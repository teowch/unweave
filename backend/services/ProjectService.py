import os
import json
import shutil
import threading
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Any

from persistence.project_catalog import build_history_entry, build_project_snapshot
from persistence.import_legacy import collect_project_file_rows


class ProjectService:
    def __init__(
        self,
        library_folder: str,
        project_repository=None,
        processing_job_repository=None,
        legacy_importer=None,
    ):
        self.library_folder = library_folder
        self.project_repository = project_repository
        self.processing_job_repository = processing_job_repository
        self.legacy_importer = legacy_importer
        self.track_sessions: Dict[str, Dict[str, Any]] = {}
        self.session_history: List[Dict[str, Any]] = []
        self._repair_lock = threading.Lock()
        self._repair_state: Dict[str, Dict[str, Any]] = {}

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

    def get_active_processing_job_snapshot(self) -> Optional[Dict[str, Any]]:
        if not self.processing_job_repository:
            return None
        recoverable_snapshot = self.processing_job_repository.get_recoverable_job_snapshot()
        if recoverable_snapshot:
            return self._attach_recovery_decision(recoverable_snapshot)

        snapshot = self.processing_job_repository.get_active_processing_job()
        if snapshot:
            return self._attach_recovery_decision(snapshot)

        return None

    def create_processing_job(self, job_row: Dict[str, Any]) -> None:
        if not self.processing_job_repository:
            raise RuntimeError("Processing job repository is not configured")
        self.processing_job_repository.create_job(job_row)

    def replace_processing_batches(self, job_id: str, batch_rows: List[Dict[str, Any]]) -> None:
        if not self.processing_job_repository:
            raise RuntimeError("Processing job repository is not configured")
        self.processing_job_repository.replace_batches(job_id, batch_rows)

    def update_processing_job_state(self, job_id: str, state: str, **fields: Any) -> None:
        if not self.processing_job_repository:
            raise RuntimeError("Processing job repository is not configured")
        self.processing_job_repository.update_job_state(job_id, state, **fields)

    def update_processing_batch_state(self, job_id: str, batch_order: int, state: str, **fields: Any) -> None:
        if not self.processing_job_repository:
            raise RuntimeError("Processing job repository is not configured")
        self.processing_job_repository.update_batch_state(job_id, batch_order, state, **fields)

    def get_processing_job_snapshot(self, job_id: str) -> Optional[Dict[str, Any]]:
        if not self.processing_job_repository:
            return None
        return self.processing_job_repository.get_job_snapshot(job_id)

    def get_recoverable_processing_job_snapshot(self) -> Optional[Dict[str, Any]]:
        if not self.processing_job_repository:
            return None
        snapshot = self.processing_job_repository.get_recoverable_job_snapshot()
        if snapshot:
            return self._attach_recovery_decision(snapshot)
        return None

    def get_first_non_completed_batch(self, job_id: str) -> Optional[Dict[str, Any]]:
        if not self.processing_job_repository:
            return None
        return self.processing_job_repository.get_first_non_completed_batch(job_id)

    def get_recovery_resume_plan(self, job_id: str) -> Optional[Dict[str, Any]]:
        snapshot = self.get_processing_job_snapshot(job_id)
        if not snapshot:
            return None

        resume_from = self.get_first_non_completed_batch(job_id)
        preserved_batches = [
            batch for batch in snapshot["batches"] if batch["state"] == "completed"
        ]
        remaining_batches = []
        fallback = None

        if resume_from and self._is_safe_recovery_batch(snapshot, resume_from):
            remaining_batches = [
                batch
                for batch in snapshot["batches"]
                if batch["batch_order"] >= resume_from["batch_order"]
            ]
        else:
            resume_from = None
            fallback = self._build_recovery_fallback(snapshot["job"])

        return {
            "job": snapshot["job"],
            "project": snapshot["project"],
            "preserved_batches": preserved_batches,
            "resume_from": resume_from,
            "remaining_batches": remaining_batches,
            "fallback": fallback,
        }

    def acknowledge_processing_completion(self, job_id: str) -> Optional[Dict[str, Any]]:
        if not self.processing_job_repository:
            raise RuntimeError("Processing job repository is not configured")
        return self.processing_job_repository.acknowledge_job_completion(
            job_id,
            datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        )

    def cleanup_interrupted_batch_artifacts(self, job_id: str) -> bool:
        resume_plan = self.get_recovery_resume_plan(job_id)
        if not resume_plan or not resume_plan["resume_from"]:
            return False

        project_path = self.get_project_path(resume_plan["job"]["project_id"])
        if not project_path:
            return False

        removed_any = False
        for relative_path in resume_plan["resume_from"].get("output_paths", []):
            absolute_path = Path(project_path) / relative_path
            if absolute_path.exists():
                absolute_path.unlink()
                removed_any = True

            waveform_path = self._waveform_path_for_relative(project_path, relative_path)
            if waveform_path and waveform_path.exists():
                waveform_path.unlink()
                removed_any = True

        return removed_any

    def discard_recoverable_job(self, job_id: str) -> bool:
        snapshot = self.get_processing_job_snapshot(job_id)
        if not snapshot:
            return False

        project_id = snapshot["job"]["project_id"]
        if not self.processing_job_repository or not self.project_repository:
            raise RuntimeError("Recovery discard requires repository access")

        with self.processing_job_repository.database.transaction() as connection:
            connection.execute(
                "DELETE FROM project_files WHERE project_id = ?",
                (project_id,),
            )
            connection.execute(
                "DELETE FROM projects WHERE id = ?",
                (project_id,),
            )

        self.processing_job_repository.delete_jobs_for_project(project_id)

        deleted = self.delete_project(project_id)
        return deleted

    def get_recovery_decision(self, job_id: str) -> Optional[Dict[str, Any]]:
        snapshot = self.get_processing_job_snapshot(job_id)
        if not snapshot:
            return None

        if snapshot["job"]["state"] == "interrupted":
            self.update_processing_job_state(job_id, "awaiting_recovery")
            snapshot = self.get_processing_job_snapshot(job_id)

        resume_plan = self.get_recovery_resume_plan(job_id)
        if not resume_plan:
            return None

        fallback = resume_plan.get("fallback")
        recovering_mode = self._detect_recovering_mode(snapshot)
        source_available = bool(snapshot["job"].get("source_type") and snapshot["job"].get("source_name"))
        can_safe_resume = recovering_mode == "safe_resume" or resume_plan["resume_from"] is not None
        can_rerun_from_source = source_available or recovering_mode == "rerun_from_source" or bool(
            fallback and fallback.get("type") == "full_rerun"
        )

        if recovering_mode:
            recovery_mode = recovering_mode
            recovery_message = None
        elif can_safe_resume:
            recovery_mode = "safe_resume"
            recovery_message = None
        elif can_rerun_from_source:
            recovery_mode = "rerun_from_source"
            if fallback["source_type"] == "url":
                recovery_message = "Safe resume is unavailable. Recover by rerunning from the persisted URL."
            else:
                recovery_message = "Safe resume is unavailable. Recover by rerunning from the original uploaded file."
        else:
            recovery_mode = "discard_only"
            recovery_message = "Safe resume is unavailable and no original source remains. Discard is required."

        return {
            "jobId": snapshot["job"]["id"],
            "projectId": snapshot["job"]["project_id"],
            "projectName": snapshot["project"]["name"],
            "state": snapshot["job"]["state"],
            "canSafeResume": can_safe_resume,
            "canRerunFromSource": can_rerun_from_source,
            "recoveryMode": recovery_mode,
            "recoveryMessage": recovery_message,
        }

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
        resolution = self.resolve_sqlite_file(project_id, filename)
        if not resolution:
            return None
        return resolution["path"]

    def resolve_sqlite_file(self, project_id: str, filename: str) -> Optional[Dict[str, Any]]:
        snapshot = self.get_sqlite_project_snapshot(project_id)
        if not snapshot:
            return None

        for file_row in snapshot["files"]:
            relative_path = file_row["relative_path"]
            if relative_path == filename or Path(relative_path).name == filename:
                project_path = self.get_project_path(project_id)
                if not project_path:
                    return None
                return {
                    "project_id": project_id,
                    "project_path": project_path,
                    "path": os.path.join(project_path, relative_path),
                    "relative_path": relative_path,
                    "file": file_row,
                }
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

    def repair_sqlite_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        project_row = self.get_sqlite_project(project_id)
        if not project_row:
            return None

        project_path = self.get_project_path(project_id)
        if not project_path or not os.path.isdir(project_path):
            return None

        file_rows = collect_project_file_rows(project_id, project_path)
        self.replace_sqlite_project_snapshot(project_row, file_rows)

        return {
            "project": project_row,
            "files": file_rows,
            "project_path": project_path,
        }

    def get_project_repair_state(self, project_id: str) -> Optional[Dict[str, Any]]:
        with self._repair_lock:
            state = self._repair_state.get(project_id)
            return dict(state) if state else None

    def start_project_repair(
        self,
        project_id: str,
        *,
        reason: Optional[str] = None,
        missing_relative_path: Optional[str] = None,
        sse_manager=None,
    ) -> Dict[str, Any]:
        with self._repair_lock:
            existing = self._repair_state.get(project_id)
            if existing and existing.get("status") == "running":
                return dict(existing)

            state = {
                "project_id": project_id,
                "status": "running",
                "reason": reason or "tracked_file_missing",
                "missing_relative_path": missing_relative_path,
            }
            self._repair_state[project_id] = state

        worker = threading.Thread(
            target=self._run_project_repair,
            args=(project_id, reason, missing_relative_path, sse_manager),
            daemon=True,
        )
        worker.start()
        return dict(state)

    def _run_project_repair(self, project_id: str, reason: Optional[str], missing_relative_path: Optional[str], sse_manager=None) -> None:
        payload = {
            "project_id": project_id,
            "status": "consistency_checking",
            "reason": reason or "tracked_file_missing",
            "missing_relative_path": missing_relative_path,
        }

        if sse_manager:
            sse_manager.create(project_id)
            sse_manager.publish(project_id, "repair_started", payload)

        try:
            result = self.repair_sqlite_project(project_id)
            if result is None:
                raise FileNotFoundError(f"Project {project_id} could not be repaired")

            completed = {
                **payload,
                "status": "consistency_ready",
                "file_count": len(result["files"]),
            }
            with self._repair_lock:
                self._repair_state[project_id] = completed

            if sse_manager:
                sse_manager.publish(project_id, "repair_completed", completed)
        except Exception as exc:
            failed = {
                **payload,
                "status": "consistency_failed",
                "message": str(exc),
            }
            with self._repair_lock:
                self._repair_state[project_id] = failed

            if sse_manager:
                sse_manager.publish(project_id, "repair_failed", failed)

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

    def _is_safe_recovery_batch(self, snapshot: Dict[str, Any], batch: Dict[str, Any]) -> bool:
        allowed_states = {"interrupted", "failed", "running"}
        if batch["state"] not in allowed_states:
            return False

        for previous_batch in snapshot["batches"]:
            if previous_batch["batch_order"] >= batch["batch_order"]:
                break
            if previous_batch["state"] != "completed":
                return False

        return bool(batch.get("output_paths"))

    def _build_recovery_fallback(self, job_row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        source_name = job_row.get("source_name")
        source_type = job_row.get("source_type")
        if not source_name or not source_type:
            return None

        return {
            "type": "full_rerun",
            "source_type": source_type,
            "source_name": source_name,
        }

    def _waveform_path_for_relative(self, project_path: str, relative_path: str) -> Optional[Path]:
        relative = Path(relative_path)
        if relative.suffix.lower() not in {".wav", ".mp3", ".flac"}:
            return None

        if relative.parts and relative.parts[0] == "waveforms":
            return Path(project_path) / relative

        return Path(project_path) / "waveforms" / f"{relative.stem}.json"

    def _attach_recovery_decision(self, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        job_state = snapshot["job"]["state"]
        if job_state in {"interrupted", "awaiting_recovery", "recovering"}:
            enriched_snapshot = dict(snapshot)
            enriched_snapshot["recovery"] = self.get_recovery_decision(snapshot["job"]["id"])
            return enriched_snapshot
        return snapshot

    def _detect_recovering_mode(self, snapshot: Dict[str, Any]) -> Optional[str]:
        if snapshot["job"]["state"] != "recovering":
            return None

        if any(batch["state"] == "rerunning" for batch in snapshot["batches"]):
            return "safe_resume"

        if snapshot["batches"] and all(batch["state"] == "pending" for batch in snapshot["batches"]):
            return "rerun_from_source"

        return None
