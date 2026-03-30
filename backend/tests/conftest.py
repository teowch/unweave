from pathlib import Path
import sys

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


from persistence import Database
from persistence.processing_job_repository import ProcessingJobRepository
from persistence.project_repository import ProjectRepository
from services.ProjectService import ProjectService


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


@pytest.fixture
def interrupted_project_row():
    return {
        "id": "project-recovery-001",
        "name": "Interrupted Demo",
        "date": "2026-03-30T00:00:00Z",
        "thumbnail": "thumbs/project-recovery-001.png",
    }


@pytest.fixture
def interrupted_processing_job_row(interrupted_project_row):
    return {
        "id": "job-recovery-001",
        "project_id": interrupted_project_row["id"],
        "state": "interrupted",
        "source_type": "local_file",
        "source_name": "original/song.wav",
        "requested_by": "user",
        "started_at": "2026-03-30T00:01:00Z",
    }


@pytest.fixture
def interrupted_processing_batch_rows(interrupted_processing_job_row):
    return [
        {
            "job_id": interrupted_processing_job_row["id"],
            "module_id": "htdemucs_6s",
            "state": "completed",
            "batch_order": 1,
            "input_relative_path": "original/song.wav",
            "output_paths": [
                "stems/vocals.htdemucs_6s.flac",
                "stems/drums.htdemucs_6s.flac",
            ],
            "started_at": "2026-03-30T00:02:00Z",
            "finished_at": "2026-03-30T00:03:00Z",
            "cleanup_required": False,
            "requested_directly": True,
        },
        {
            "job_id": interrupted_processing_job_row["id"],
            "module_id": "male_female",
            "state": "interrupted",
            "batch_order": 2,
            "input_relative_path": "stems/vocals.htdemucs_6s.flac",
            "output_paths": [
                "stems/vocals.male_female.flac",
                "stems/vocals.male_female.json",
                "waveforms/vocals.male_female.json",
            ],
            "started_at": "2026-03-30T00:04:00Z",
            "finished_at": None,
            "error_message": "app terminated",
            "cleanup_required": True,
            "requested_directly": True,
        },
        {
            "job_id": interrupted_processing_job_row["id"],
            "module_id": "reverb_removal",
            "state": "pending",
            "batch_order": 3,
            "input_relative_path": "stems/vocals.male_female.flac",
            "output_paths": [],
            "started_at": None,
            "finished_at": None,
            "cleanup_required": False,
            "requested_directly": False,
        },
    ]


@pytest.fixture
def interrupted_project_file_rows(interrupted_project_row, interrupted_processing_batch_rows):
    return [
        {
            "project_id": interrupted_project_row["id"],
            "relative_path": "original/song.wav",
            "role": "original",
        },
        {
            "project_id": interrupted_project_row["id"],
            "relative_path": "stems/vocals.htdemucs_6s.flac",
            "role": "stem",
        },
        {
            "project_id": interrupted_project_row["id"],
            "relative_path": "stems/drums.htdemucs_6s.flac",
            "role": "stem",
        },
        {
            "project_id": interrupted_project_row["id"],
            "relative_path": interrupted_processing_batch_rows[1]["output_paths"][0],
            "role": "stem",
        },
        {
            "project_id": interrupted_project_row["id"],
            "relative_path": interrupted_processing_batch_rows[1]["output_paths"][2],
            "role": "waveform",
        },
    ]


@pytest.fixture
def interrupted_processing_context(
    library_root,
    interrupted_project_row,
    interrupted_project_file_rows,
    interrupted_processing_job_row,
    interrupted_processing_batch_rows,
):
    database = Database(str(library_root))
    project_repository = ProjectRepository(database)
    processing_job_repository = ProcessingJobRepository(database)

    project_repository.replace_project_snapshot(
        interrupted_project_row,
        interrupted_project_file_rows,
    )
    processing_job_repository.create_job(interrupted_processing_job_row)
    processing_job_repository.replace_batches(
        interrupted_processing_job_row["id"],
        interrupted_processing_batch_rows,
    )

    project_path = library_root / interrupted_project_row["id"]
    (project_path / "original").mkdir(parents=True, exist_ok=True)
    (project_path / "stems").mkdir(parents=True, exist_ok=True)
    (project_path / "waveforms").mkdir(parents=True, exist_ok=True)

    for relative_path in [
        "original/song.wav",
        "stems/vocals.htdemucs_6s.flac",
        "stems/drums.htdemucs_6s.flac",
        "stems/vocals.male_female.flac",
        "waveforms/vocals.male_female.json",
    ]:
        file_path = project_path / relative_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(relative_path, encoding="utf-8")

    project_service = ProjectService(
        str(library_root),
        project_repository=project_repository,
        processing_job_repository=processing_job_repository,
    )

    return {
        "database": database,
        "project_repository": project_repository,
        "processing_job_repository": processing_job_repository,
        "project_service": project_service,
        "project": interrupted_project_row,
        "job": interrupted_processing_job_row,
        "batches": interrupted_processing_batch_rows,
        "project_path": project_path,
    }
