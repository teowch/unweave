from flask import Flask

from routes import audio_routes, projects_routes
from services.AudioService import AudioService
from services.FileService import FileService


def _create_discard_audio_client(interrupted_processing_context, tmp_path, monkeypatch, sse_manager):
    project_service = interrupted_processing_context["project_service"]
    file_service = FileService(project_service, str(tmp_path / "uploads"))
    audio_service = AudioService(project_service, file_service)

    monkeypatch.setattr(audio_routes, "project_service", project_service)
    monkeypatch.setattr(audio_routes, "file_service", file_service)
    monkeypatch.setattr(audio_routes, "audio_service", audio_service)
    monkeypatch.setattr(audio_routes, "sse_manager", sse_manager)

    app = Flask(__name__)
    app.register_blueprint(audio_routes.audio_bp, url_prefix="/api")
    return app.test_client()


def _create_discard_projects_client(interrupted_processing_context, tmp_path, monkeypatch, sse_manager):
    project_service = interrupted_processing_context["project_service"]
    file_service = FileService(project_service, str(tmp_path / "uploads"))

    monkeypatch.setattr(projects_routes, "project_service", project_service)
    monkeypatch.setattr(projects_routes, "file_service", file_service)
    monkeypatch.setattr(projects_routes, "sse_manager", sse_manager)

    app = Flask(__name__)
    app.register_blueprint(projects_routes.projects_bp, url_prefix="/api")
    return app.test_client()


def test_discard_removes_processing_rows_project_rows_and_project_folder(interrupted_processing_context):
    project_service = interrupted_processing_context["project_service"]
    repository = interrupted_processing_context["processing_job_repository"]
    project_repository = interrupted_processing_context["project_repository"]
    job_id = interrupted_processing_context["job"]["id"]
    project_id = interrupted_processing_context["project"]["id"]
    project_path = interrupted_processing_context["project_path"]

    result = project_service.discard_recoverable_job(job_id)

    assert result is True
    assert repository.get_job_snapshot(job_id) is None
    assert project_repository.get_project(project_id) is None
    assert not project_path.exists()


def test_discard_route_removes_recovery_state_and_publishes_invalidation(
    interrupted_processing_context,
    tmp_path,
    monkeypatch,
):
    published = []

    class StubSSEManager:
        def publish(self, project_id, event, data):
            published.append((project_id, event, data))

    client = _create_discard_audio_client(
        interrupted_processing_context,
        tmp_path,
        monkeypatch,
        StubSSEManager(),
    )
    job_id = interrupted_processing_context["job"]["id"]
    project_id = interrupted_processing_context["project"]["id"]

    response = client.post(f"/api/processing/{job_id}/discard")

    assert response.status_code == 200
    assert response.get_json() == {"discarded": True}
    assert interrupted_processing_context["processing_job_repository"].get_job_snapshot(job_id) is None
    assert interrupted_processing_context["project_service"].get_active_processing_job_snapshot() is None
    assert published == [
        (
            project_id,
            "processing_updated",
            {
                "job_id": job_id,
                "project_id": project_id,
                "state": "discarded",
            },
        )
    ]


def test_project_delete_route_uses_sqlite_aware_deletion(
    interrupted_processing_context,
    tmp_path,
    monkeypatch,
):
    class StubSSEManager:
        def publish(self, project_id, event, data):
            return None

    client = _create_discard_projects_client(
        interrupted_processing_context,
        tmp_path,
        monkeypatch,
        StubSSEManager(),
    )
    project_id = interrupted_processing_context["project"]["id"]
    job_id = interrupted_processing_context["job"]["id"]

    response = client.delete(f"/api/delete/{project_id}")

    assert response.status_code == 200
    assert interrupted_processing_context["project_repository"].get_project(project_id) is None
    assert interrupted_processing_context["processing_job_repository"].get_job_snapshot(job_id) is None
