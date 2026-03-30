def test_recoverable_job_snapshot_promotes_stale_running_job(interrupted_processing_context):
    repository = interrupted_processing_context["processing_job_repository"]
    job_id = interrupted_processing_context["job"]["id"]

    repository.update_job_state(job_id, "running")

    recoverable = repository.get_recoverable_job_snapshot()

    assert recoverable["job"]["id"] == job_id
    assert recoverable["job"]["state"] == "awaiting_recovery"
    assert recoverable["project"]["name"] == interrupted_processing_context["project"]["name"]


def test_resume_selection_starts_from_first_non_completed_batch(interrupted_processing_context):
    repository = interrupted_processing_context["processing_job_repository"]
    job_id = interrupted_processing_context["job"]["id"]

    resumable_batch = repository.get_first_non_completed_batch(job_id)

    assert resumable_batch["batch_order"] == 2
    assert resumable_batch["state"] == "interrupted"
    assert resumable_batch["module_id"] == interrupted_processing_context["batches"][1]["module_id"]


def test_resume_plan_preserves_completed_prefix_batches(interrupted_processing_context):
    project_service = interrupted_processing_context["project_service"]
    job_id = interrupted_processing_context["job"]["id"]

    resume_plan = project_service.get_recovery_resume_plan(job_id)

    assert [batch["batch_order"] for batch in resume_plan["preserved_batches"]] == [1]
    assert [batch["state"] for batch in resume_plan["preserved_batches"]] == ["completed"]
    assert resume_plan["resume_from"]["batch_order"] == 2
    assert [batch["batch_order"] for batch in resume_plan["remaining_batches"]] == [2, 3]


def test_resume_plan_reports_full_rerun_when_batch_resume_is_unsafe(interrupted_processing_context):
    repository = interrupted_processing_context["processing_job_repository"]
    project_service = interrupted_processing_context["project_service"]
    job_id = interrupted_processing_context["job"]["id"]

    repository.update_batch_state(
        job_id,
        batch_order=2,
        state="pending",
        output_paths=[],
        cleanup_required=False,
        error_message=None,
    )

    resume_plan = project_service.get_recovery_resume_plan(job_id)

    assert resume_plan["resume_from"] is None
    assert resume_plan["fallback"]["type"] == "full_rerun"
    assert resume_plan["fallback"]["source_type"] == "local_file"
    assert resume_plan["fallback"]["source_name"] == "original/song.wav"


def test_recovery_decision_contract_reports_safe_resume(interrupted_processing_context):
    project_service = interrupted_processing_context["project_service"]
    job_id = interrupted_processing_context["job"]["id"]

    decision = project_service.get_recovery_decision(job_id)

    assert decision == {
        "jobId": job_id,
        "projectId": interrupted_processing_context["project"]["id"],
        "projectName": interrupted_processing_context["project"]["name"],
        "state": "awaiting_recovery",
        "canSafeResume": True,
        "canRerunFromSource": True,
        "recoveryMode": "safe_resume",
        "recoveryMessage": None,
    }


def test_recovery_decision_contract_reports_local_rerun_fallback(interrupted_processing_context):
    repository = interrupted_processing_context["processing_job_repository"]
    project_service = interrupted_processing_context["project_service"]
    job_id = interrupted_processing_context["job"]["id"]

    repository.update_batch_state(
        job_id,
        batch_order=2,
        state="pending",
        output_paths=[],
        cleanup_required=False,
        error_message=None,
    )

    decision = project_service.get_recovery_decision(job_id)

    assert decision["canSafeResume"] is False
    assert decision["canRerunFromSource"] is True
    assert decision["recoveryMode"] == "rerun_from_source"
    assert "original" in decision["recoveryMessage"].lower()


def test_recovery_decision_contract_reports_url_rerun_fallback(interrupted_processing_context):
    repository = interrupted_processing_context["processing_job_repository"]
    project_service = interrupted_processing_context["project_service"]
    job_id = interrupted_processing_context["job"]["id"]

    repository.update_job_state(job_id, "awaiting_recovery")
    with repository.database.transaction() as connection:
        connection.execute(
            """
            UPDATE processing_jobs
            SET source_type = ?, source_name = ?
            WHERE id = ?
            """,
            ("url", "https://example.com/audio", job_id),
        )
    repository.update_batch_state(
        job_id,
        batch_order=2,
        state="pending",
        output_paths=[],
        cleanup_required=False,
        error_message=None,
    )

    decision = project_service.get_recovery_decision(job_id)

    assert decision["canSafeResume"] is False
    assert decision["canRerunFromSource"] is True
    assert decision["recoveryMode"] == "rerun_from_source"
    assert "url" in decision["recoveryMessage"].lower()


def test_safe_recovery_cleans_interrupted_batch_and_preserves_completed_prefix(interrupted_processing_context):
    project_service = interrupted_processing_context["project_service"]
    audio_service = AudioService(project_service, FileService(project_service, "unused"))
    job_id = interrupted_processing_context["job"]["id"]
    project_path = interrupted_processing_context["project_path"]

    snapshot = audio_service.recover_processing_job(job_id, "safe_resume")

    assert snapshot["job"]["state"] == "recovering"
    assert snapshot["batches"][0]["state"] == "completed"
    assert snapshot["batches"][1]["state"] == "rerunning"
    assert snapshot["batches"][1]["cleanup_required"] == 0
    assert snapshot["batches"][1]["output_paths"] == []
    assert snapshot["batches"][2]["state"] == "pending"
    assert not (project_path / "stems" / "vocals.male_female.flac").exists()
    assert not (project_path / "waveforms" / "vocals.male_female.json").exists()


def test_rerun_from_source_uses_persisted_original_file_for_local_uploads(interrupted_processing_context):
    project_service = interrupted_processing_context["project_service"]
    audio_service = AudioService(project_service, FileService(project_service, "unused"))
    job_id = interrupted_processing_context["job"]["id"]

    snapshot = audio_service.recover_processing_job(job_id, "rerun_from_source")

    assert snapshot["job"]["state"] == "recovering"
    assert snapshot["job"]["source_type"] == "local_file"
    assert snapshot["job"]["source_name"] == "original/song.wav"
    assert [batch["state"] for batch in snapshot["batches"]] == ["pending", "pending", "pending"]


def test_rerun_from_source_uses_persisted_url_for_url_jobs(interrupted_processing_context):
    repository = interrupted_processing_context["processing_job_repository"]
    project_service = interrupted_processing_context["project_service"]
    audio_service = AudioService(project_service, FileService(project_service, "unused"))
    job_id = interrupted_processing_context["job"]["id"]

    with repository.database.transaction() as connection:
        connection.execute(
            """
            UPDATE processing_jobs
            SET source_type = ?, source_name = ?
            WHERE id = ?
            """,
            ("url", "https://example.com/audio", job_id),
        )

    snapshot = audio_service.recover_processing_job(job_id, "rerun_from_source")

    assert snapshot["job"]["state"] == "recovering"
    assert snapshot["job"]["source_type"] == "url"
    assert snapshot["job"]["source_name"] == "https://example.com/audio"
    assert [batch["state"] for batch in snapshot["batches"]] == ["pending", "pending", "pending"]


def test_active_route_surfaces_recovery_decision_contract(interrupted_processing_context, tmp_path, monkeypatch):
    client = _create_recovery_route_client(interrupted_processing_context, tmp_path, monkeypatch)

    response = client.get("/api/active")

    payload = response.get_json()

    assert response.status_code == 200
    assert payload["active_job"]["job"]["state"] == "awaiting_recovery"
    assert payload["active_job"]["recovery"]["canSafeResume"] is True
    assert payload["active_job"]["recovery"]["canRerunFromSource"] is True
    assert payload["active_job"]["recovery"]["recoveryMode"] == "safe_resume"
    assert payload["active_job"]["recovery"]["recoveryMessage"] is None


def test_recover_route_requires_supported_recovery_mode(interrupted_processing_context, tmp_path, monkeypatch):
    client = _create_recovery_route_client(interrupted_processing_context, tmp_path, monkeypatch)
    job_id = interrupted_processing_context["job"]["id"]

    missing = client.post(f"/api/processing/{job_id}/recover", json={})
    invalid = client.post(f"/api/processing/{job_id}/recover", json={"recoveryMode": "guess"})

    assert missing.status_code == 400
    assert invalid.status_code == 400


def test_recover_route_returns_updated_snapshot_and_recovery_contract(
    interrupted_processing_context,
    tmp_path,
    monkeypatch,
):
    published = []

    class StubSSEManager:
        def publish(self, project_id, event, data):
            published.append((project_id, event, data))

    client = _create_recovery_route_client(
        interrupted_processing_context,
        tmp_path,
        monkeypatch,
        sse_manager=StubSSEManager(),
    )
    job_id = interrupted_processing_context["job"]["id"]
    project_id = interrupted_processing_context["project"]["id"]

    response = client.post(
        f"/api/processing/{job_id}/recover",
        json={"recoveryMode": "safe_resume"},
    )

    payload = response.get_json()

    assert response.status_code == 200
    assert payload["job"]["state"] == "recovering"
    assert payload["recovery"]["jobId"] == job_id
    assert payload["recovery"]["projectId"] == project_id
    assert payload["recovery"]["state"] == "recovering"
    assert payload["recovery"]["recoveryMode"] == "safe_resume"
    assert published == [
        (
            project_id,
            "processing_updated",
            {
                "job_id": job_id,
                "project_id": project_id,
                "state": "recovering",
            },
        )
    ]
from flask import Flask

from routes import audio_routes
from services.AudioService import AudioService
from services.FileService import FileService
from services.SSEManager import SSEManager


def _create_recovery_route_client(interrupted_processing_context, tmp_path, monkeypatch, sse_manager=None):
    project_service = interrupted_processing_context["project_service"]
    file_service = FileService(project_service, str(tmp_path / "uploads"))
    audio_service = AudioService(project_service, file_service)
    sse_manager = sse_manager or SSEManager()

    monkeypatch.setattr(audio_routes, "audio_service", audio_service)
    monkeypatch.setattr(audio_routes, "project_service", project_service)
    monkeypatch.setattr(audio_routes, "file_service", file_service)
    monkeypatch.setattr(audio_routes, "sse_manager", sse_manager)

    app = Flask(__name__)
    app.register_blueprint(audio_routes.audio_bp, url_prefix="/api")
    return app.test_client()
