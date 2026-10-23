import os
from pathlib import Path
import static_ffmpeg

# Initialize bundled FFmpeg binaries in PATH
static_ffmpeg.add_paths()

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"
if ENV_FILE.exists():
    try:
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
    except Exception:
        pass

DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
PROCESSED_DIR = DATA_DIR / "processed"
EXPORT_DIR = DATA_DIR / "exports"
STATIC_DIR = BASE_DIR / "voice_transcriber" / "frontend"

for folder in [DATA_DIR, UPLOAD_DIR, PROCESSED_DIR, EXPORT_DIR]:
    folder.mkdir(parents=True, exist_ok=True)

# Database
DB_PATH = DATA_DIR / "transcriber.db"

# Server configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8000))

# Transcription settings (Optimized for Ryzen 5 CPU)
DEFAULT_MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
DEVICE = "cpu"
COMPUTE_TYPE = "int8"
CPU_THREADS = int(os.getenv("CPU_THREADS", "4"))
VAD_FILTER = True
BEAM_SIZE = 5

# Supported audio formats
SUPPORTED_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".aac", ".ogg",
    ".flac", ".wma", ".webm", ".opus", ".mp4"
}
