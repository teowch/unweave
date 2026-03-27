from persistence.module_state import derive_project_state


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
        "project": project_row,
        "files": file_rows,
        "history": build_history_entry(project_row, file_rows),
        "status": {
            "id": project_row["id"],
            "executed_modules": state["executed_modules"],
            "original_file": state["original_file"],
        },
        "state": state,
    }
