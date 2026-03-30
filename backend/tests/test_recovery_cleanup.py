def test_cleanup_only_targets_interrupted_batch_artifacts(interrupted_processing_context):
    project_service = interrupted_processing_context["project_service"]
    project_path = interrupted_processing_context["project_path"]
    job_id = interrupted_processing_context["job"]["id"]

    project_service.cleanup_interrupted_batch_artifacts(job_id)

    assert (project_path / "stems" / "vocals.htdemucs_6s.flac").exists()
    assert (project_path / "stems" / "drums.htdemucs_6s.flac").exists()
    assert not (project_path / "stems" / "vocals.male_female.flac").exists()


def test_cleanup_removes_waveforms_for_interrupted_batch_only(interrupted_processing_context):
    project_service = interrupted_processing_context["project_service"]
    project_path = interrupted_processing_context["project_path"]
    job_id = interrupted_processing_context["job"]["id"]

    project_service.cleanup_interrupted_batch_artifacts(job_id)

    assert not (project_path / "waveforms" / "vocals.male_female.json").exists()
