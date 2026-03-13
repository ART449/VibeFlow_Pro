#!/usr/bin/env python3
"""
VibeFlow Pro - Audio Processor
Usa yt-dlp para descargar audio y spleeter para separar vocales/instrumentales.
"""

import sys
import os
import json
import subprocess
from pathlib import Path

DOWNLOADS_DIR = Path(__file__).parent / "downloads"
DOWNLOADS_DIR.mkdir(exist_ok=True)


def download_audio(url):
    """Descarga audio de YouTube/URL usando yt-dlp."""
    output_template = str(DOWNLOADS_DIR / "%(title)s.%(ext)s")
    cmd = [
        "yt-dlp",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--output", output_template,
        "--no-playlist",
        "--print", "after_move:filepath",
        url
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        return {"error": result.stderr.strip(), "status": "failed"}

    filepath = result.stdout.strip().split("\n")[-1]
    return {
        "status": "ok",
        "file": filepath,
        "filename": os.path.basename(filepath)
    }


def separate_vocals(filepath):
    """Separa vocales e instrumentales usando demucs."""
    output_dir = str(DOWNLOADS_DIR / "separated")
    venv_python = Path(__file__).parent / "venv" / "Scripts" / "python.exe"
    python_cmd = str(venv_python) if venv_python.exists() else sys.executable
    cmd = [
        python_cmd, "-m", "demucs",
        "--two-stems", "vocals",
        "-o", output_dir,
        filepath
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        return {"error": result.stderr.strip(), "status": "failed"}

    base = Path(filepath).stem
    # demucs guarda en: output_dir/htdemucs/<nombre>/
    vocals_path = os.path.join(output_dir, "htdemucs", base, "vocals.wav")
    accomp_path = os.path.join(output_dir, "htdemucs", base, "no_vocals.wav")

    return {
        "status": "ok",
        "vocals": vocals_path if os.path.exists(vocals_path) else None,
        "accompaniment": accomp_path if os.path.exists(accomp_path) else None
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Uso: audio_processor.py <url> [download|separate]"}))
        sys.exit(1)

    url  = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else "download"

    if mode == "download":
        result = download_audio(url)
    elif mode == "separate":
        # Primero descarga, luego separa
        dl = download_audio(url)
        if dl.get("status") != "ok":
            result = dl
        else:
            result = separate_vocals(dl["file"])
            result["source"] = dl
    else:
        result = {"error": f"Modo desconocido: {mode}"}

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
