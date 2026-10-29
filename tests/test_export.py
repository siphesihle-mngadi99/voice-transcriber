import json
import pytest
from voice_transcriber.core.export import (
    export_markdown,
    export_srt,
    export_vtt,
    export_txt,
    export_json,
    export_pdf,
)


@pytest.fixture
def sample_recording():
    return {
        "id": "test-rec-123",
        "title": "Quarterly Strategic Review",
        "filename": "quarterly_review.m4a",
        "duration": 3600.0,
        "created_at": "2026-10-29T10:00:00",
        "summary_json": json.dumps({
            "provider_name": "GROQ // QWEN/QWEN3.8-27B",
            "overview": "First paragraph outlining executive thesis and consensus.\n\nSecond paragraph detailing operational metrics and market landscape.\n\nThird paragraph outlining strategic trade-offs and decisions.\n\nFourth paragraph setting next operational milestones.",
            "feedback": [
                {"point": "Expand lettuce canopy space", "context": "Speaker 1 at 12:00"},
                {"point": "Secure local GAP certification", "context": "Speaker 2 at 18:30"},
            ],
            "ideas": [
                {"title": "Vertical Stacking", "description": "Install vertical towers with drip lines to boost yield per square meter."},
            ],
            "action_items": [
                {"task": f"Deliverable item number {i}", "owner": f"Team Lead {i % 3}", "timestamp": f"{i:02d}:00"}
                for i in range(1, 35)  # 34 action items: tests multi-page table splitting!
            ],
            "chapters": [
                {"title": f"Chapter Section {i}", "start_time": i * 120, "summary": f"Discussion summary for agenda item {i}."}
                for i in range(1, 25)  # 24 chapters: tests multi-page chapter table!
            ],
        }),
    }


@pytest.fixture
def sample_segments():
    return [
        {"start_time": 0.0, "end_time": 4.5, "speaker": "Speaker 1", "speaker_name": "CEO", "text": "Welcome everyone to the quarterly review."},
        {"start_time": 5.0, "end_time": 9.2, "speaker": "Speaker 2", "speaker_name": "CTO", "text": "We are presenting the Q3 engineering benchmarks."},
    ]


def test_export_formats(sample_recording, sample_segments):
    md = export_markdown(sample_recording, sample_segments)
    assert "# Quarterly Strategic Review" in md
    assert "CEO" in md

    srt = export_srt(sample_segments)
    assert "00:00:00,000 --> 00:00:04,500" in srt
    assert "[CEO]: Welcome everyone" in srt

    vtt = export_vtt(sample_segments)
    assert "WEBVTT" in vtt
    assert "<v CEO>Welcome everyone" in vtt

    txt = export_txt(sample_segments)
    assert "[00:00:00] CEO: Welcome everyone" in txt

    json_str = export_json(sample_recording, sample_segments)
    parsed = json.loads(json_str)
    assert parsed["metadata"]["id"] == "test-rec-123"
    assert len(parsed["segments"]) == 2


def test_export_pdf_large_table_splitting(sample_recording, sample_segments):
    # This specifically tests that 34 action items and 24 chapters do NOT crash
    # ReportLab with LayoutError now that KeepTogether is removed!
    pdf_bytes = export_pdf(sample_recording, sample_segments)
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 10000
