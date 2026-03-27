from .db import Database


class ProjectRepository:
    def __init__(self, database: Database):
        self.database = database
        self.database.bootstrap()

    def upsert_project(self, project_row):
        with self.database.transaction() as connection:
            self._upsert_project(connection, project_row)

    def replace_project_files(self, project_id, file_rows):
        with self.database.transaction() as connection:
            self._replace_project_files(connection, project_id, file_rows)

    def replace_project_snapshot(self, project_row, file_rows):
        with self.database.transaction() as connection:
            self._upsert_project(connection, project_row)
            self._replace_project_files(connection, project_row["id"], file_rows)

    def list_projects(self):
        with self.database.connect() as connection:
            rows = connection.execute(
                """
                SELECT id, name, date, thumbnail, created_at, updated_at
                FROM projects
                ORDER BY date DESC, id DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def get_project(self, project_id):
        with self.database.connect() as connection:
            row = connection.execute(
                """
                SELECT id, name, date, thumbnail, created_at, updated_at
                FROM projects
                WHERE id = ?
                """,
                (project_id,),
            ).fetchone()
        return dict(row) if row else None

    def list_project_files(self, project_id):
        with self.database.connect() as connection:
            rows = connection.execute(
                """
                SELECT id, project_id, relative_path, role, created_at
                FROM project_files
                WHERE project_id = ?
                ORDER BY relative_path ASC
                """,
                (project_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_project_snapshot(self, project_id):
        project = self.get_project(project_id)
        if not project:
            return None

        return {
            "project": project,
            "files": self.list_project_files(project_id),
        }

    def _upsert_project(self, connection, project_row):
        connection.execute(
            """
            INSERT INTO projects (id, name, date, thumbnail)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                date = excluded.date,
                thumbnail = excluded.thumbnail,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                project_row["id"],
                project_row["name"],
                project_row["date"],
                project_row.get("thumbnail"),
            ),
        )

    def _replace_project_files(self, connection, project_id, file_rows):
        connection.execute(
            "DELETE FROM project_files WHERE project_id = ?",
            (project_id,),
        )

        if not file_rows:
            return

        connection.executemany(
            """
            INSERT INTO project_files (project_id, relative_path, role)
            VALUES (?, ?, ?)
            """,
            [
                (
                    file_row["project_id"],
                    file_row["relative_path"],
                    file_row["role"],
                )
                for file_row in file_rows
            ],
        )
