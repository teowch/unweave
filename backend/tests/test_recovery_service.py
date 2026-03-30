def test_stale_running_job_is_promoted_to_recoverable_snapshot(stale_running_recovery_context):
    project_service = stale_running_recovery_context["project_service"]
    job_id = stale_running_recovery_context["job"]["id"]

    active_snapshot = project_service.get_active_processing_job_snapshot()
    persisted_snapshot = project_service.get_processing_job_snapshot(job_id)

    assert active_snapshot["job"]["id"] == job_id
    assert active_snapshot["job"]["state"] == "awaiting_recovery"
    assert persisted_snapshot["job"]["state"] == "awaiting_recovery"
    assert active_snapshot["recovery"]["state"] == "awaiting_recovery"
    assert active_snapshot["recovery"]["projectName"] == stale_running_recovery_context["project"]["name"]


def test_safe_resume_starts_at_first_non_completed_batch_and_preserves_completed_prefix(local_recovery_context):
    project_service = local_recovery_context["project_service"]
    job_id = local_recovery_context["job"]["id"]

    resume_plan = project_service.get_recovery_resume_plan(job_id)

    assert resume_plan["resume_from"]["batch_order"] == 2
    assert resume_plan["resume_from"]["state"] == "interrupted"
    assert [batch["batch_order"] for batch in resume_plan["preserved_batches"]] == [1]
    assert all(batch["state"] == "completed" for batch in resume_plan["preserved_batches"])
    assert [batch["batch_order"] for batch in resume_plan["remaining_batches"]] == [2, 3]
    assert resume_plan["remaining_batches"][1]["state"] == "pending"
    assert resume_plan["fallback"] is None


def test_unsafe_resume_returns_full_rerun_fallback_for_local_source(unsafe_recovery_context):
    project_service = unsafe_recovery_context["project_service"]
    job_id = unsafe_recovery_context["job"]["id"]

    resume_plan = project_service.get_recovery_resume_plan(job_id)
    recovery_decision = project_service.get_recovery_decision(job_id)

    assert resume_plan["resume_from"] is None
    assert resume_plan["remaining_batches"] == []
    assert resume_plan["fallback"] == {
        "type": "full_rerun",
        "source_type": "local_file",
        "source_name": "original/song.wav",
    }
    assert recovery_decision["canSafeResume"] is False
    assert recovery_decision["canRerunFromSource"] is True
    assert recovery_decision["recoveryMode"] == "rerun_from_source"
    assert "original uploaded file" in recovery_decision["recoveryMessage"]
