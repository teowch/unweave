import os
from pathlib import Path

from persistence import Database
from persistence.import_legacy import collect_project_file_rows
from persistence.project_repository import ProjectRepository
from services.ProjectService import ProjectService


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


def test_collect_project_file_rows_classifies_rescanned_project_snapshot(library_root):
    project_path = library_root / "project-gamma"
    create_legacy_project(
        project_path,
        files={
            "mix.wav": "audio",
            "stems/drums.htdemucs_6s.flac": "stem",
            "waveforms/drums.htdemucs_6s.json": "{}",
            "docs/readme.txt": "notes",
        },
    )

    file_rows = collect_project_file_rows("project-gamma", project_path)

    assert file_rows == [
        {"project_id": "project-gamma", "relative_path": "docs/readme.txt", "role": "other"},
        {"project_id": "project-gamma", "relative_path": "mix.wav", "role": "audio"},
        {"project_id": "project-gamma", "relative_path": "stems/drums.htdemucs_6s.flac", "role": "audio"},
        {"project_id": "project-gamma", "relative_path": "waveforms/drums.htdemucs_6s.json", "role": "waveform"},
    ]


def test_project_repair_replaces_only_the_affected_project_snapshot(library_root):
    project_alpha = library_root / "project-alpha"
    create_legacy_project(
        project_alpha,
        files={
            "song.wav": "audio",
            "stems/vocals.htdemucs_6s.flac": "stem",
        },
    )

    project_beta = library_root / "project-beta"
    create_legacy_project(
        project_beta,
        files={
            "other.wav": "audio",
        },
    )

    repository = ProjectRepository(Database(str(library_root)))
    repository.replace_project_snapshot(
        {"id": "project-alpha", "name": "Alpha", "date": "2026-03-27", "thumbnail": None},
        [
            {"project_id": "project-alpha", "relative_path": "song.wav", "role": "audio"},
            {"project_id": "project-alpha", "relative_path": "ghost.flac", "role": "audio"},
        ],
    )
    repository.replace_project_snapshot(
        {"id": "project-beta", "name": "Beta", "date": "2026-03-27", "thumbnail": None},
        [
            {"project_id": "project-beta", "relative_path": "other.wav", "role": "audio"},
        ],
    )

    service = ProjectService(str(library_root), project_repository=repository)

    result = service.repair_sqlite_project("project-alpha")

    assert result is not None
    assert {row["relative_path"] for row in repository.list_project_files("project-alpha")} == {
        "song.wav",
        "stems/vocals.htdemucs_6s.flac",
    }
    assert {row["relative_path"] for row in repository.list_project_files("project-beta")} == {
        "other.wav",
    }
