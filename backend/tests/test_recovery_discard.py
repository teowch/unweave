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
