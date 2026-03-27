import os
from pathlib import Path

from persistence import Database
from persistence.project_repository import ProjectRepository


AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac"}


def create_legacy_project(project_path: Path, metadata=None, files=None):
    project_path.mkdir(parents=True, exist_ok=True)

    if metadata is not None:
        metadata_path = project_path / "metadata.json"
        metadata_path.write_text(__import__("json").dumps(metadata), encoding="utf-8")

    for relative_path, contents in (files or {}).items():
        file_path = project_path / relative_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(contents, encoding="utf-8")


def import_single_project(library_root: Path, project_name: str, metadata=None, files=None):
    from persistence.import_legacy import LegacyProjectImporter

    project_path = library_root / project_name
    create_legacy_project(project_path, metadata=metadata, files=files)

    repository = ProjectRepository(Database(str(library_root)))
    importer = LegacyProjectImporter(str(library_root), repository)
    importer.import_project_folder(project_path)
    return repository


def test_import_stores_relative_paths_and_expected_roles(library_root):
    repository = import_single_project(
        library_root,
        "project-alpha",
        metadata={"name": "Project Alpha", "date": "2026-03-27", "thumbnail": "thumb.png"},
        files={
            "mix.mp3": "audio",
            "stems/vocals.htdemucs_6s.flac": "stem",
            "waveforms/vocals.htdemucs_6s.json": "{}",
            "notes/info.txt": "notes",
        },
    )

    files = repository.list_project_files("project-alpha")
    relative_paths = {row["relative_path"] for row in files}
    roles_by_path = {row["relative_path"]: row["role"] for row in files}

    assert relative_paths == {
        "mix.mp3",
        "notes/info.txt",
        "stems/vocals.htdemucs_6s.flac",
        "waveforms/vocals.htdemucs_6s.json",
    }
    assert all(not os.path.isabs(path) for path in relative_paths)
    assert roles_by_path["mix.mp3"] == "audio"
    assert roles_by_path["stems/vocals.htdemucs_6s.flac"] == "audio"
    assert roles_by_path["waveforms/vocals.htdemucs_6s.json"] == "waveform"
    assert roles_by_path["notes/info.txt"] == "other"
    assert "metadata.json" not in relative_paths


def test_import_does_not_store_absolute_roots(library_root):
    repository = import_single_project(
        library_root,
        "project-beta",
        metadata={"name": "Project Beta"},
        files={"nested/audio.wav": "audio"},
    )

    files = repository.list_project_files("project-beta")

    assert len(files) == 1
    assert files[0]["relative_path"] == "nested/audio.wav"
    assert files[0]["role"] == "audio"
    assert ":/" not in files[0]["relative_path"]
    assert ":\\" not in files[0]["relative_path"]
