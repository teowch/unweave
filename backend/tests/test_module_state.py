from persistence.module_state import derive_project_state


def test_derive_project_state_maps_output_filenames_to_executed_modules():
    state = derive_project_state(
        [
            {"relative_path": "song.wav", "role": "audio"},
            {"relative_path": "base_vocals.vocal.flac", "role": "audio"},
            {"relative_path": "vocals_htdemucs_6s.vocal.flac", "role": "audio"},
            {"relative_path": "drums_htdemucs_6s.drums.flac", "role": "audio"},
            {"relative_path": "lead_vocals.vocal.flac", "role": "audio"},
            {"relative_path": "waveforms/song.json", "role": "waveform"},
        ]
    )

    assert state["original_file"] == "song.wav"
    assert state["stems"] == [
        "base_vocals.vocal.flac",
        "drums_htdemucs_6s.drums.flac",
        "lead_vocals.vocal.flac",
        "vocals_htdemucs_6s.vocal.flac",
    ]
    assert state["executed_modules"] == [
        "htdemucs_6s",
        "lead_backing",
        "vocal_instrumental",
    ]


def test_derive_project_state_ignores_unmatched_audio_for_module_completion():
    state = derive_project_state(
        [
            {"relative_path": "combined.unified.wav", "role": "audio"},
            {"relative_path": "notes.txt", "role": "other"},
        ]
    )

    assert state["original_file"] == "combined.unified.wav"
    assert state["stems"] == []
    assert state["executed_modules"] == []


def test_derive_project_state_can_use_role_hint_for_original_file():
    state = derive_project_state(
        [
            {"relative_path": "nested/source-track.mp3", "role": "original"},
            {"relative_path": "male_vocals.vocal.flac", "role": "audio"},
            {"relative_path": "female_vocals.vocal.flac", "role": "audio"},
        ]
    )

    assert state["original_file"] == "nested/source-track.mp3"
    assert state["stems"] == [
        "female_vocals.vocal.flac",
        "male_vocals.vocal.flac",
    ]
    assert state["executed_modules"] == ["male_female"]
