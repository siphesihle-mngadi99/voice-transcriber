import json
from pathlib import Path
from typing import List, Dict, Any
from voice_transcriber.config import EXPORT_DIR


def format_timestamp_hms(seconds: float) -> str:
    """Formats seconds into HH:MM:SS format."""
    total_sec = int(seconds)
    hours = total_sec // 3600
    minutes = (total_sec % 3600) // 60
    secs = total_sec % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def format_timestamp_srt(seconds: float) -> str:
    """Formats seconds into SRT format: HH:MM:SS,mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def format_timestamp_vtt(seconds: float) -> str:
    """Formats seconds into WebVTT format: HH:MM:SS.mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def export_markdown(recording: Dict[str, Any], segments: List[Dict[str, Any]]) -> str:
    """Generates structured Markdown with executive meeting notes and dialogue."""
    title = recording.get("title") or recording.get("filename", "Audio Recording")
    duration = format_timestamp_hms(recording.get("duration", 0.0))
    created_at = str(recording.get("created_at", ""))[:10]

    lines = [
        f"# {title}",
        "",
        f"- **Date:** {created_at}",
        f"- **Duration:** {duration}",
        f"- **File:** `{recording.get('filename')}`",
        f"- **Total Segments:** {len(segments)}",
        "",
        "---",
        "",
    ]

    # Prepend Executive Brief if available
    summary_raw = recording.get("summary_json")
    if summary_raw:
        try:
            brief = json.loads(summary_raw)
            if brief.get("overview"):
                lines.extend(["## Executive Overview", "", brief["overview"], "", "---", ""])

            if brief.get("takeaways") or brief.get("feedback"):
                items = brief.get("feedback") or brief.get("takeaways") or []
                lines.extend(["## Key Takeaways & Feedback", ""])
                for item in items:
                    point = item.get("point") if isinstance(item, dict) else str(item)
                    ctx = f" ({item.get('context')})" if isinstance(item, dict) and item.get("context") else ""
                    lines.append(f"- **{point}**{ctx}")
                lines.extend(["", "---", ""])

            if brief.get("ideas"):
                lines.extend(["## Ideas & Brainstormed Concepts", ""])
                for idea in brief["ideas"]:
                    t = idea.get("title", "Idea") if isinstance(idea, dict) else "Idea"
                    d = idea.get("description", str(idea)) if isinstance(idea, dict) else str(idea)
                    lines.append(f"### {t}\n{d}\n")
                lines.extend(["---", ""])

            if brief.get("action_items"):
                lines.extend(["## Action Items & Next Steps", ""])
                for act in brief["action_items"]:
                    task = act.get("task", "") if isinstance(act, dict) else str(act)
                    owner = act.get("owner", "Unassigned") if isinstance(act, dict) else "Unassigned"
                    ts = f" `[{act.get('timestamp')}]`" if isinstance(act, dict) and act.get("timestamp") else ""
                    lines.append(f"- [ ] **{task}** — *{owner}*{ts}")
                lines.extend(["", "---", ""])

            if brief.get("chapters"):
                lines.extend(["## Discussion Chapters", ""])
                for ch in brief["chapters"]:
                    ch_title = ch.get("title", "")
                    ch_sec = ch.get("start_time", 0)
                    ch_sum = ch.get("summary", "")
                    lines.append(f"- `[{format_timestamp_hms(ch_sec)}]` **{ch_title}**: {ch_sum}")
                lines.extend(["", "---", ""])
        except Exception:
            pass

    lines.extend(["## Verbatim Transcript", ""])

    current_speaker = None
    for seg in segments:
        speaker = seg.get("speaker_name") or seg.get("speaker", "Speaker 1")
        timestamp = format_timestamp_hms(seg.get("start_time", 0.0))
        text = seg.get("text", "").strip()

        if speaker != current_speaker:
            lines.append(f"### **{speaker}** `[{timestamp}]`")
            current_speaker = speaker

        lines.append(f"> {text}\n")

    return "\n".join(lines)


def export_srt(segments: List[Dict[str, Any]]) -> str:
    """Generates standard SubRip (.srt) subtitle content."""
    lines = []
    for idx, seg in enumerate(segments, start=1):
        start = format_timestamp_srt(seg.get("start_time", 0.0))
        end = format_timestamp_srt(seg.get("end_time", 0.0))
        speaker = seg.get("speaker_name") or seg.get("speaker", "Speaker 1")
        text = seg.get("text", "").strip()

        lines.append(str(idx))
        lines.append(f"{start} --> {end}")
        lines.append(f"[{speaker}]: {text}")
        lines.append("")

    return "\n".join(lines)


def export_vtt(segments: List[Dict[str, Any]]) -> str:
    """Generates WebVTT (.vtt) subtitle content."""
    lines = ["WEBVTT", ""]
    for idx, seg in enumerate(segments, start=1):
        start = format_timestamp_vtt(seg.get("start_time", 0.0))
        end = format_timestamp_vtt(seg.get("end_time", 0.0))
        speaker = seg.get("speaker_name") or seg.get("speaker", "Speaker 1")
        text = seg.get("text", "").strip()

        lines.append(f"{start} --> {end}")
        lines.append(f"<v {speaker}>{text}")
        lines.append("")

    return "\n".join(lines)


def export_txt(segments: List[Dict[str, Any]]) -> str:
    """Generates plain text with timestamps and speaker tags."""
    lines = []
    for seg in segments:
        start = format_timestamp_hms(seg.get("start_time", 0.0))
        speaker = seg.get("speaker_name") or seg.get("speaker", "Speaker 1")
        text = seg.get("text", "").strip()
        lines.append(f"[{start}] {speaker}: {text}")

    return "\n".join(lines)


def export_json(recording: Dict[str, Any], segments: List[Dict[str, Any]]) -> str:
    """Generates structured JSON dump with all timestamps and metadata."""
    payload = {
        "metadata": recording,
        "segments": segments,
    }
    return json.dumps(payload, indent=2)
