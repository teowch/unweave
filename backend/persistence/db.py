import sqlite3
from contextlib import contextmanager
from pathlib import Path


SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    thumbnail TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, relative_path),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS processing_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'running' CHECK (
        state IN (
            'running',
            'completed',
            'failed',
            'interrupted',
            'awaiting_recovery',
            'recovering',
            'discarded'
        )
    ),
    source_type TEXT,
    source_name TEXT,
    requested_by TEXT,
    download_state TEXT NOT NULL DEFAULT 'pending',
    download_progress INTEGER NOT NULL DEFAULT 0,
    completion_acknowledged_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT
);

CREATE TABLE IF NOT EXISTS processing_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (
        state IN (
            'pending',
            'running',
            'completed',
            'failed',
            'interrupted',
            'cleaning',
            'rerunning'
        )
    ),
    progress INTEGER NOT NULL DEFAULT 0,
    batch_order INTEGER NOT NULL,
    input_relative_path TEXT,
    output_paths TEXT NOT NULL DEFAULT '[]',
    started_at TEXT,
    finished_at TEXT,
    error_message TEXT,
    cleanup_required INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_required IN (0, 1)),
    requested_directly INTEGER NOT NULL DEFAULT 1 CHECK (requested_directly IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, batch_order),
    FOREIGN KEY(job_id) REFERENCES processing_jobs(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processing_jobs_single_active
ON processing_jobs(1)
WHERE state IN ('running', 'interrupted', 'awaiting_recovery', 'recovering');
"""


def resolve_database_path(library_folder: str) -> Path:
    database_dir = Path(library_folder) / ".unweave"
    database_dir.mkdir(parents=True, exist_ok=True)
    return database_dir / "metadata.db"


class Database:
    def __init__(self, library_folder: str):
        self.library_folder = library_folder
        self.database_path = resolve_database_path(library_folder)

    def bootstrap(self):
        with self.transaction() as connection:
            connection.executescript(SCHEMA)
            self._apply_migrations(connection)

    def connect(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    @contextmanager
    def transaction(self):
        connection = self.connect()
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _apply_migrations(self, connection):
        self._ensure_column(
            connection,
            "processing_jobs",
            "download_state",
            "TEXT NOT NULL DEFAULT 'pending'",
        )
        self._ensure_column(
            connection,
            "processing_jobs",
            "download_progress",
            "INTEGER NOT NULL DEFAULT 0",
        )
        self._ensure_column(
            connection,
            "processing_jobs",
            "completion_acknowledged_at",
            "TEXT",
        )
        self._ensure_column(
            connection,
            "processing_batches",
            "progress",
            "INTEGER NOT NULL DEFAULT 0",
        )

    def _ensure_column(self, connection, table_name, column_name, column_definition):
        rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
        existing_columns = {row["name"] for row in rows}
        if column_name in existing_columns:
            return

        connection.execute(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"
        )
