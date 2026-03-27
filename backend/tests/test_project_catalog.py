from persistence.project_catalog import build_history_entry
from persistence.project_repository import ProjectRepository
from persistence import Database


def test_build_history_entry_uses_audio_files_for_original_and_stems(library_root):
    repository = ProjectRepository(Database(str(library_root)))
    repository.replace_project_snapshot(
        {
            "id": "project-100",
            "name": "Song Demo",
            "date": "2026-03-27T15:00:00Z",
            "thumbnail": "thumbs/demo.png",
        },
        [
            {"project_id": "project-100", "relative_path": "song.wav", "role": "audio"},
            {"project_id": "project-100", "relative_path": "vocals_htdemucs_6s.vocal.flac", "role": "audio"},
            {"project_id": "project-100", "relative_path": "drums_htdemucs_6s.drums.flac", "role": "audio"},
            {"project_id": "project-100", "relative_path": "waveforms/song.json", "role": "waveform"},
        ],
    )

    snapshot = repository.get_project_snapshot("project-100")
    history_entry = build_history_entry(snapshot["project"], snapshot["files"])

    assert history_entry == {
        "id": "project-100",
        "name": "Song Demo",
        "date": "2026-03-27T15:00:00Z",
        "stems": [
            "drums_htdemucs_6s.drums.flac",
            "vocals_htdemucs_6s.vocal.flac",
        ],
        "original": "song.wav",
        "thumbnail": "thumbs/demo.png",
    }


def test_build_history_entry_omits_missing_optional_fields(library_root):
    repository = ProjectRepository(Database(str(library_root)))
    repository.replace_project_snapshot(
        {
            "id": "project-200",
            "name": "Imported Legacy",
            "date": "project-200",
            "thumbnail": None,
        },
        [
            {"project_id": "project-200", "relative_path": "base_vocals.vocal.flac", "role": "audio"},
            {"project_id": "project-200", "relative_path": "combined.unified.wav", "role": "audio"},
            {"project_id": "project-200", "relative_path": "notes/info.txt", "role": "other"},
        ],
    )

    snapshot = repository.get_project_snapshot("project-200")
    history_entry = build_history_entry(snapshot["project"], snapshot["files"])

    assert history_entry["id"] == "project-200"
    assert history_entry["name"] == "Imported Legacy"
    assert history_entry["date"] == "project-200"
    assert history_entry["stems"] == ["base_vocals.vocal.flac"]
    assert history_entry["original"] == "combined.unified.wav"
    assert "thumbnail" not in history_entry


def test_build_history_entry_does_not_need_folder_scans():
    project_row = {
        "id": "project-300",
        "name": "Snapshot Only",
        "date": "2026-03-27",
        "thumbnail": None,
    }
    file_rows = [
        {"project_id": "project-300", "relative_path": "song.mp3", "role": "audio"},
        {"project_id": "project-300", "relative_path": "lead_vocals.vocal.flac", "role": "audio"},
        {"project_id": "project-300", "relative_path": "waveforms/song.json", "role": "waveform"},
    ]

    history_entry = build_history_entry(project_row, file_rows)

    assert history_entry["original"] == "song.mp3"
    assert history_entry["stems"] == ["lead_vocals.vocal.flac"]
