import os
import sys
import platform
from pathlib import Path

def _get_platform_dir() -> str:
    """Get the platform-specific directory name for ffmpeg binaries."""
    system = platform.system()
    machine = platform.machine().lower()
    
    if system == "Windows":
        return "win32"
    elif system == "Darwin":
        if machine == "arm64":
            return "darwin_arm64"
        return "darwin"
    else:  # Linux
        if machine in ("aarch64", "arm64"):
            return "linux_arm64"
        return "linux"

def _bundle_dir() -> Path:
    """Get the base directory for ffmpeg binaries."""
    # PyInstaller onefile: extracts to sys._MEIPASS
    if hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    # PyInstaller onedir: next to executable
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    # Development mode: use vendor directory
    project_root = Path(__file__).resolve().parent.parent
    return project_root / "vendor" / "ffmpeg" / _get_platform_dir()

def ffmpeg_paths() -> tuple[str, str]:
    """Get paths to ffmpeg and ffprobe executables."""
    base = _bundle_dir()
    
    # In bundled mode, binaries are in 'ffmpeg' subfolder
    if hasattr(sys, "_MEIPASS") or getattr(sys, "frozen", False):
        base = base / "ffmpeg"
    
    if platform.system() == "Windows":
        ffmpeg = base / "ffmpeg.exe"
        ffprobe = base / "ffprobe.exe"
    else:
        ffmpeg = base / "ffmpeg"
        ffprobe = base / "ffprobe"
        # Ensure execute permission on unix
        if ffmpeg.exists(): os.chmod(ffmpeg, 0o755)
        if ffprobe.exists(): os.chmod(ffprobe, 0o755)

    if not ffmpeg.exists() or not ffprobe.exists():
        raise FileNotFoundError(f"ffmpeg/ffprobe not found in: {base}")

    return str(ffmpeg), str(ffprobe)

