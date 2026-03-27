from pathlib import Path

from persistence import Database
from persistence.project_repository import ProjectRepository
from services.ProjectService import ProjectService


def create_legacy_project(project_path: Path, metadata=None, files=None):
    import json

    project_path.mkdir(parents=True, exist_ok=True)

    if metadata is not None:
        metadata_path = project_path / "metadata.json"
        metadata_path.write_text(json.dumps(metadata), encoding="utf-8")

    for relative_path, contents in (files or {}).items():
        file_path = project_path / relative_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(contents, encoding="utf-8")


def test_bootstrap_imports_legacy_projects_once(library_root):
    from persistence.import_legacy import LegacyProjectImporter

    create_legacy_project(
        library_root / "project-001",
        metadata={
            "name": "First Project",
            "date": "2026-03-27",
            "thumbnail": "thumbs/one.png",
        },
        files={
            "original.wav": "audio",
            "waveforms/original.json": "{}",
        },
    )
    create_legacy_project(
        library_root / "project-002",
        metadata=None,
        files={
            "stems/piano.htdemucs_6s.flac": "audio",
            "notes.txt": "hello",
        },
    )

    repository = ProjectRepository(Database(str(library_root)))
    importer = LegacyProjectImporter(str(library_root), repository)

    assert importer.bootstrap_if_needed() is True

    projects = repository.list_projects()
    assert {project["id"] for project in projects} == {"project-001", "project-002"}

    first_project = repository.get_project("project-001")
    second_project = repository.get_project("project-002")
    second_files = repository.list_project_files("project-002")

    assert first_project["name"] == "First Project"
    assert first_project["date"] == "2026-03-27"
    assert first_project["thumbnail"] == "thumbs/one.png"
    assert second_project["name"] == "project-002"
    assert second_project["date"] == "project-002"
    assert second_project["thumbnail"] is None
    assert {row["relative_path"] for row in second_files} == {
        "notes.txt",
        "stems/piano.htdemucs_6s.flac",
    }

    assert importer.bootstrap_if_needed() is False
    assert len(repository.list_projects()) == 2
    assert len(repository.list_project_files("project-001")) == 2
    assert len(repository.list_project_files("project-002")) == 2


def test_project_service_delegates_sqlite_bootstrap_and_reads(library_root):
    from persistence.import_legacy import LegacyProjectImporter

    create_legacy_project(
        library_root / "service-project",
        metadata={"name": "Service Project", "date": "2026-03-28"},
        files={"mix.flac": "audio", "waveforms/mix.json": "{}"},
    )

    repository = ProjectRepository(Database(str(library_root)))
    importer = LegacyProjectImporter(str(library_root), repository)
    service = ProjectService(
        str(library_root),
        project_repository=repository,
        legacy_importer=importer,
    )

    assert service.bootstrap_sqlite_metadata() is True

    projects = service.list_sqlite_projects()
    project = service.get_sqlite_project("service-project")
    files = service.get_sqlite_project_files("service-project")

    assert [item["id"] for item in projects] == ["service-project"]
    assert project["name"] == "Service Project"
    assert {row["relative_path"] for row in files} == {"mix.flac", "waveforms/mix.json"}
