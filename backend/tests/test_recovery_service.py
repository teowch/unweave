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
