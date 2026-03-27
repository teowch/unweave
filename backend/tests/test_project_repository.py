from persistence import Database
from persistence.project_repository import ProjectRepository


def test_upsert_and_get_project_snapshot(library_root, sample_project_row, sample_file_rows):
    repository = ProjectRepository(Database(str(library_root)))

    repository.replace_project_snapshot(sample_project_row, sample_file_rows)

    project = repository.get_project(sample_project_row["id"])
    files = repository.list_project_files(sample_project_row["id"])
    snapshot = repository.get_project_snapshot(sample_project_row["id"])

    assert project["id"] == sample_project_row["id"]
    assert project["name"] == sample_project_row["name"]
    assert project["date"] == sample_project_row["date"]
    assert project["thumbnail"] == sample_project_row["thumbnail"]
    assert len(files) == 2
    assert {row["relative_path"] for row in files} == {
        "original/song.wav",
        "stems/vocals.htdemucs_6s.flac",
    }
    assert snapshot["project"]["id"] == sample_project_row["id"]
    assert len(snapshot["files"]) == 2


def test_replace_project_files_rewrites_snapshot(library_root, sample_project_row, sample_file_rows):
    repository = ProjectRepository(Database(str(library_root)))

    repository.replace_project_snapshot(sample_project_row, sample_file_rows)
    repository.replace_project_files(
        sample_project_row["id"],
        [
            {
                "project_id": sample_project_row["id"],
                "relative_path": "stems/drums.htdemucs_6s.flac",
                "role": "stem",
            }
        ],
    )

    files = repository.list_project_files(sample_project_row["id"])

    assert len(files) == 1
    assert files[0]["project_id"] == sample_project_row["id"]
    assert files[0]["relative_path"] == "stems/drums.htdemucs_6s.flac"
    assert files[0]["role"] == "stem"
    assert isinstance(files[0]["id"], int)
    assert files[0]["created_at"]


def test_list_projects_returns_metadata_without_binary_contents(
    library_root, sample_project_row, sample_file_rows
):
    repository = ProjectRepository(Database(str(library_root)))

    repository.replace_project_snapshot(sample_project_row, sample_file_rows)

    projects = repository.list_projects()

    assert projects == [
        {
            "id": sample_project_row["id"],
            "name": sample_project_row["name"],
            "date": sample_project_row["date"],
            "thumbnail": sample_project_row["thumbnail"],
            "created_at": projects[0]["created_at"],
            "updated_at": projects[0]["updated_at"],
        }
    ]
