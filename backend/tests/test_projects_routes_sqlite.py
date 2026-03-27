from flask import Flask

from persistence import Database
from persistence.project_repository import ProjectRepository
from routes import projects_routes
from services.FileService import FileService
from services.ProjectService import ProjectService


PROJECT_ID = "project-500"
PROJECT_ROW = {
    "id": PROJECT_ID,
    "name": "SQLite Project",
    "date": "2026-03-27T18:00:00Z",
    "thumbnail": "thumbs/project-500.png",
}
FILE_ROWS = [
    {"project_id": PROJECT_ID, "relative_path": "song.wav", "role": "audio"},
    {"project_id": PROJECT_ID, "relative_path": "base_vocals.vocal.flac", "role": "audio"},
    {"project_id": PROJECT_ID, "relative_path": "waveforms/song.json", "role": "waveform"},
]


def _create_test_context(library_root, tmp_path, monkeypatch):
    project_dir = library_root / PROJECT_ID
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "song.wav").write_text("audio", encoding="utf-8")
    (project_dir / "base_vocals.vocal.flac").write_text("stem", encoding="utf-8")
    (project_dir / "waveforms").mkdir(exist_ok=True)
    (project_dir / "waveforms" / "song.json").write_text("{}", encoding="utf-8")

    repository = ProjectRepository(Database(str(library_root)))
    repository.replace_project_snapshot(PROJECT_ROW, FILE_ROWS)

    project_service = ProjectService(str(library_root), project_repository=repository)
    file_service = FileService(project_service, str(tmp_path / "uploads"))

    monkeypatch.setattr(projects_routes, "project_service", project_service)
    monkeypatch.setattr(projects_routes, "file_service", file_service)

    app = Flask(__name__)
    app.register_blueprint(projects_routes.projects_bp, url_prefix="/api")

    return app.test_client(), project_service, file_service


def test_history_route_returns_sqlite_backed_payload(library_root, tmp_path, monkeypatch):
    client, _, _ = _create_test_context(library_root, tmp_path, monkeypatch)

    response = client.get("/api/history")

    assert response.status_code == 200
    assert response.get_json() == [
        {
            "id": PROJECT_ID,
            "name": "SQLite Project",
            "date": "2026-03-27T18:00:00Z",
            "stems": ["base_vocals.vocal.flac"],
            "original": "song.wav",
            "thumbnail": "thumbs/project-500.png",
        }
    ]


def test_project_status_route_uses_sqlite_backed_module_state(library_root, tmp_path, monkeypatch):
    client, _, _ = _create_test_context(library_root, tmp_path, monkeypatch)

    response = client.get(f"/api/project/{PROJECT_ID}/status")

    assert response.status_code == 200
    assert response.get_json() == {
        "id": PROJECT_ID,
        "available_modules": [
            "htdemucs_4s",
            "htdemucs_6s",
            "lead_backing",
            "male_female",
            "male_female_secondary",
        ],
        "executed_modules": ["vocal_instrumental"],
        "original_file": "song.wav",
    }


def test_project_route_returns_canonical_sqlite_snapshot(library_root, tmp_path, monkeypatch):
    client, _, _ = _create_test_context(library_root, tmp_path, monkeypatch)

    response = client.get(f"/api/project/{PROJECT_ID}")

    assert response.status_code == 200
    assert response.get_json() == {
        "project": PROJECT_ROW,
        "files": [
            {"project_id": PROJECT_ID, "relative_path": "base_vocals.vocal.flac", "role": "audio"},
            {"project_id": PROJECT_ID, "relative_path": "song.wav", "role": "audio"},
            {"project_id": PROJECT_ID, "relative_path": "waveforms/song.json", "role": "waveform"},
        ],
        "history": {
            "id": PROJECT_ID,
            "name": "SQLite Project",
            "date": "2026-03-27T18:00:00Z",
            "stems": ["base_vocals.vocal.flac"],
            "original": "song.wav",
            "thumbnail": "thumbs/project-500.png",
        },
        "status": {
            "id": PROJECT_ID,
            "available_modules": [
                "htdemucs_4s",
                "htdemucs_6s",
                "lead_backing",
                "male_female",
                "male_female_secondary",
            ],
            "executed_modules": ["vocal_instrumental"],
            "original_file": "song.wav",
        },
        "state": {
            "audio_files": ["base_vocals.vocal.flac", "song.wav"],
            "available_modules": [
                "htdemucs_4s",
                "htdemucs_6s",
                "lead_backing",
                "male_female",
                "male_female_secondary",
            ],
            "executed_modules": ["vocal_instrumental"],
            "original_file": "song.wav",
            "stems": ["base_vocals.vocal.flac"],
        },
    }


def test_project_status_route_returns_404_for_unknown_project(library_root, tmp_path, monkeypatch):
    client, _, _ = _create_test_context(library_root, tmp_path, monkeypatch)

    response = client.get("/api/project/missing-project/status")

    assert response.status_code == 404
    assert response.get_json()["error"] == "Project not found"


def test_project_route_returns_404_for_unknown_project(library_root, tmp_path, monkeypatch):
    client, _, _ = _create_test_context(library_root, tmp_path, monkeypatch)

    response = client.get("/api/project/missing-project")

    assert response.status_code == 404
    assert response.get_json()["error"] == "Project not found"


def test_file_service_respects_sqlite_membership(library_root, tmp_path, monkeypatch):
    _, _, file_service = _create_test_context(library_root, tmp_path, monkeypatch)

    valid_path = file_service.get_file_path(PROJECT_ID, "base_vocals.vocal.flac")
    missing_membership = file_service.get_file_path(PROJECT_ID, "not-in-db.flac")

    assert valid_path.endswith("base_vocals.vocal.flac")
    assert missing_membership is None
