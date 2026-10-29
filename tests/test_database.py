import uuid
import pytest
from voice_transcriber.core import database


def test_database_crud_and_cascade():
    database.init_db()
    rec_id = str(uuid.uuid4())

    # Create recording
    database.create_recording(rec_id, "test_audio.m4a", "/tmp/test_audio.m4a", "Test Recording")
    rec = database.get_recording(rec_id)
    assert rec is not None
    assert rec["id"] == rec_id
    assert rec["title"] == "Test Recording"
    assert rec["status"] == "uploaded"

    # Update status
    database.update_recording_status(rec_id, status="completed", progress=100.0, duration=42.5)
    rec = database.get_recording(rec_id)
    assert rec["status"] == "completed"
    assert rec["progress"] == 100.0
    assert rec["duration"] == 42.5

    # Save segments via batch executemany
    segments = [
        {"start": 0.0, "end": 2.5, "text": "Sentence one", "speaker": "Speaker 1"},
        {"start": 3.0, "end": 6.0, "text": "Sentence two", "speaker": "Speaker 2"},
    ]
    database.save_segments(rec_id, segments)
    saved = database.get_segments(rec_id)
    assert len(saved) == 2
    assert saved[0]["text"] == "Sentence one"
    assert saved[0]["speaker_name"] == "Speaker 1"

    # Update speaker mapping
    database.update_speaker_name(rec_id, "Speaker 1", "Dr. Jane")
    saved = database.get_segments(rec_id)
    assert saved[0]["speaker_name"] == "Dr. Jane"

    # Foreign key cascade test:
    # Deleting the recording must automatically delete all segments and speaker mappings!
    database.delete_recording(rec_id)
    assert database.get_recording(rec_id) is None

    # Verify segments were cascaded
    with database.get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM segments WHERE recording_id = ?", (rec_id,))
        count_segments = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM speaker_mappings WHERE recording_id = ?", (rec_id,))
        count_mappings = cur.fetchone()[0]

    assert count_segments == 0, "Segments were not deleted on cascade"
    assert count_mappings == 0, "Speaker mappings were not deleted on cascade"
