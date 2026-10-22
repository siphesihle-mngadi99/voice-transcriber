from pathlib import Path
from typing import List, Dict, Any, Optional, Callable
import faster_whisper
from voice_transcriber.config import (
    DEFAULT_MODEL_SIZE,
    DEVICE,
    COMPUTE_TYPE,
    CPU_THREADS,
    BEAM_SIZE,
    VAD_FILTER,
)
from voice_transcriber.core.audio import probe_audio, normalize_and_convert_audio
from voice_transcriber.core.diarizer import diarize_segments
from voice_transcriber.core.database import (
    update_recording_status,
    save_segments,
)

# Global model cache to avoid reloading weights repeatedly
_MODEL_CACHE: Dict[str, faster_whisper.WhisperModel] = {}


def get_model(model_name: Optional[str] = None) -> faster_whisper.WhisperModel:
    """Returns a cached WhisperModel instance configured for CPU INT8 inference."""
    size = model_name or DEFAULT_MODEL_SIZE
    if size not in _MODEL_CACHE:
        _MODEL_CACHE[size] = faster_whisper.WhisperModel(
            size,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            cpu_threads=CPU_THREADS,
        )
    return _MODEL_CACHE[size]


def transcribe_recording(
    recording_id: str,
    original_file_path: Path,
    model_name: Optional[str] = None,
    enable_diarization: bool = True,
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> List[Dict[str, Any]]:
    """Executes the full transcription pipeline for a recording:
    1. Probe audio metadata and duration
    2. Convert & normalize into 16kHz mono WAV using FFmpeg
    3. Transcribe with faster-whisper (INT8 CPU multithreading & Silero VAD)
    4. Distinguish speakers using acoustic diarization
    5. Persist segments and status to SQLite database
    """
    try:
        # Step 1: Probe metadata
        update_recording_status(recording_id, status="preprocessing", progress=5.0)
        if progress_callback:
            progress_callback(5.0, "Probing audio stream...")

        meta = probe_audio(original_file_path)
        total_duration = max(1.0, meta["duration"])

        # Step 2: Normalize and convert
        update_recording_status(
            recording_id,
            status="normalizing",
            progress=15.0,
            duration=total_duration,
        )
        if progress_callback:
            progress_callback(15.0, "Normalizing audio with FFmpeg...")

        normalized_path = normalize_and_convert_audio(original_file_path, recording_id)
        update_recording_status(
            recording_id,
            status="transcribing",
            progress=25.0,
            processed_path=str(normalized_path),
        )

        # Step 3: Transcribe with Faster-Whisper
        model = get_model(model_name)
        if progress_callback:
            progress_callback(25.0, "Transcribing with Whisper...")

        segments_generator, info = model.transcribe(
            str(normalized_path),
            beam_size=BEAM_SIZE,
            vad_filter=VAD_FILTER,
            vad_parameters=dict(min_silence_duration_ms=500),
            word_timestamps=False,
        )

        extracted_segments: List[Dict[str, Any]] = []

        for seg in segments_generator:
            extracted_segments.append({
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": seg.text.strip(),
                "speaker": "Speaker 1",
            })

            # Calculate progress: scale transcription from 25% to 85%
            current_time = min(total_duration, seg.end)
            progress_val = 25.0 + (current_time / total_duration) * 60.0
            progress_val = min(85.0, round(progress_val, 1))

            update_recording_status(recording_id, status="transcribing", progress=progress_val)
            if progress_callback:
                progress_callback(progress_val, seg.text.strip())

        # Step 4: Speaker Diarization
        if enable_diarization and extracted_segments:
            update_recording_status(recording_id, status="diarizing", progress=88.0)
            if progress_callback:
                progress_callback(88.0, "Identifying speakers...")
            extracted_segments = diarize_segments(normalized_path, extracted_segments)

        # Step 5: Save to Database & Complete
        save_segments(recording_id, extracted_segments)
        update_recording_status(
            recording_id,
            status="completed",
            progress=100.0,
            duration=total_duration,
        )

        if progress_callback:
            progress_callback(100.0, "Transcription complete!")

        return extracted_segments

    except Exception as exc:
        err_msg = str(exc)
        update_recording_status(
            recording_id,
            status="failed",
            error_message=err_msg,
        )
        if progress_callback:
            progress_callback(-1.0, f"Error: {err_msg}")
        raise exc
