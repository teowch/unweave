import json
import sqlite3

from .db import Database
from modules import MODULE_REGISTRY, load_model_data


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

MODEL_LOOKUP = load_model_data()


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
                        download_state,
                        download_progress,
                        completion_acknowledged_at,
                        started_at,
                        finished_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
                    """,
                    (
                        job_row["id"],
                        job_row["project_id"],
                        job_row.get("state", "running"),
                        job_row.get("source_type"),
                        job_row.get("source_name"),
                        job_row.get("requested_by"),
                        job_row.get("download_state", "pending"),
                        self._clamp_progress(job_row.get("download_progress", 0)),
                        job_row.get("completion_acknowledged_at"),
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
                    progress,
                    batch_order,
                    input_relative_path,
                    output_paths,
                    started_at,
                    finished_at,
                    error_message,
                    cleanup_required,
                    requested_directly
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        job_id,
                        batch_row["module_id"],
                        batch_row.get("state", "pending"),
                        self._clamp_progress(
                            batch_row.get(
                                "progress",
                                100 if batch_row.get("state") == "completed" else 0,
                            )
                        ),
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
        assignments = [
            "state = ?",
            "finished_at = COALESCE(?, finished_at)",
            "download_state = COALESCE(?, download_state)",
            "download_progress = COALESCE(?, download_progress)",
            "completion_acknowledged_at = COALESCE(?, completion_acknowledged_at)",
        ]
        values = [
            state,
            fields.get("finished_at"),
            fields.get("download_state"),
            None if "download_progress" not in fields else self._clamp_progress(fields.get("download_progress")),
            fields.get("completion_acknowledged_at"),
        ]

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
        progress_value = fields.get("progress")
        if progress_value is None and state == "completed":
            progress_value = 100

        assignments = [
            "state = ?",
            "progress = COALESCE(?, progress)",
            "started_at = COALESCE(?, started_at)",
            "finished_at = COALESCE(?, finished_at)",
            "output_paths = COALESCE(?, output_paths)",
            "error_message = COALESCE(?, error_message)",
            "cleanup_required = COALESCE(?, cleanup_required)",
            "updated_at = CURRENT_TIMESTAMP",
        ]
        values = [
            state,
            None if progress_value is None else self._clamp_progress(progress_value),
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
                    download_state,
                    download_progress,
                    completion_acknowledged_at,
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
                    progress,
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

        hydrated_job = dict(job_row)
        hydrated_batches = [self._hydrate_batch_row(row) for row in batch_rows]

        return {
            "job": hydrated_job,
            "project": self._get_project_payload(hydrated_job["project_id"]),
            "steps": self._build_steps(hydrated_job, hydrated_batches),
            "overall_progress": self._compute_overall_progress(hydrated_job, hydrated_batches),
            "batches": hydrated_batches,
        }

    def get_active_processing_job(self):
        with self.database.connect() as connection:
            active_row = connection.execute(
                """
                SELECT id
                FROM processing_jobs
                WHERE state IN ('running', 'interrupted', 'awaiting_recovery', 'recovering')
                   OR (
                        state = 'completed'
                        AND completion_acknowledged_at IS NULL
                   )
                ORDER BY
                    CASE
                        WHEN state IN ('running', 'interrupted', 'awaiting_recovery', 'recovering') THEN 0
                        ELSE 1
                    END,
                    COALESCE(finished_at, started_at, created_at) DESC,
                    created_at DESC,
                    id DESC
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

    def acknowledge_job_completion(self, job_id, acknowledged_at):
        with self.database.transaction() as connection:
            connection.execute(
                """
                UPDATE processing_jobs
                SET completion_acknowledged_at = ?
                WHERE id = ?
                """,
                (acknowledged_at, job_id),
            )

        return self.get_job_snapshot(job_id)

    def _get_project_payload(self, project_id):
        with self.database.connect() as connection:
            row = connection.execute(
                """
                SELECT id, name, thumbnail
                FROM projects
                WHERE id = ?
                """,
                (project_id,),
            ).fetchone()

        if row:
            return dict(row)

        return {
            "id": project_id,
            "name": project_id,
            "thumbnail": None,
        }

    def _build_steps(self, job_row, batch_rows):
        steps = []

        if job_row.get("source_type") == "url":
            steps.append(
                {
                    "id": "download",
                    "kind": "download",
                    "label": "Download",
                    "state": job_row.get("download_state", "pending"),
                    "progress": self._clamp_progress(job_row.get("download_progress", 0)),
                    "order": 1,
                }
            )

        next_order = len(steps) + 1
        for index, batch_row in enumerate(batch_rows, start=next_order):
            module_config = MODULE_REGISTRY.get(batch_row["module_id"], {})
            model_filename = module_config.get("model")
            model_label = MODEL_LOOKUP.get(model_filename, {}).get("display_name")
            steps.append(
                {
                    "id": batch_row["module_id"],
                    "kind": "module",
                    "label": model_label or model_filename or batch_row["module_id"],
                    "state": batch_row["state"],
                    "progress": self._clamp_progress(batch_row.get("progress", 0)),
                    "order": index,
                }
            )

        return steps

    def _compute_overall_progress(self, job_row, batch_rows):
        steps = self._build_steps(job_row, batch_rows)
        if not steps:
            return 0

        return self._clamp_progress(
            round(sum(step["progress"] for step in steps) / len(steps))
        )

    def _clamp_progress(self, progress):
        return max(0, min(100, int(progress or 0)))
