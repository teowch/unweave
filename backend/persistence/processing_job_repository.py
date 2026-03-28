import json
import sqlite3

from .db import Database


JOB_STATES = (
    "running",
    "completed",
    "failed",
    "interrupted",
    "awaiting_recovery",
    "recovering",
    "discarded",
)

BATCH_STATES = (
    "pending",
    "running",
    "completed",
    "failed",
    "interrupted",
    "cleaning",
    "rerunning",
)


class ProcessingJobRepository:
    def __init__(self, database: Database):
        self.database = database
        self.database.bootstrap()

    def create_job(self, job_row):
        with self.database.transaction() as connection:
            try:
                connection.execute(
                    """
                    INSERT INTO processing_jobs (
                        id,
                        project_id,
                        state,
                        source_type,
                        source_name,
                        requested_by,
                        started_at,
                        finished_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
                    """,
                    (
                        job_row["id"],
                        job_row["project_id"],
                        job_row.get("state", "running"),
                        job_row.get("source_type"),
                        job_row.get("source_name"),
                        job_row.get("requested_by"),
                        job_row.get("started_at"),
                        job_row.get("finished_at"),
                    ),
                )
            except sqlite3.IntegrityError as exc:
                if "idx_processing_jobs_single_active" in str(exc) or "UNIQUE constraint failed" in str(exc):
                    raise ValueError("An active processing job already exists") from exc
                raise

    def replace_batches(self, job_id, batch_rows):
        with self.database.transaction() as connection:
            connection.execute("DELETE FROM processing_batches WHERE job_id = ?", (job_id,))

            if not batch_rows:
                return

            connection.executemany(
                """
                INSERT INTO processing_batches (
                    job_id,
                    module_id,
                    state,
                    batch_order,
                    input_relative_path,
                    output_paths,
                    started_at,
                    finished_at,
                    error_message,
                    cleanup_required,
                    requested_directly
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        job_id,
                        batch_row["module_id"],
                        batch_row.get("state", "pending"),
                        batch_row["batch_order"],
                        batch_row.get("input_relative_path"),
                        json.dumps(batch_row.get("output_paths", [])),
                        batch_row.get("started_at"),
                        batch_row.get("finished_at"),
                        batch_row.get("error_message"),
                        int(bool(batch_row.get("cleanup_required", False))),
                        int(batch_row.get("requested_directly", True)),
                    )
                    for batch_row in batch_rows
                ],
            )

    def update_job_state(self, job_id, state, **fields):
        assignments = ["state = ?", "finished_at = COALESCE(?, finished_at)"]
        values = [state, fields.get("finished_at")]

        with self.database.transaction() as connection:
            connection.execute(
                f"""
                UPDATE processing_jobs
                SET {", ".join(assignments)}
                WHERE id = ?
                """,
                (*values, job_id),
            )

    def update_batch_state(self, job_id, batch_order, state, **fields):
        assignments = [
            "state = ?",
            "started_at = COALESCE(?, started_at)",
            "finished_at = COALESCE(?, finished_at)",
            "output_paths = COALESCE(?, output_paths)",
            "error_message = COALESCE(?, error_message)",
            "cleanup_required = COALESCE(?, cleanup_required)",
            "updated_at = CURRENT_TIMESTAMP",
        ]
        values = [
            state,
            fields.get("started_at"),
            fields.get("finished_at"),
            None if "output_paths" not in fields else json.dumps(fields["output_paths"]),
            fields.get("error_message"),
            None if "cleanup_required" not in fields else int(bool(fields["cleanup_required"])),
        ]

        with self.database.transaction() as connection:
            connection.execute(
                f"""
                UPDATE processing_batches
                SET {", ".join(assignments)}
                WHERE job_id = ? AND batch_order = ?
                """,
                (*values, job_id, batch_order),
            )

    def get_job_snapshot(self, job_id):
        with self.database.connect() as connection:
            job_row = connection.execute(
                """
                SELECT
                    id,
                    project_id,
                    state,
                    source_type,
                    source_name,
                    requested_by,
                    created_at,
                    started_at,
                    finished_at
                FROM processing_jobs
                WHERE id = ?
                """,
                (job_id,),
            ).fetchone()
            if not job_row:
                return None

            batch_rows = connection.execute(
                """
                SELECT
                    job_id,
                    module_id,
                    state,
                    batch_order,
                    input_relative_path,
                    output_paths,
                    started_at,
                    finished_at,
                    error_message,
                    cleanup_required,
                    requested_directly,
                    created_at,
                    updated_at
                FROM processing_batches
                WHERE job_id = ?
                ORDER BY batch_order ASC
                """,
                (job_id,),
            ).fetchall()

        return {
            "job": dict(job_row),
            "batches": [self._hydrate_batch_row(row) for row in batch_rows],
        }

    def get_active_processing_job(self):
        with self.database.connect() as connection:
            active_row = connection.execute(
                """
                SELECT id
                FROM processing_jobs
                WHERE state IN ('running', 'interrupted', 'awaiting_recovery', 'recovering')
                ORDER BY started_at DESC, created_at DESC, id DESC
                LIMIT 1
                """
            ).fetchone()

        if not active_row:
            return None

        return self.get_job_snapshot(active_row["id"])

    def _hydrate_batch_row(self, row):
        batch = dict(row)
        batch["output_paths"] = json.loads(batch["output_paths"] or "[]")
        return batch
