import subprocess
import json
import shutil
from pathlib import Path
from typing import Dict, Any, Optional
import static_ffmpeg
from voice_transcriber.config import PROCESSED_DIR

static_ffmpeg.add_paths()


def get_ffmpeg_path() -> str:
    return shutil.which("ffmpeg") or "ffmpeg"


def get_ffprobe_path() -> str:
    return shutil.which("ffprobe") or "ffprobe"


def probe_audio(file_path: Path) -> Dict[str, Any]:
    """Inspects audio metadata (duration, format, channels, bitrate) using ffprobe.
    Does not decode the file, running instantaneously even on 3+ hour recordings.
    """
    ffprobe_bin = get_ffprobe_path()
    cmd = [
        ffprobe_bin,
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(file_path),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr}")

    data = json.loads(result.stdout)
    format_info = data.get("format", {})
    duration = float(format_info.get("duration", 0.0))
    size_bytes = int(format_info.get("size", 0))

    audio_stream = None
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "audio":
            audio_stream = stream
            break

    channels = int(audio_stream.get("channels", 1)) if audio_stream else 1
    sample_rate = int(audio_stream.get("sample_rate", 16000)) if audio_stream else 16000
    codec = audio_stream.get("codec_name", "unknown") if audio_stream else "unknown"

    return {
        "duration": duration,
        "size_bytes": size_bytes,
        "channels": channels,
        "sample_rate": sample_rate,
        "codec": codec,
    }


def normalize_and_convert_audio(
    input_path: Path,
    recording_id: str,
    target_sample_rate: int = 16000,
) -> Path:
    """Preprocesses any audio format (.m4a, .mp3, .wav, .aac, .ogg, etc.) into a
    standardized 16kHz 16-bit mono WAV with audio normalization.
    
    This eliminates cloud file size limits, removes stereo overhead, and boosts 
    faint speech from meeting participants.
    """
    output_path = PROCESSED_DIR / f"{recording_id}_16k.wav"
    ffmpeg_bin = get_ffmpeg_path()

    # Dynamic audio normalization filter: boosts quiet voices without clipping
    audio_filter = "dynaudnorm=f=150:g=15"

    cmd = [
        ffmpeg_bin,
        "-y",                     # Overwrite output if exists
        "-nostdin",
        "-threads", "0",
        "-i", str(input_path),
        "-af", audio_filter,
        "-ar", str(target_sample_rate),
        "-ac", "1",               # Convert stereo to mono
        "-c:a", "pcm_s16le",      # Standard 16-bit uncompressed PCM
        str(output_path),
    ]

    process = subprocess.run(cmd, capture_output=True, text=True)
    if process.returncode != 0:
        raise RuntimeError(f"FFmpeg normalization failed: {process.stderr}")

    return output_path
