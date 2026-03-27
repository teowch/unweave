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
