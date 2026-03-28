from pathlib import Path
import sys

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture
def library_root(tmp_path):
    return tmp_path / "Library"


@pytest.fixture
def database_path(library_root):
    return library_root / ".unweave" / "metadata.db"


@pytest.fixture
def sample_project_row():
    return {
        "id": "project-001",
        "name": "Song Demo",
        "date": "2026-03-27T12:00:00Z",
        "thumbnail": "thumbnails/project-001.png",
    }


@pytest.fixture
def sample_file_rows(sample_project_row):
    return [
        {
            "project_id": sample_project_row["id"],
            "relative_path": "original/song.wav",
            "role": "original",
        },
        {
            "project_id": sample_project_row["id"],
            "relative_path": "stems/vocals.htdemucs_6s.flac",
            "role": "stem",
        },
    ]


@pytest.fixture
def sample_processing_job_row(sample_project_row):
    return {
        "id": "job-001",
        "project_id": sample_project_row["id"],
        "state": "running",
        "source_type": "local_file",
        "source_name": "song.wav",
        "requested_by": "user",
    }


@pytest.fixture
def sample_processing_batch_rows(sample_processing_job_row):
    return [
        {
            "job_id": sample_processing_job_row["id"],
            "module_id": "htdemucs_6s",
            "state": "completed",
            "batch_order": 1,
            "input_relative_path": "original/song.wav",
            "output_paths": ["stems/vocals.htdemucs_6s.flac", "stems/drums.htdemucs_6s.flac"],
            "started_at": "2026-03-27T12:01:00Z",
            "finished_at": "2026-03-27T12:02:00Z",
            "error_message": None,
            "cleanup_required": False,
            "requested_directly": True,
        },
        {
            "job_id": sample_processing_job_row["id"],
            "module_id": "male_female",
            "state": "pending",
            "batch_order": 2,
            "input_relative_path": "stems/vocals.htdemucs_6s.flac",
            "output_paths": [],
            "started_at": None,
            "finished_at": None,
            "error_message": None,
            "cleanup_required": True,
            "requested_directly": False,
        },
    ]
