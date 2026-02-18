import os
import zipfile
import shutil
import urllib.request
from pathlib import Path

# Ajuste aqui se necessário
BASE_URL = "https://github.com/zackees/ffmpeg_bins/raw/main"
VERSION = "v8.0"

BASE_OUT = Path("vendor/ffmpeg")
TMP = Path("vendor/_tmp")

# Final ZIP Name -> (pasta interna esperada no zip, nome do diretório final)
TARGETS = {
    "win32.zip":        ("win32",        "win32"),
    "linux.zip":        ("linux",        "linux"),
    "linux_arm64.zip":  ("linux_arm64",  "linux_arm64"),
    "darwin.zip":       ("darwin",       "darwin"),
    "darwin_arm64.zip": ("darwin_arm64", "darwin_arm64"),
}

def url_exists(url: str) -> bool:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "python"})
    try:
        with urllib.request.urlopen(req) as r:
            return 200 <= r.status < 400
    except Exception:
        return False

def download(url: str, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "python"})
    print(f"⬇️  baixando {url}")
    with urllib.request.urlopen(req) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)

def extract_zip(zip_path: Path, out_dir: Path):
    print(f"📦 extraindo {zip_path.name}")
    out_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(out_dir)

def find_binary(root: Path, name: str) -> Path:
    for p in root.rglob(name):
        if p.is_file():
            return p
    raise FileNotFoundError(f"{name} não encontrado em {root}")

def main():
    BASE_OUT.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)

    for zip_name, (inner_dir_hint, out_dir_name) in TARGETS.items():
        url = f"{BASE_URL}/{VERSION}/{zip_name}"

        if not url_exists(url):
            raise RuntimeError(f"Não encontrei {url} (404). Verifique BASE_URL/VERSION/zip_name.")

        zip_path = TMP / zip_name
        extract_dir = TMP / out_dir_name

        download(url, zip_path)
        extract_zip(zip_path, extract_dir)

        out_dir = BASE_OUT / out_dir_name
        out_dir.mkdir(parents=True, exist_ok=True)

        is_windows = (out_dir_name == "win32")
        ffmpeg_name = "ffmpeg.exe" if is_windows else "ffmpeg"
        ffprobe_name = "ffprobe.exe" if is_windows else "ffprobe"

        # tenta priorizar o caminho sugerido (pasta interna), mas cai pra busca global
        preferred_root = extract_dir / inner_dir_hint
        if preferred_root.exists():
            ffmpeg_src = find_binary(preferred_root, ffmpeg_name)
            ffprobe_src = find_binary(preferred_root, ffprobe_name)
        else:
            ffmpeg_src = find_binary(extract_dir, ffmpeg_name)
            ffprobe_src = find_binary(extract_dir, ffprobe_name)

        shutil.copy2(ffmpeg_src, out_dir / ffmpeg_name)
        shutil.copy2(ffprobe_src, out_dir / ffprobe_name)

        if not is_windows:
            os.chmod(out_dir / ffmpeg_name, 0o755)
            os.chmod(out_dir / ffprobe_name, 0o755)

        print(f"✅ {out_dir_name} pronto em {out_dir}")

    # limpeza opcional
    shutil.rmtree(TMP, ignore_errors=True)
    print("🎉 Todos os targets baixados e preparados com sucesso!")

if __name__ == "__main__":
    main()
