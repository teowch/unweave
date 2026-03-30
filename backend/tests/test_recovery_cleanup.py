from pathlib import Path


def test_cleanup_removes_only_interrupted_batch_artifacts_and_waveforms(local_recovery_context):
    project_service = local_recovery_context["project_service"]
    job_id = local_recovery_context["job"]["id"]
    project_path = Path(local_recovery_context["project_path"])

    completed_output = project_path / "stems" / "vocals.htdemucs_6s.flac"
    interrupted_output = project_path / "stems" / "vocals.male_female.flac"
    interrupted_waveform = project_path / "waveforms" / "vocals.male_female.json"
    later_pending_output = project_path / "stems" / "future.pending.flac"
    later_pending_output.write_text("pending", encoding="utf-8")

    removed = project_service.cleanup_interrupted_batch_artifacts(job_id)

    assert removed is True
    assert completed_output.exists()
    assert not interrupted_output.exists()
    assert not interrupted_waveform.exists()
    assert later_pending_output.exists()


def test_cleanup_ignores_missing_interrupted_artifacts_without_touching_completed_outputs(local_recovery_context):
    project_service = local_recovery_context["project_service"]
    job_id = local_recovery_context["job"]["id"]
    project_path = Path(local_recovery_context["project_path"])

    interrupted_output = project_path / "stems" / "vocals.male_female.flac"
    interrupted_waveform = project_path / "waveforms" / "vocals.male_female.json"
    completed_output = project_path / "stems" / "drums.htdemucs_6s.flac"
    interrupted_output.unlink()
    interrupted_waveform.unlink()

    removed = project_service.cleanup_interrupted_batch_artifacts(job_id)

    assert removed is False
    assert completed_output.exists()
