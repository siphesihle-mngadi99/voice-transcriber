import uuid
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from voice_transcriber.api.routes import app
from voice_transcriber.core import database
from voice_transcriber.config import UPLOAD_DIR


@pytest.fixture
def client():
    return TestClient(app)


def test_api_recordings_and_export(client):
    database.init_db()
    rec_id = str(uuid.uuid4())

    # Create dummy file
    dummy_file = UPLOAD_DIR / f"{rec_id}.wav"
    dummy_file.write_bytes(b"RIFF" + b"\x00" * 100)

    try:
        database.create_recording(rec_id, "test_api.wav", str(dummy_file), "API Test Session")
        database.save_segments(rec_id, [
            {"start": 0.0, "end": 2.0, "text": "Testing API", "speaker": "Speaker 1"}
        ])

        # Test list recordings
        res = client.get("/api/recordings")
        assert res.status_code == 200
        items = res.json()
        assert any(r["id"] == rec_id for r in items)

        # Test get detail
        res = client.get(f"/api/recordings/{rec_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["recording"]["title"] == "API Test Session"
        assert len(data["segments"]) == 1

        # Test PDF export
        res = client.get(f"/api/recordings/{rec_id}/export?format=pdf")
        assert res.status_code == 200
        assert res.headers["content-type"] == "application/pdf"
        assert res.content.startswith(b"%PDF")

        # Test Markdown export
        res = client.get(f"/api/recordings/{rec_id}/export?format=md")
        assert res.status_code == 200
        assert "API Test Session" in res.text

        # Test Audio streaming with HTTP Range
        # 1. Standard range
        res = client.get(f"/api/audio/{rec_id}", headers={"Range": "bytes=0-9"})
        assert res.status_code == 206
        assert len(res.content) == 10
        assert res.headers["content-range"] == f"bytes 0-9/{len(dummy_file.read_bytes())}"

        # 2. Suffix range (bytes=-20)
        res = client.get(f"/api/audio/{rec_id}", headers={"Range": "bytes=-20"})
        assert res.status_code == 206
        assert len(res.content) == 20

        # 3. Out-of-bounds range -> 416
        res = client.get(f"/api/audio/{rec_id}", headers={"Range": "bytes=999999-"})
        assert res.status_code == 416

    finally:
        database.delete_recording(rec_id)
        if dummy_file.exists():
            dummy_file.unlink()
