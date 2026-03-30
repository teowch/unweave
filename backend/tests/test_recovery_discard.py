def test_discard_removes_processing_rows_project_rows_and_project_folder(local_recovery_context):
    project_service = local_recovery_context["project_service"]
    processing_job_repository = local_recovery_context["processing_job_repository"]
    project_repository = local_recovery_context["project_repository"]
    job_id = local_recovery_context["job"]["id"]
    project_id = local_recovery_context["project"]["id"]

    discarded = project_service.discard_recoverable_job(job_id)

    assert discarded is True
    assert processing_job_repository.get_job_snapshot(job_id) is None
    assert processing_job_repository.list_jobs_for_project(project_id) == []
    assert project_repository.get_project(project_id) is None
    assert project_repository.list_project_files(project_id) == []
    assert project_service.get_project_path(project_id) is None


def test_discard_deletes_project_by_project_id_for_recovery_decline(local_recovery_context):
    project_service = local_recovery_context["project_service"]
    project_id = local_recovery_context["project"]["id"]

    discarded = project_service.discard_project(project_id)

    assert discarded is True
    assert project_service.get_sqlite_project(project_id) is None
    assert project_service.get_project_path(project_id) is None
