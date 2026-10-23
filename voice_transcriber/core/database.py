import sqlite3
from typing import List, Dict, Optional, Any
from datetime import datetime
from voice_transcriber.config import DB_PATH


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initializes the SQLite database schema."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS recordings (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                processed_path TEXT,
                duration REAL DEFAULT 0,
                status TEXT DEFAULT 'uploaded',
                progress REAL DEFAULT 0,
                error_message TEXT,
                created_at TEXT NOT NULL,
                title TEXT
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recording_id TEXT NOT NULL,
                segment_index INTEGER NOT NULL,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                text TEXT NOT NULL,
                speaker TEXT DEFAULT 'Speaker 1',
                FOREIGN KEY (recording_id) REFERENCES recordings (id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS speaker_mappings (
                recording_id TEXT NOT NULL,
                speaker_tag TEXT NOT NULL,
                display_name TEXT NOT NULL,
                PRIMARY KEY (recording_id, speaker_tag),
                FOREIGN KEY (recording_id) REFERENCES recordings (id) ON DELETE CASCADE
            )
        """)
        # Schema migration: Ensure summary_json column exists
        cursor.execute("PRAGMA table_info(recordings)")
        cols = [row[1] for row in cursor.fetchall()]
        if "summary_json" not in cols:
            cursor.execute("ALTER TABLE recordings ADD COLUMN summary_json TEXT")

        conn.commit()


def create_recording(rec_id: str, filename: str, file_path: str, title: Optional[str] = None) -> None:
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO recordings (id, filename, file_path, status, progress, created_at, title)
            VALUES (?, ?, ?, 'uploaded', 0.0, ?, ?)
            """,
            (rec_id, filename, file_path, now, title or filename),
        )
        conn.commit()


def update_recording_status(
    rec_id: str,
    status: str,
    progress: Optional[float] = None,
    duration: Optional[float] = None,
    processed_path: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    with get_connection() as conn:
        updates = ["status = ?"]
        params: List[Any] = [status]

        if progress is not None:
            updates.append("progress = ?")
            params.append(progress)
        if duration is not None:
            updates.append("duration = ?")
            params.append(duration)
        if processed_path is not None:
            updates.append("processed_path = ?")
            params.append(processed_path)
        if error_message is not None:
            updates.append("error_message = ?")
            params.append(error_message)

        params.append(rec_id)
        query = f"UPDATE recordings SET {', '.join(updates)} WHERE id = ?"
        conn.execute(query, params)
        conn.commit()


def save_segments(rec_id: str, segments: List[Dict[str, Any]]) -> None:
    with get_connection() as conn:
        # Clear existing segments if re-processing
        conn.execute("DELETE FROM segments WHERE recording_id = ?", (rec_id,))
        for idx, seg in enumerate(segments):
            conn.execute(
                """
                INSERT INTO segments (recording_id, segment_index, start_time, end_time, text, speaker)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    rec_id,
                    idx,
                    seg.get("start", 0.0),
                    seg.get("end", 0.0),
                    seg.get("text", "").strip(),
                    seg.get("speaker", "Speaker 1"),
                ),
            )
        conn.commit()


def get_recording(rec_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM recordings WHERE id = ?", (rec_id,))
        row = cur.fetchone()
        if not row:
            return None
        return dict(row)


def list_recordings() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM recordings ORDER BY created_at DESC")
        return [dict(r) for r in cur.fetchall()]


def get_segments(rec_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.*, COALESCE(sm.display_name, s.speaker) as speaker_name
            FROM segments s
            LEFT JOIN speaker_mappings sm 
              ON s.recording_id = sm.recording_id AND s.speaker = sm.speaker_tag
            WHERE s.recording_id = ?
            ORDER BY s.segment_index ASC
            """,
            (rec_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def update_speaker_name(rec_id: str, speaker_tag: str, display_name: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO speaker_mappings (recording_id, speaker_tag, display_name)
            VALUES (?, ?, ?)
            ON CONFLICT(recording_id, speaker_tag) 
            DO UPDATE SET display_name = excluded.display_name
            """,
            (rec_id, speaker_tag, display_name),
        )
        conn.commit()


def delete_recording(rec_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM recordings WHERE id = ?", (rec_id,))
        conn.commit()


def save_recording_summary(rec_id: str, summary_json: str) -> None:
    with get_connection() as conn:
        conn.execute("UPDATE recordings SET summary_json = ? WHERE id = ?", (summary_json, rec_id))
        conn.commit()

