import os
import logging
import numpy as np
import yt_dlp
import soundfile as sf
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

from utils.waveform import precompute_waveform, precompute_waveforms_for_outputs

from AudioProcessor import AudioProcessor
from modules import MODULE_REGISTRY, get_dependency_chain, get_module

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac"}


class AudioService:
    def __init__(self, project_service, file_service):
        self.project_service = project_service
        self.file_service = file_service
        self.processor = AudioProcessor()

    def process_separation(
        self,
        project_id: str,
        filename: str,
        modules_to_run: List[str],
        sse_message_handler,
        thumbnail: Optional[str] = None,
        display_name: Optional[str] = None,
        source_type: str = "local_file",
        job_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Runs the separation process for a project.
        """
        output_folder = self.project_service.get_project_path(project_id)
        if not output_folder:
            raise FileNotFoundError(f"Project folder for {project_id} not found")

        original_file_path = os.path.join(output_folder, filename)
        if not os.path.exists(original_file_path):
            raise FileNotFoundError(f"Original file for {project_id} not found")

        self._refresh_project_snapshot(project_id, filename, display_name=display_name, thumbnail=thumbnail)
        executed_modules = set(self.project_service.get_sqlite_project_status(project_id)["executed_modules"])

        modules_in_order = []
        requested_modules = set(modules_to_run)
        for module_name in modules_to_run:
            if module_name not in MODULE_REGISTRY:
                logger.warning(f"Unknown module requested: {module_name}")
                continue

            for dependency in get_dependency_chain(module_name):
                if dependency not in executed_modules and dependency not in modules_in_order:
                    modules_in_order.append(dependency)

        if modules_in_order:
            if job_id is None:
                job_id = self._build_job_id(project_id)
                self.project_service.create_processing_job(
                    {
                        "id": job_id,
                        "project_id": project_id,
                        "state": "running",
                        "source_type": source_type,
                        "source_name": filename,
                        "requested_by": "user",
                        "download_state": "completed" if source_type == "url" else "pending",
                        "download_progress": 100 if source_type == "url" else 0,
                        "started_at": self._timestamp(),
                    }
                )
                self._publish_processing_updated(
                    sse_message_handler,
                    job_id,
                    project_id,
                    "running",
                )

            self.project_service.replace_processing_batches(
                job_id,
                [
                    {
                        "job_id": job_id,
                        "module_id": module_name,
                        "state": "pending",
                        "progress": 0,
                        "batch_order": index,
                        "input_relative_path": self._resolve_input_relative_path(project_id, filename, module_name),
                        "output_paths": [],
                        "started_at": None,
                        "finished_at": None,
                        "error_message": None,
                        "cleanup_required": False,
                        "requested_directly": module_name in requested_modules,
                    }
                    for index, module_name in enumerate(modules_in_order, start=1)
                ],
            )
            self._publish_processing_updated(
                sse_message_handler,
                job_id,
                project_id,
                "running",
            )

            try:
                for batch_order, module_name in enumerate(modules_in_order, start=1):
                    config = get_module(module_name)
                    input_path = self._resolve_input_path(project_id, filename, module_name)

                    self.project_service.update_processing_batch_state(
                        job_id,
                        batch_order,
                        "running",
                        progress=0,
                        started_at=self._timestamp(),
                        cleanup_required=False,
                    )
                    self._publish_processing_updated(
                        sse_message_handler,
                        job_id,
                        project_id,
                        "running",
                    )
                    sse_message_handler.set_module(module_name)
                    sse_message_handler.set_current_model(config["model"])

                    outputs = self.processor.execute_module(
                        module_name=module_name,
                        input_path=input_path,
                        output_dir=output_folder,
                        interceptor_callback=self._build_batch_progress_callback(
                            job_id,
                            batch_order,
                            sse_message_handler,
                            getattr(sse_message_handler, "interceptor_callback", None),
                        ),
                    )
                    precompute_waveforms_for_outputs(outputs, output_folder)
                    self._refresh_project_snapshot(project_id, filename, display_name=display_name, thumbnail=thumbnail)
                    executed_modules = set(self.project_service.get_sqlite_project_status(project_id)["executed_modules"])
                    self.project_service.update_processing_batch_state(
                        job_id,
                        batch_order,
                        "completed",
                        progress=100,
                        finished_at=self._timestamp(),
                        output_paths=self._to_relative_output_paths(output_folder, outputs),
                        cleanup_required=False,
                    )
                    self._publish_processing_updated(
                        sse_message_handler,
                        job_id,
                        project_id,
                        "running",
                    )

                self.project_service.update_processing_job_state(
                    job_id,
                    "completed",
                    finished_at=self._timestamp(),
                )
                self._publish_processing_updated(
                    sse_message_handler,
                    job_id,
                    project_id,
                    "completed",
                )
            except Exception as exc:
                self.project_service.update_processing_batch_state(
                    job_id,
                    batch_order,
                    "failed",
                    finished_at=self._timestamp(),
                    error_message=str(exc),
                    cleanup_required=True,
                )
                self.project_service.update_processing_job_state(
                    job_id,
                    "failed",
                    finished_at=self._timestamp(),
                )
                self._publish_processing_updated(
                    sse_message_handler,
                    job_id,
                    project_id,
                    "failed",
                )
                raise

        snapshot = self.project_service.get_sqlite_project_snapshot(project_id)

        return {
            'message': 'Separation successful',
            'id': project_id,
            'stems': snapshot['history']['stems'],
            'executed_modules': snapshot['status']['executed_modules'],
            'thumbnail': snapshot['project'].get('thumbnail')
        }

    def _build_batch_progress_callback(self, job_id: str, batch_order: int, sse_message_handler, callback):
        def wrapped(message: str, event_type: str = "processing"):
            if event_type == "processing" and "%" in message:
                try:
                    percentage = message.split("%")[0].strip().split()[-1]
                    self.project_service.update_processing_batch_state(
                        job_id,
                        batch_order,
                        "running",
                        progress=int(float(percentage)),
                    )
                    snapshot = self.project_service.get_processing_job_snapshot(job_id)
                    if snapshot:
                        self._publish_processing_updated(
                            sse_message_handler,
                            job_id,
                            snapshot["job"]["project_id"],
                            "running",
                        )
                except (ValueError, TypeError):
                    logger.debug("Unable to parse processing percentage from %s", message)

            if callback is not None:
                return callback(message, event_type)
            return None

        return wrapped

    def update_processing_download_state(self, job_id: str, state: str, progress: int, sse_message_handler=None):
        self.project_service.update_processing_job_state(
            job_id,
            "running",
            download_state=state,
            download_progress=progress,
        )
        snapshot = self.project_service.get_processing_job_snapshot(job_id)
        if snapshot:
            self._publish_processing_updated(
                sse_message_handler,
                job_id,
                snapshot["job"]["project_id"],
                snapshot["job"]["state"],
            )

    def _build_job_id(self, project_id: str) -> str:
        return f"{project_id}:{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"

    def _timestamp(self) -> str:
        return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    def _to_relative_output_paths(self, output_folder: str, outputs: Dict[str, str]) -> List[str]:
        relative_paths = []
        for output_path in outputs.values():
            relative_paths.append(Path(output_path).relative_to(output_folder).as_posix())
        return sorted(relative_paths)

    def _resolve_input_path(self, project_id: str, original_filename: str, module_name: str) -> str:
        config = get_module(module_name)
        output_folder = self.project_service.get_project_path(project_id)
        if not config.get("depends_on"):
            return os.path.join(output_folder, original_filename)

        parent_module = config["depends_on"]
        input_stem = config.get("input_stem")
        if not input_stem:
            raise ValueError(f"Module '{module_name}' requires an input stem")

        parent_output_name = MODULE_REGISTRY[parent_module]["custom_output_names"][input_stem]
        expected_filename = f"{parent_output_name}.{self.processor.output_format}"
        resolved = self.project_service.resolve_sqlite_file_path(project_id, expected_filename)
        if resolved and os.path.exists(resolved):
            return resolved

        fallback = os.path.join(output_folder, expected_filename)
        if os.path.exists(fallback):
            return fallback

        raise FileNotFoundError(
            f"Dependency output '{expected_filename}' for module '{module_name}' was not found"
        )

    def _resolve_input_relative_path(self, project_id: str, original_filename: str, module_name: str) -> str:
        config = get_module(module_name)
        if not config.get("depends_on"):
            return original_filename

        parent_module = config["depends_on"]
        input_stem = config.get("input_stem")
        if not input_stem:
            raise ValueError(f"Module '{module_name}' requires an input stem")

        parent_output_name = MODULE_REGISTRY[parent_module]["custom_output_names"][input_stem]
        expected_filename = f"{parent_output_name}.{self.processor.output_format}"
        resolved = self.project_service.resolve_sqlite_file(project_id, expected_filename)
        if resolved:
            return resolved["relative_path"]
        return expected_filename

    def _refresh_project_snapshot(self, project_id: str, original_filename: str, display_name: Optional[str] = None, thumbnail: Optional[str] = None):
        existing_project = self.project_service.get_sqlite_project(project_id) or {}
        filename_no_ext = os.path.splitext(original_filename)[0]
        timestamp = existing_project.get("date") or (project_id.split('_')[0] if '_' in project_id else datetime.now().strftime("%Y%m%d%H%M%S"))
        project_row = {
            "id": project_id,
            "name": display_name or existing_project.get("name") or filename_no_ext,
            "date": timestamp,
            "thumbnail": thumbnail if thumbnail is not None else existing_project.get("thumbnail"),
        }
        file_rows = self._collect_project_file_rows(project_id, original_filename)
        self.project_service.replace_sqlite_project_snapshot(project_row, file_rows)
        return self.project_service.get_sqlite_project_snapshot(project_id)

    def _collect_project_file_rows(self, project_id: str, original_filename: str) -> List[Dict[str, str]]:
        project_path = self.project_service.get_project_path(project_id)
        file_rows = []

        for root, _, files in os.walk(project_path):
            for file_name in sorted(files):
                full_path = os.path.join(root, file_name)
                relative_path = Path(full_path).relative_to(project_path).as_posix()
                if relative_path == "metadata.json":
                    continue
                file_rows.append(
                    {
                        "project_id": project_id,
                        "relative_path": relative_path,
                        "role": self._classify_file_role(relative_path, original_filename),
                    }
                )

        return file_rows

    def _classify_file_role(self, relative_path: str, original_filename: str) -> str:
        if relative_path == original_filename or Path(relative_path).name == original_filename:
            return "original"
        suffix = Path(relative_path).suffix.lower()
        if suffix in AUDIO_EXTENSIONS:
            return "audio"
        if suffix == ".json" and "waveforms" in Path(relative_path).parts:
            return "waveform"
        return "other"

    def download_url(self, url, sse_message_handler, job_id: Optional[str] = None):
        progress_hook = self._build_download_progress_callback(job_id, sse_message_handler)
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join('uploads', '%(title)s.%(ext)s'),
            'postprocessors': [{'key': 'FFmpegExtractAudio','preferredcodec': 'wav','preferredquality': '192'}],
            'prefer_ffmpeg': True,
            'keepvideo': False,
            'quiet': True,
            'no_warnings': True,
            'noprogress': True,
            'no_color': True,
            'noplaylist': True,
            'progress_hooks': [progress_hook],
            'writethumbnail': True,
        }

        filename = None
        downloaded_filepath = None
        thumbnail = None
        title = None

        sse_message_handler.set_module('download')
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=True)
                temp_name = ydl.prepare_filename(info)
                base, _ = os.path.splitext(temp_name)
                downloaded_filepath = base + ".wav"
                filename = os.path.basename(downloaded_filepath)
                thumbnail = info.get('thumbnail')
                title = info.get('title')
            except Exception as e:
                sse_message_handler.send_error(f"Failed to download URL: {e}")
                raise Exception(f"Failed to download URL: {e}")

        if not os.path.exists(downloaded_filepath):
            raise Exception("Download failed")

        return downloaded_filepath, filename, thumbnail, title

    def _build_download_progress_callback(self, job_id: Optional[str], sse_message_handler):
        def callback(message: dict):
            if message.get('status') != 'downloading' or job_id is None:
                return None

            raw_percent = message.get('_percent_str') or "0"
            try:
                progress = int(float(raw_percent.replace('%', '').strip()))
            except ValueError:
                progress = 0

            self.update_processing_download_state(
                job_id,
                "running",
                progress,
                sse_message_handler=sse_message_handler,
            )
            return None

        return callback

    def _publish_processing_updated(self, sse_message_handler, job_id: str, project_id: str, state: str):
        if sse_message_handler and hasattr(sse_message_handler, "publish_processing_updated"):
            sse_message_handler.publish_processing_updated(job_id, project_id, state)

    def recover_processing_job(self, job_id: str, recovery_mode: str, sse_message_handler=None) -> Dict[str, Any]:
        decision = self.project_service.get_recovery_decision(job_id)
        if not decision:
            raise FileNotFoundError("Processing job not found")

        if recovery_mode not in {"safe_resume", "rerun_from_source"}:
            raise ValueError("Unsupported recoveryMode")

        if recovery_mode == "safe_resume":
            if not decision["canSafeResume"]:
                raise ValueError(decision["recoveryMessage"] or "Safe resume is unavailable")
            snapshot = self._recover_by_safe_resume(job_id)
        else:
            if not decision["canRerunFromSource"]:
                raise ValueError(decision["recoveryMessage"] or "Rerun from source is unavailable")
            snapshot = self._recover_by_rerun_from_source(job_id)

        self._publish_processing_updated(
            sse_message_handler,
            snapshot["job"]["id"],
            snapshot["job"]["project_id"],
            snapshot["job"]["state"],
        )
        return self.project_service.get_active_processing_job_snapshot() or snapshot

    def _recover_by_safe_resume(self, job_id: str) -> Dict[str, Any]:
        resume_plan = self.project_service.get_recovery_resume_plan(job_id)
        if not resume_plan or not resume_plan["resume_from"]:
            raise ValueError("Safe resume is unavailable")

        self.project_service.cleanup_interrupted_batch_artifacts(job_id)
        self.project_service.processing_job_repository.mark_job_recovering(job_id)

        resume_batch = resume_plan["resume_from"]
        self.project_service.processing_job_repository.reset_batch_for_recovery(
            job_id,
            resume_batch["batch_order"],
            state="rerunning",
        )

        for batch in resume_plan["remaining_batches"]:
            if batch["batch_order"] <= resume_batch["batch_order"]:
                continue
            self.project_service.processing_job_repository.reset_batch_for_recovery(
                job_id,
                batch["batch_order"],
                state="pending",
            )

        return self.project_service.get_processing_job_snapshot(job_id)

    def _recover_by_rerun_from_source(self, job_id: str) -> Dict[str, Any]:
        decision = self.project_service.get_recovery_decision(job_id)
        if not decision or not decision["canRerunFromSource"]:
            raise ValueError("Rerun from source is unavailable")

        snapshot = self.project_service.get_processing_job_snapshot(job_id)
        if not snapshot:
            raise FileNotFoundError("Processing job not found")

        project_path = self.project_service.get_project_path(snapshot["job"]["project_id"])
        if not project_path:
            raise FileNotFoundError("Project folder not found")

        for batch in snapshot["batches"]:
            for relative_path in batch.get("output_paths", []):
                absolute_path = Path(project_path) / relative_path
                if absolute_path.exists():
                    absolute_path.unlink()

                waveform_path = self.project_service._waveform_path_for_relative(project_path, relative_path)
                if waveform_path and waveform_path.exists():
                    waveform_path.unlink()

        self.project_service.processing_job_repository.mark_job_recovering(job_id)
        self.project_service.processing_job_repository.reset_batches_from_order(job_id, 1)
        return self.project_service.get_processing_job_snapshot(job_id)

    def unify_tracks(self, project_id: str, track_names: List[str]) -> str:
        """
        Mixes multiple tracks into one. Returns the new filename.
        """
        directory = self.project_service.get_project_path(project_id)
        if not directory:
            raise FileNotFoundError("Project not found")

        snapshot = self.project_service.get_sqlite_project_snapshot(project_id)
        if not snapshot:
            raise FileNotFoundError("Project snapshot not found")

        input_bases = [os.path.splitext(name)[0] for name in track_names]
        combined_name = "+".join(input_bases)
        new_stem_name = f"{combined_name}.unified.wav"
        output_path = os.path.join(directory, new_stem_name)

        inputs = [os.path.join(directory, name) for name in track_names]

        data_list = []
        sr = None

        for p in inputs:
            data, samplerate = sf.read(p)
            if sr is None:
                sr = samplerate
            elif sr != samplerate:
                raise ValueError(f"Sample rate mismatch: {os.path.basename(p)} is {samplerate}, expected {sr}")

            if data.ndim == 1:
                data = data[:, np.newaxis]
            data_list.append(data)

        if not data_list:
            raise ValueError("No audio data read")

        max_len = max(len(d) for d in data_list)
        max_ch = max(d.shape[1] for d in data_list)
        mixed = np.zeros((max_len, max_ch), dtype=np.float32)

        for d in data_list:
            length, channels = d.shape
            if channels == 1 and max_ch > 1:
                d = np.tile(d, (1, max_ch))
            elif channels != max_ch:
                raise ValueError("Channel mismatch (non-mono)")
            mixed[:length, :] += d

        mixed = np.clip(mixed, -1.0, 1.0)
        sf.write(output_path, mixed, sr)

        waveform_dir = os.path.join(directory, 'waveforms')
        waveform_json = os.path.join(waveform_dir, f"{combined_name}.unified.json")
        try:
            precompute_waveform(output_path, waveform_json)
        except Exception as e:
            logger.warning(f"Waveform precompute failed for unified stem: {e}")

        original_file = snapshot["status"]["original_file"]
        self._refresh_project_snapshot(project_id, original_file)

        return new_stem_name
