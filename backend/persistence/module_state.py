from pathlib import Path

from modules import MODULE_REGISTRY


AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac"}
MODULE_OUTPUT_NAMES = {
    output_name: module_id
    for module_id, config in MODULE_REGISTRY.items()
    for output_name in config.get("custom_output_names", {}).values()
}


def is_audio_file(relative_path):
    return Path(relative_path).suffix.lower() in AUDIO_EXTENSIONS


def _basename_without_extension(relative_path):
    return Path(relative_path).stem


def _normalize_file_row(file_row):
    relative_path = file_row["relative_path"]
    return {
        "relative_path": relative_path,
        "basename": Path(relative_path).name,
        "basename_without_extension": _basename_without_extension(relative_path),
        "role": file_row.get("role"),
        "is_audio": is_audio_file(relative_path),
    }


def _matched_module_id(file_info):
    return MODULE_OUTPUT_NAMES.get(file_info["basename_without_extension"])


def derive_project_state(file_rows):
    normalized_files = [_normalize_file_row(file_row) for file_row in file_rows]
    audio_files = [file_info for file_info in normalized_files if file_info["is_audio"]]

    matched_audio = []
    unmatched_audio = []
    executed_modules = set()

    for file_info in audio_files:
        module_id = _matched_module_id(file_info)
        if module_id:
            matched_audio.append(file_info)
            executed_modules.add(module_id)
        else:
            unmatched_audio.append(file_info)

    original_file = None
    explicit_original = next(
        (file_info for file_info in unmatched_audio if file_info["role"] == "original"),
        None,
    )
    if explicit_original:
        original_file = explicit_original["relative_path"]
    elif unmatched_audio:
        sorted_unmatched = sorted(
            unmatched_audio,
            key=lambda file_info: (
                file_info["basename_without_extension"].endswith(".unified"),
                file_info["relative_path"],
            ),
        )
        original_file = sorted_unmatched[0]["relative_path"]

    stem_candidates = [file_info["relative_path"] for file_info in matched_audio]
    stem_candidates.extend(
        file_info["relative_path"]
        for file_info in unmatched_audio
        if file_info["relative_path"] != original_file
    )

    return {
        "original_file": original_file,
        "stems": sorted(stem_candidates),
        "executed_modules": sorted(executed_modules),
        "audio_files": sorted(file_info["relative_path"] for file_info in audio_files),
    }
