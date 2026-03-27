from persistence.module_state import derive_project_state


def _serialize_project(project_row):
    return {
        "id": project_row["id"],
        "name": project_row["name"],
        "date": project_row["date"],
        "thumbnail": project_row.get("thumbnail"),
    }


def _serialize_files(file_rows):
    return [
        {
            "project_id": file_row["project_id"],
            "relative_path": file_row["relative_path"],
            "role": file_row.get("role"),
        }
        for file_row in sorted(file_rows, key=lambda row: row["relative_path"])
    ]


def build_history_entry(project_row, file_rows):
    state = derive_project_state(file_rows)
    history_entry = {
        "id": project_row["id"],
        "name": project_row["name"],
        "date": project_row["date"],
        "stems": state["stems"],
    }

    if state["original_file"]:
        history_entry["original"] = state["original_file"]

    thumbnail = project_row.get("thumbnail")
    if thumbnail:
        history_entry["thumbnail"] = thumbnail

    return history_entry


def build_project_snapshot(project_row, file_rows):
    state = derive_project_state(file_rows)
    return {
        "project": _serialize_project(project_row),
        "files": _serialize_files(file_rows),
        "history": build_history_entry(project_row, file_rows),
        "status": {
            "id": project_row["id"],
            "executed_modules": state["executed_modules"],
            "available_modules": state["available_modules"],
            "original_file": state["original_file"],
        },
        "state": state,
    }
