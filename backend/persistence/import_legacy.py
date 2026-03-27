import json
from pathlib import Path


AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac"}


def classify_relative_path(relative_path):
    relative_path = Path(relative_path)

    if relative_path.suffix.lower() in AUDIO_EXTENSIONS:
        return "audio"

    if relative_path.suffix.lower() == ".json" and "waveforms" in relative_path.parts:
        return "waveform"

    return "other"


def collect_project_file_rows(project_id, folder_path):
    folder_path = Path(folder_path)
    file_rows = []

    for file_path in sorted(folder_path.rglob("*")):
        if not file_path.is_file():
            continue

        relative_path = file_path.relative_to(folder_path)
        if relative_path.as_posix() == "metadata.json":
            continue

        file_rows.append(
            {
                "project_id": project_id,
                "relative_path": relative_path.as_posix(),
                "role": classify_relative_path(relative_path),
            }
        )

    return file_rows


class LegacyProjectImporter:
    def __init__(self, library_folder, project_repository):
        self.library_folder = Path(library_folder)
        self.project_repository = project_repository

    def bootstrap_if_needed(self):
        if self.project_repository.list_projects():
            return False

        if not self.library_folder.exists():
            return False

        imported_any = False
        for folder_path in sorted(self.library_folder.iterdir()):
            if not folder_path.is_dir() or folder_path.name == ".unweave":
                continue
            self.import_project_folder(folder_path)
            imported_any = True

        return imported_any

    def import_project_folder(self, folder_path):
        folder_path = Path(folder_path)
        metadata = self._load_metadata(folder_path / "metadata.json")
        project_id = folder_path.name
        project_row = {
            "id": project_id,
            "name": metadata.get("name") or project_id,
            "date": metadata.get("date") or project_id,
            "thumbnail": metadata.get("thumbnail"),
        }
        file_rows = collect_project_file_rows(project_id, folder_path)

        self.project_repository.replace_project_snapshot(project_row, file_rows)

    def _load_metadata(self, metadata_path):
        if not metadata_path.exists():
            return {}

        try:
            with metadata_path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, json.JSONDecodeError):
            return {}

        return data if isinstance(data, dict) else {}

    def _classify_role(self, relative_path):
        return classify_relative_path(relative_path)
