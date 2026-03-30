from flask import Flask

from persistence import Database
from routes import audio_routes
from services.FileService import FileService
from services.ProjectService import ProjectService
from services.SSEMessageHandler import SSEMessageHandler
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
    assert snapshot["job"]["completion_acknowledged_at"] is None
    assert [step["order"] for step in snapshot["steps"]] == [1, 2]
    assert snapshot["steps"][0]["id"] == "htdemucs_6s"
    assert snapshot["steps"][0]["kind"] == "module"
    assert snapshot["steps"][0]["progress"] == 100
    assert snapshot["steps"][1]["state"] == "completed"
    assert snapshot["steps"][1]["progress"] == 100
    assert snapshot["overall_progress"] == 100


def test_active_job_snapshot_returns_canonical_ordered_steps(
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
    assert active_snapshot["project"] == {
        "id": sample_project_row["id"],
        "name": sample_project_row["name"],
        "thumbnail": sample_project_row["thumbnail"],
    }
    assert [step["id"] for step in active_snapshot["steps"]] == [
        "htdemucs_6s",
        "male_female",
    ]
    assert active_snapshot["steps"][0] == {
        "id": "htdemucs_6s",
        "kind": "module",
        "label": "htdemucs_6s.yaml",
        "state": "completed",
        "progress": 100,
        "order": 1,
    }
    assert active_snapshot["steps"][1]["label"] == "UVR-MDX-NET Main"
    assert active_snapshot["steps"][1]["progress"] == 0
    assert active_snapshot["overall_progress"] == 50


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
    assert payload["active_job"]["job"]["completion_acknowledged_at"] is None
    assert [step["order"] for step in payload["active_job"]["steps"]] == [1, 2]
    assert payload["active_job"]["steps"][0]["kind"] == "module"
    assert payload["active_job"]["steps"][0]["progress"] == 100
    assert payload["active_job"]["steps"][1]["label"] == "UVR-MDX-NET Main"
    assert payload["active_job"]["overall_progress"] == 50


def test_active_job_snapshot_route_includes_download_step_for_url_jobs(
    library_root,
    tmp_path,
    monkeypatch,
    sample_processing_job_row,
    sample_processing_batch_rows,
):
    repository = _create_repository(library_root)
    repository.create_job({
        **sample_processing_job_row,
        "source_type": "url",
        "source_name": "https://example.com/audio",
    })
    repository.replace_batches(sample_processing_job_row["id"], sample_processing_batch_rows)
    client = _create_audio_route_client(library_root, tmp_path, monkeypatch, repository)

    response = client.get("/api/active")

    payload = response.get_json()

    assert response.status_code == 200
    assert payload["active_job"]["steps"][0] == {
        "id": "download",
        "kind": "download",
        "label": "Download",
        "state": "pending",
        "progress": 0,
        "order": 1,
    }
    assert payload["active_job"]["steps"][1]["id"] == "htdemucs_6s"
    assert payload["active_job"]["steps"][2]["id"] == "male_female"
    assert payload["active_job"]["overall_progress"] == 33


def test_completed_job_remains_visible_until_completion_acknowledged(
    library_root,
    tmp_path,
    monkeypatch,
    sample_processing_job_row,
    sample_processing_batch_rows,
):
    repository = _create_repository(library_root)
    repository.create_job({
        **sample_processing_job_row,
        "state": "completed",
        "finished_at": "2026-03-27T12:05:00Z",
    })
    repository.replace_batches(sample_processing_job_row["id"], sample_processing_batch_rows)
    client = _create_audio_route_client(library_root, tmp_path, monkeypatch, repository)

    before_ack_response = client.get("/api/active")
    ack_response = client.post(f"/api/processing/{sample_processing_job_row['id']}/acknowledge")
    after_ack_response = client.get("/api/active")

    assert before_ack_response.status_code == 200
    assert before_ack_response.get_json()["active_job"]["job"]["state"] == "completed"
    assert (
        before_ack_response.get_json()["active_job"]["job"]["completion_acknowledged_at"]
        is None
    )
    assert ack_response.status_code == 200
    assert ack_response.get_json()["job"]["completion_acknowledged_at"] is not None
    assert after_ack_response.status_code == 200
    assert after_ack_response.get_json()["active_job"] is None


def test_processing_lifecycle_sse_uses_invalidation_event_name_only():
    published = []

    class StubSSEManager:
        def publish(self, project_id, event, data):
            published.append((project_id, event, data))

        def close(self, project_id):
            return None

        def create(self, project_id):
            return None

    handler = SSEMessageHandler("temp-123", StubSSEManager())

    handler.set_project_id("project-001")
    handler.publish_processing_updated("job-001", "project-001", "running")

    assert published[0] == ("temp-123", "id_changed", {"new_id": "project-001"})
    assert published[1] == (
        "project-001",
        "processing_updated",
        {
            "job_id": "job-001",
            "project_id": "project-001",
            "state": "running",
        },
    )
    assert all(event not in {"download", "module_processing", "model_downloading"} for _, event, _ in published[1:])


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
