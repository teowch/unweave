from flask import Flask

from persistence import Database
from routes import audio_routes
from services.FileService import FileService
from services.ProjectService import ProjectService
from services.SSEManager import SSEManager

try:
    from persistence.processing_job_repository import ProcessingJobRepository
except ImportError:
    ProcessingJobRepository = None


JOB_STATES = {
    "running",
    "completed",
    "failed",
    "interrupted",
    "awaiting_recovery",
    "recovering",
    "discarded",
}

BATCH_STATES = {
    "pending",
    "running",
    "completed",
    "failed",
    "interrupted",
    "cleaning",
    "rerunning",
}


def _create_repository(library_root):
    assert ProcessingJobRepository is not None, "ProcessingJobRepository is not implemented"
    return ProcessingJobRepository(Database(str(library_root)))


def _create_audio_route_client(library_root, tmp_path, monkeypatch, repository):
    project_service = ProjectService(
        str(library_root),
        project_repository=None,
        processing_job_repository=repository,
    )
    file_service = FileService(project_service, str(tmp_path / "uploads"))
    sse_manager = SSEManager()

    monkeypatch.setattr(audio_routes, "project_service", project_service)
    monkeypatch.setattr(audio_routes, "file_service", file_service)
    monkeypatch.setattr(audio_routes, "sse_manager", sse_manager)

    app = Flask(__name__)
    app.register_blueprint(audio_routes.audio_bp, url_prefix="/api")

    return app.test_client()


def test_active_job_guard_rejects_second_running_job(
    library_root,
    sample_processing_job_row,
):
    repository = _create_repository(library_root)
    repository.create_job(sample_processing_job_row)

    with_state_conflict = {
        **sample_processing_job_row,
        "id": "job-002",
        "project_id": "project-002",
    }

    try:
        repository.create_job(with_state_conflict)
    except Exception as exc:
        assert "active" in str(exc).lower() or "unique" in str(exc).lower()
    else:
        raise AssertionError("Expected a second active processing job to be rejected")


def test_lifecycle_persists_job_and_batch_state_transitions(
    library_root,
    sample_processing_job_row,
    sample_processing_batch_rows,
):
    assert JOB_STATES == {
        "running",
        "completed",
        "failed",
        "interrupted",
        "awaiting_recovery",
        "recovering",
        "discarded",
    }
    assert BATCH_STATES == {
        "pending",
        "running",
        "completed",
        "failed",
        "interrupted",
        "cleaning",
        "rerunning",
    }

    repository = _create_repository(library_root)

    repository.create_job(sample_processing_job_row)
    repository.replace_batches(sample_processing_job_row["id"], sample_processing_batch_rows)
    repository.update_batch_state(
        sample_processing_job_row["id"],
        batch_order=2,
        state="running",
        started_at="2026-03-27T12:03:00Z",
    )
    repository.update_batch_state(
        sample_processing_job_row["id"],
        batch_order=2,
        state="completed",
        finished_at="2026-03-27T12:04:00Z",
        cleanup_required=False,
    )
    repository.update_job_state(
        sample_processing_job_row["id"],
        "completed",
        finished_at="2026-03-27T12:05:00Z",
    )

    snapshot = repository.get_job_snapshot(sample_processing_job_row["id"])

    assert snapshot["job"]["state"] == "completed"
    assert snapshot["job"]["finished_at"] == "2026-03-27T12:05:00Z"
    assert [batch["batch_order"] for batch in snapshot["batches"]] == [1, 2]
    assert snapshot["batches"][1]["state"] == "completed"
    assert snapshot["batches"][1]["started_at"] == "2026-03-27T12:03:00Z"
    assert snapshot["batches"][1]["finished_at"] == "2026-03-27T12:04:00Z"
    assert snapshot["batches"][1]["cleanup_required"] == 0


def test_active_job_snapshot_returns_canonical_ordered_batches(
    library_root,
    sample_project_row,
    sample_processing_job_row,
    sample_processing_batch_rows,
):
    repository = _create_repository(library_root)
    repository.create_job(sample_processing_job_row)
    repository.replace_batches(sample_processing_job_row["id"], sample_processing_batch_rows)

    project_service = ProjectService(
        str(library_root),
        project_repository=None,
        processing_job_repository=repository,
    )

    active_snapshot = project_service.get_active_processing_job_snapshot()

    assert active_snapshot["job"]["project_id"] == sample_project_row["id"]
    assert active_snapshot["job"]["state"] == "running"
    assert [batch["module_id"] for batch in active_snapshot["batches"]] == [
        "htdemucs_6s",
        "male_female",
    ]
    assert active_snapshot["batches"][0]["output_paths"] == [
        "stems/vocals.htdemucs_6s.flac",
        "stems/drums.htdemucs_6s.flac",
    ]
    assert active_snapshot["batches"][1]["requested_directly"] == 0


def test_active_job_snapshot_route_returns_canonical_payload(
    library_root,
    tmp_path,
    monkeypatch,
    sample_processing_job_row,
    sample_processing_batch_rows,
):
    repository = _create_repository(library_root)
    repository.create_job(sample_processing_job_row)
    repository.replace_batches(sample_processing_job_row["id"], sample_processing_batch_rows)
    client = _create_audio_route_client(library_root, tmp_path, monkeypatch, repository)

    response = client.get("/api/active")

    payload = response.get_json()

    assert response.status_code == 200
    assert payload["active_job"]["job"]["id"] == sample_processing_job_row["id"]
    assert [batch["batch_order"] for batch in payload["active_job"]["batches"]] == [1, 2]
    assert payload["active_job"]["batches"][0]["module_id"] == "htdemucs_6s"
    assert payload["active_job"]["batches"][1]["module_id"] == "male_female"


def test_active_job_guard_rejects_processing_route_when_job_exists(
    library_root,
    tmp_path,
    monkeypatch,
    sample_processing_job_row,
):
    repository = _create_repository(library_root)
    repository.create_job(sample_processing_job_row)
    client = _create_audio_route_client(library_root, tmp_path, monkeypatch, repository)

    response = client.post(
        "/api/process-url",
        json={
            "url": "https://example.com/audio",
            "modules": ["htdemucs_6s"],
            "temp_project_id": "temp-123",
        },
    )

    payload = response.get_json()

    assert response.status_code == 409
    assert payload["error"] == "job already active"
    assert payload["code"] == "job_already_active"
    assert payload["job_id"] == sample_processing_job_row["id"]
    assert payload["project_id"] == sample_processing_job_row["project_id"]
