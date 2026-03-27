import sqlite3

from persistence import Database, resolve_database_path


def test_resolve_database_path_uses_unweave_directory(library_root, database_path):
    resolved_path = resolve_database_path(str(library_root))

    assert resolved_path == database_path
    assert resolved_path.parent.exists()
    assert resolved_path.parent.name == ".unweave"
    assert resolved_path.name == "metadata.db"


def test_bootstrap_creates_projects_and_project_files_tables(library_root):
    database = Database(str(library_root))

    database.bootstrap()

    with sqlite3.connect(database.database_path) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }

    assert "projects" in tables
    assert "project_files" in tables


def test_connect_enables_row_access_and_foreign_keys(library_root):
    database = Database(str(library_root))
    database.bootstrap()

    with database.connect() as connection:
        row = connection.execute("SELECT 1 AS value").fetchone()
        pragma = connection.execute("PRAGMA foreign_keys").fetchone()

    assert isinstance(row, sqlite3.Row)
    assert row["value"] == 1
    assert pragma["foreign_keys"] == 1
