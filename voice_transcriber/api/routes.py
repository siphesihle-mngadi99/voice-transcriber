import os
import uuid
import asyncio
import json
from pathlib import Path
from typing import Optional, Dict, Any, List
from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    BackgroundTasks,
    HTTPException,
    Request,
    Response,
    status,
)
from fastapi.responses import (
    StreamingResponse,
    FileResponse,
    JSONResponse,
    HTMLResponse,
)
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from voice_transcriber.config import (
    UPLOAD_DIR,
    PROCESSED_DIR,
    STATIC_DIR,
    SUPPORTED_EXTENSIONS,
    DEFAULT_MODEL_SIZE,
)
from voice_transcriber.core.database import (
    init_db,
    create_recording,
    get_recording,
    list_recordings,
    get_segments,
    update_speaker_name,
    delete_recording,
    update_recording_status,
)
from voice_transcriber.core.transcriber import transcribe_recording
from voice_transcriber.core.export import (
    export_markdown,
    export_srt,
    export_vtt,
    export_txt,
    export_json,
)

app = FastAPI(
    title="VoiceScribe",
    description="Local-First Long-Form Audio Transcriber & Note Synthesizer",
    version="1.0.0",
)

# Enable CORS for local network and mobile access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Real-time event subscribers: {recording_id: [asyncio.Queue]}
_EVENT_LISTENERS: Dict[str, List[asyncio.Queue]] = {}


def broadcast_event(recording_id: str, payload: Dict[str, Any]):
    """Pushes a live progress update to all connected SSE clients."""
    if recording_id in _EVENT_LISTENERS:
        for queue in _EVENT_LISTENERS[recording_id]:
            queue.put_nowait(payload)


class SpeakerUpdateModel(BaseModel):
    speaker_tag: str
    display_name: str


@app.on_event("startup")
def on_startup():
    init_db()


# Mount static directory for frontend
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="Frontend index.html not found")
    return HTMLResponse(content=index_file.read_text(encoding="utf-8"))


@app.post("/api/upload")
async def upload_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    model_name: Optional[str] = Form(DEFAULT_MODEL_SIZE),
    enable_diarization: Optional[bool] = Form(True),
):
    """Ingests any long-form audio recording, stores it on disk, and launches
    background transcription with speaker identification.
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    recording_id = str(uuid.uuid4())
    saved_filename = f"{recording_id}{ext}"
    saved_path = UPLOAD_DIR / saved_filename

    # Stream file to disk in 1MB chunks to handle multi-gigabyte files with low RAM
    with open(saved_path, "wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            buffer.write(chunk)

    # Register in database
    create_recording(
        rec_id=recording_id,
        filename=file.filename,
        file_path=str(saved_path),
        title=Path(file.filename).stem.replace("_", " ").title(),
    )

    # Background task callback for real-time progress events
    def on_progress(percent: float, message: str):
        broadcast_event(
            recording_id,
            {
                "recording_id": recording_id,
                "progress": percent,
                "message": message,
            },
        )

    def run_pipeline():
        try:
            transcribe_recording(
                recording_id=recording_id,
                original_file_path=saved_path,
                model_name=model_name,
                enable_diarization=enable_diarization,
                progress_callback=on_progress,
            )
        except Exception as e:
            broadcast_event(
                recording_id,
                {
                    "recording_id": recording_id,
                    "progress": -1,
                    "message": f"Error: {str(e)}",
                },
            )

    background_tasks.add_task(run_pipeline)

    return {
        "status": "queued",
        "recording_id": recording_id,
        "filename": file.filename,
    }


@app.get("/api/recordings")
def get_all_recordings():
    """Lists all past sessions and their current status."""
    return list_recordings()


@app.get("/api/recordings/{rec_id}")
def get_recording_detail(rec_id: str):
    """Returns recording metadata along with all transcribed segments."""
    rec = get_recording(rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")

    segments = get_segments(rec_id)
    return {
        "recording": rec,
        "segments": segments,
    }


@app.get("/api/recordings/{rec_id}/events")
async def stream_events(rec_id: str):
    """Server-Sent Events (SSE) endpoint for real-time transcription progress."""
    queue = asyncio.Queue()
    if rec_id not in _EVENT_LISTENERS:
        _EVENT_LISTENERS[rec_id] = []
    _EVENT_LISTENERS[rec_id].append(queue)

    async def event_generator():
        try:
            # Emit current state immediately
            rec = get_recording(rec_id)
            if rec:
                init_data = {
                    "recording_id": rec_id,
                    "status": rec["status"],
                    "progress": rec["progress"],
                    "message": f"Status: {rec['status']}",
                }
                yield f"data: {json.dumps(init_data)}\n\n"

            while True:
                # Wait for next event or timeout to send heartbeat
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield f"data: {json.dumps(payload)}\n\n"
                    if payload.get("progress", 0) >= 100 or payload.get("progress", 0) < 0:
                        break
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            if rec_id in _EVENT_LISTENERS and queue in _EVENT_LISTENERS[rec_id]:
                _EVENT_LISTENERS[rec_id].remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/recordings/{rec_id}/speakers")
def rename_speaker(rec_id: str, data: SpeakerUpdateModel):
    """Updates the friendly display name for a speaker across all segments."""
    rec = get_recording(rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")

    update_speaker_name(rec_id, data.speaker_tag, data.display_name)
    return {"status": "updated", "speaker_tag": data.speaker_tag, "display_name": data.display_name}


@app.get("/api/audio/{rec_id}")
async def stream_audio(rec_id: str, request: Request):
    """Streams audio with full HTTP Range request support for instant seeking."""
    rec = get_recording(rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Prefer normalized 16kHz WAV if available, otherwise original file
    file_path = None
    if rec.get("processed_path") and Path(rec["processed_path"]).exists():
        file_path = Path(rec["processed_path"])
    elif rec.get("file_path") and Path(rec["file_path"]).exists():
        file_path = Path(rec["file_path"])

    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found on disk")

    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")

    content_type = "audio/wav"
    if file_path.suffix.lower() == ".mp3":
        content_type = "audio/mpeg"
    elif file_path.suffix.lower() == ".m4a":
        content_type = "audio/mp4"

    if range_header:
        # Parse range header: "bytes=start-end"
        range_value = range_header.strip().lower().replace("bytes=", "")
        parts = range_value.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
        end = min(end, file_size - 1)
        chunk_size = (end - start) + 1

        def iter_file():
            with open(file_path, "rb") as f:
                f.seek(start)
                bytes_left = chunk_size
                while bytes_left > 0:
                    read_len = min(65536, bytes_left)
                    data = f.read(read_len)
                    if not data:
                        break
                    bytes_left -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
            "Content-Type": content_type,
        }
        return StreamingResponse(iter_file(), status_code=206, headers=headers)
    else:
        def iter_full():
            with open(file_path, "rb") as f:
                while chunk := f.read(65536):
                    yield chunk

        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": content_type,
        }
        return StreamingResponse(iter_full(), status_code=200, headers=headers)


@app.get("/api/recordings/{rec_id}/export")
def export_file(rec_id: str, format: str = "md"):
    """Exports the transcript as Markdown, SRT, VTT, TXT, or JSON."""
    rec = get_recording(rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")

    segments = get_segments(rec_id)
    base_name = Path(rec.get("filename", "recording")).stem

    fmt = format.lower()
    if fmt == "md":
        content = export_markdown(rec, segments)
        media_type = "text/markdown"
        filename = f"{base_name}_transcript.md"
    elif fmt == "srt":
        content = export_srt(segments)
        media_type = "application/x-subrip"
        filename = f"{base_name}.srt"
    elif fmt == "vtt":
        content = export_vtt(segments)
        media_type = "text/vtt"
        filename = f"{base_name}.vtt"
    elif fmt == "txt":
        content = export_txt(segments)
        media_type = "text/plain"
        filename = f"{base_name}.txt"
    elif fmt == "json":
        content = export_json(rec, segments)
        media_type = "application/json"
        filename = f"{base_name}.json"
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format '{fmt}'")

    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=content, media_type=media_type, headers=headers)


@app.delete("/api/recordings/{rec_id}")
def delete_item(rec_id: str):
    """Deletes recording and clears files from disk."""
    rec = get_recording(rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")

    for key in ["file_path", "processed_path"]:
        if rec.get(key):
            try:
                p = Path(rec[key])
                if p.exists():
                    p.unlink()
            except Exception:
                pass

    delete_recording(rec_id)
    return {"status": "deleted", "recording_id": rec_id}
