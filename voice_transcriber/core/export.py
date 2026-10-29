import io
import json
import html
from pathlib import Path
from typing import List, Dict, Any, Optional

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    PageBreak,
    HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

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


def _clean_unicode_punct(text: str) -> str:
    """Normalizes typography (curly quotes, em-dashes, non-breaking hyphens) to standard ASCII/latin-1."""
    if not text:
        return ""
    replacements = {
        "\u2011": "-",   # non-breaking hyphen
        "\u2012": "-",   # figure dash
        "\u2013": "-",   # en dash
        "\u2014": "--",  # em dash
        "\u2015": "--",  # horizontal bar
        "\u2018": "'",   # left single quote
        "\u2019": "'",   # right single quote
        "\u201a": "'",   # single low-9 quotation mark
        "\u201b": "'",   # single high-reversed-9 quotation mark
        "\u201c": '"',   # left double quote
        "\u201d": '"',   # right double quote
        "\u201e": '"',   # double low-9 quotation mark
        "\u201f": '"',   # double high-reversed-9 quotation mark
        "\u2026": "...", # horizontal ellipsis
        "\u00a0": " ",   # non-breaking space
    }
    for orig, rep in replacements.items():
        text = text.replace(orig, rep)
    return text


def _esc(val: Any) -> str:
    """Escapes XML entities and cleans typography so ReportLab Paragraph never encounters XML parsing errors."""
    if val is None:
        return ""
    cleaned = _clean_unicode_punct(str(val))
    return html.escape(cleaned)


class NumberedCanvas(canvas.Canvas):
    """Two-pass ReportLab canvas that dynamically renders 'Page X of Y' and running headers."""

    def __init__(self, *args, **kwargs):
        self.doc_title = kwargs.pop("doc_title", "VOICESCRIBE INTELLIGENCE DOSSIER")
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(colors.HexColor("#191717"))

        # Running header on page 2+
        if self._pageNumber > 1:
            self.setStrokeColor(colors.HexColor("#DED6C1"))
            self.setLineWidth(0.75)
            self.line(40, 755, 572, 755)
            safe_title = str(self.doc_title).encode("latin-1", "replace").decode("latin-1")
            self.drawString(40, 760, safe_title[:50].upper())
            self.drawRightString(572, 760, "VOICESCRIBE // EXECUTIVE INTELLIGENCE DOSSIER")

        # Running footer on all pages
        self.setStrokeColor(colors.HexColor("#DED6C1"))
        self.setLineWidth(0.75)
        self.line(40, 42, 572, 42)

        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor("#666666"))
        self.drawString(40, 30, "CONFIDENTIAL // FOR INTERNAL STRATEGIC USE ONLY")

        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#191717"))
        self.drawRightString(572, 30, f"PAGE {self._pageNumber} OF {page_count}")

        self.restoreState()


def export_pdf(
    recording: Dict[str, Any],
    segments: List[Dict[str, Any]],
    output_path: Optional[Path] = None,
) -> bytes:
    """Generates a high-contrast executive PDF dossier adhering to the AYA design system."""
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=48,
        bottomMargin=50,
    )

    doc_title = recording.get("title") or recording.get("filename") or "Executive Audio Session"

    # Color Palette: AYA Design System
    PRIMARY_RED = colors.HexColor("#FF2F11")
    DEEP_INK = colors.HexColor("#191717")
    WARM_SAND = colors.HexColor("#DED6C1")
    WARM_LINEN = colors.HexColor("#FAF6ED")
    MUTED_GRAY = colors.HexColor("#555555")

    base_styles = getSampleStyleSheet()

    # Custom Typography Styles
    style_super_header = ParagraphStyle(
        "SuperHeader",
        parent=base_styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=PRIMARY_RED,
        textTransform="uppercase",
        spaceAfter=4,
    )

    style_title = ParagraphStyle(
        "DocTitle",
        parent=base_styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=DEEP_INK,
        alignment=0,
        spaceAfter=8,
    )

    style_meta_label = ParagraphStyle(
        "MetaLabel",
        fontName="Helvetica-Bold",
        fontSize=7,
        leading=9,
        textColor=MUTED_GRAY,
        textTransform="uppercase",
    )

    style_meta_val = ParagraphStyle(
        "MetaValue",
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=DEEP_INK,
    )

    style_section_h = ParagraphStyle(
        "SectionHeading",
        parent=base_styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=DEEP_INK,
        textTransform="uppercase",
        spaceBefore=14,
        spaceAfter=8,
    )

    style_consensus_h = ParagraphStyle(
        "ConsensusHeading",
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=PRIMARY_RED,
        textTransform="uppercase",
        spaceAfter=4,
    )

    style_consensus_lead = ParagraphStyle(
        "ConsensusLead",
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=14.5,
        textColor=DEEP_INK,
    )

    style_narrative_p = ParagraphStyle(
        "NarrativeP",
        fontName="Helvetica",
        fontSize=9,
        leading=13.5,
        textColor=DEEP_INK,
        spaceAfter=8,
    )

    style_card_title = ParagraphStyle(
        "CardTitle",
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=12,
        textColor=DEEP_INK,
        spaceAfter=3,
    )

    style_card_body = ParagraphStyle(
        "CardBody",
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#2C2C2C"),
    )

    style_takeaway_num = ParagraphStyle(
        "TakeawayNum",
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        textColor=PRIMARY_RED,
        alignment=1,
    )

    style_takeaway_point = ParagraphStyle(
        "TakeawayPoint",
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12.5,
        textColor=DEEP_INK,
    )

    style_takeaway_context = ParagraphStyle(
        "TakeawayContext",
        fontName="Helvetica-Oblique",
        fontSize=8,
        leading=11,
        textColor=MUTED_GRAY,
    )

    style_th = ParagraphStyle(
        "TableHead",
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.white,
        textTransform="uppercase",
    )

    style_td = ParagraphStyle(
        "TableBody",
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=DEEP_INK,
    )

    style_td_bold = ParagraphStyle(
        "TableBodyBold",
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=11,
        textColor=DEEP_INK,
    )

    style_td_badge = ParagraphStyle(
        "TableBadge",
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=PRIMARY_RED,
        alignment=1,
    )

    style_transcript_speaker = ParagraphStyle(
        "TranscriptSpeaker",
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=PRIMARY_RED,
        spaceBefore=6,
        spaceAfter=2,
    )

    style_transcript_text = ParagraphStyle(
        "TranscriptText",
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=DEEP_INK,
        leftIndent=12,
        spaceAfter=4,
    )

    story = []

    # 1. Top Brand Banner Accent Line
    story.append(HRFlowable(width="100%", thickness=3.5, color=PRIMARY_RED, spaceAfter=8))

    # 2. Document Super-Header & Main Title
    story.append(Paragraph("VOICESCRIBE // EXECUTIVE INTELLIGENCE DOSSIER", style_super_header))
    story.append(Paragraph(_esc(doc_title), style_title))

    # 3. Metadata Grid (4-Cell Boardroom Dashboard)
    created_at = str(recording.get("created_at", ""))[:10] or "N/A"
    duration_str = format_timestamp_hms(recording.get("duration", 0.0))

    unique_speakers = sorted(list(set(
        (s.get("speaker_name") or s.get("speaker") or "Speaker") for s in segments
    )))
    speakers_summary = f"{len(unique_speakers)} Speakers" if unique_speakers else "1 Speaker"

    # AI engine info
    summary_raw = recording.get("summary_json")
    brief = None
    provider_name = "LLM SYNTHESIS"
    if summary_raw:
        try:
            brief = json.loads(summary_raw)
            if brief.get("provider_name"):
                provider_name = brief["provider_name"]
            elif brief.get("used_model"):
                provider_name = f"GROQ // {brief['used_model'].upper()}"
        except Exception:
            pass

    meta_cells = [
        [
            Paragraph("SESSION DATE", style_meta_label),
            Paragraph("AUDIO DURATION", style_meta_label),
            Paragraph("PARTICIPANTS", style_meta_label),
            Paragraph("INTELLIGENCE ENGINE", style_meta_label),
        ],
        [
            Paragraph(_esc(created_at), style_meta_val),
            Paragraph(_esc(duration_str), style_meta_val),
            Paragraph(_esc(speakers_summary), style_meta_val),
            Paragraph(_esc(provider_name), style_meta_val),
        ]
    ]

    meta_table = Table(meta_cells, colWidths=[110, 110, 130, 182])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WARM_LINEN),
        ("BOX", (0, 0), (-1, -1), 1.5, DEEP_INK),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, WARM_SAND),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 12))

    has_summary_content = False

    # --- SECTION 1: EXECUTIVE OVERVIEW & STRATEGIC CONSENSUS ---
    if brief and brief.get("overview"):
        has_summary_content = True
        story.append(Paragraph("01 // EXECUTIVE OVERVIEW & STRATEGIC SYNTHESIS", style_section_h))
        
        raw_overview = brief["overview"].strip()
        paragraphs = [p.strip() for p in raw_overview.split("\n\n") if p.strip()]

        lead_para = paragraphs[0] if paragraphs else raw_overview
        body_paras = paragraphs[1:] if len(paragraphs) > 1 else []

        # Callout Box for Primary Consensus
        lead_content = [
            Paragraph("PRIMARY STRATEGIC CONSENSUS & THESIS", style_consensus_h),
            Paragraph(_esc(lead_para), style_consensus_lead),
        ]
        lead_table = Table([[lead_content]], colWidths=[532])
        lead_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), WARM_LINEN),
            ("BOX", (0, 0), (-1, -1), 1, WARM_SAND),
            ("LINEBEFORE", (0, 0), (0, -1), 4, PRIMARY_RED),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ]))
        story.append(lead_table)
        story.append(Spacer(1, 8))

        # Deep Detailed Narrative Paragraphs
        for p in body_paras:
            story.append(Paragraph(_esc(p), style_narrative_p))
        
        story.append(Spacer(1, 10))

    # --- SECTION 2: KEY TAKEAWAYS & STAKEHOLDER FEEDBACK ---
    feedback_items = []
    if brief:
        feedback_items = brief.get("feedback") or brief.get("takeaways") or []

    if feedback_items:
        has_summary_content = True
        story.append(Paragraph("02 // KEY TAKEAWAYS & STAKEHOLDER FEEDBACK", style_section_h))
        
        takeaway_rows = []
        for idx, item in enumerate(feedback_items, start=1):
            point = item.get("point") if isinstance(item, dict) else str(item)
            ctx = item.get("context") if isinstance(item, dict) else ""
            
            content_cell = [Paragraph(_esc(point), style_takeaway_point)]
            if ctx:
                content_cell.append(Spacer(1, 2))
                content_cell.append(Paragraph(f"Context / Attribution: {_esc(ctx)}", style_takeaway_context))

            takeaway_rows.append([
                Paragraph(f"{idx:02d}", style_takeaway_num),
                content_cell,
            ])

        takeaway_table = Table(takeaway_rows, colWidths=[32, 500])
        t_style = [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 1.5, DEEP_INK),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, WARM_SAND),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]
        for i in range(len(takeaway_rows)):
            bg = WARM_LINEN if i % 2 == 0 else colors.white
            t_style.append(("BACKGROUND", (0, i), (-1, i), bg))

        takeaway_table.setStyle(TableStyle(t_style))
        story.append(takeaway_table)
        story.append(Spacer(1, 12))

    # --- SECTION 3: STRATEGIC PROPOSALS & BRAINSTORMING VAULT ---
    ideas = brief.get("ideas") if brief else []
    if ideas:
        has_summary_content = True
        story.append(Paragraph("03 // STRATEGIC PROPOSALS & BRAINSTORMING VAULT", style_section_h))
        
        for idea in ideas:
            t = idea.get("title", "Strategic Concept") if isinstance(idea, dict) else "Concept"
            d = idea.get("description", str(idea)) if isinstance(idea, dict) else str(idea)

            card_content = [
                Paragraph(_esc(t), style_card_title),
                Spacer(1, 2),
                Paragraph(_esc(d), style_card_body),
            ]
            card_table = Table([[card_content]], colWidths=[532])
            card_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 1.5, DEEP_INK),
                ("LINEBEFORE", (0, 0), (0, -1), 3.5, DEEP_INK),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ]))
            story.append(KeepTogether(card_table))
            story.append(Spacer(1, 6))

        story.append(Spacer(1, 6))

    # --- SECTION 4: ACTION ITEMS & EXECUTION ROADMAP ---
    action_items = brief.get("action_items") if brief else []
    if action_items:
        has_summary_content = True
        story.append(Paragraph("04 // ACTION ITEMS & EXECUTION ROADMAP", style_section_h))
        
        act_rows = [[
            Paragraph("ST", style_th),
            Paragraph("ACTIONABLE DELIVERABLE / TASK", style_th),
            Paragraph("OWNER / TEAM", style_th),
            Paragraph("TIMELINESS", style_th),
        ]]

        for act in action_items:
            task = act.get("task", "") if isinstance(act, dict) else str(act)
            owner = act.get("owner", "Unassigned") if isinstance(act, dict) else "Unassigned"
            ts = act.get("timestamp", "—") if isinstance(act, dict) and act.get("timestamp") else "—"

            act_rows.append([
                Paragraph("[ ]", style_td_badge),
                Paragraph(_esc(task), style_td_bold),
                Paragraph(_esc(owner), style_td),
                Paragraph(_esc(ts), style_td),
            ])

        act_table = Table(act_rows, colWidths=[24, 338, 100, 70], repeatRows=1)
        act_style = [
            ("BACKGROUND", (0, 0), (-1, 0), DEEP_INK),
            ("BOX", (0, 0), (-1, -1), 1.5, DEEP_INK),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, WARM_SAND),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]
        for i in range(1, len(act_rows)):
            bg = WARM_LINEN if i % 2 == 1 else colors.white
            act_style.append(("BACKGROUND", (0, i), (-1, i), bg))

        act_table.setStyle(TableStyle(act_style))
        story.append(act_table)
        story.append(Spacer(1, 12))

    # --- SECTION 5: AGENDA CHAPTERS & TIMELINE ---
    chapters = brief.get("chapters") if brief else []
    if chapters:
        has_summary_content = True
        story.append(Paragraph("05 // AGENDA CHAPTERS & TIMELINE", style_section_h))
        
        chap_rows = [[
            Paragraph("START", style_th),
            Paragraph("CHAPTER TITLE & SUMMARY", style_th),
        ]]

        for ch in chapters:
            ch_sec = ch.get("start_time", 0)
            ch_title = ch.get("title", "Chapter")
            ch_sum = ch.get("summary", "")
            
            m = int(ch_sec // 60)
            s = int(ch_sec % 60)
            time_badge = f"{m:02d}:{s:02d}"

            content_cell = [
                Paragraph(_esc(ch_title), style_td_bold),
                Spacer(1, 2),
                Paragraph(_esc(ch_sum), style_td),
            ]

            chap_rows.append([
                Paragraph(time_badge, style_td_badge),
                content_cell,
            ])

        chap_table = Table(chap_rows, colWidths=[65, 467], repeatRows=1)
        chap_style = [
            ("BACKGROUND", (0, 0), (-1, 0), DEEP_INK),
            ("BOX", (0, 0), (-1, -1), 1.5, DEEP_INK),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, WARM_SAND),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]
        for i in range(1, len(chap_rows)):
            bg = WARM_LINEN if i % 2 == 1 else colors.white
            chap_style.append(("BACKGROUND", (0, i), (-1, i), bg))

        chap_table.setStyle(TableStyle(chap_style))
        story.append(chap_table)
        story.append(Spacer(1, 12))

    # --- SECTION 6: VERBATIM DIALOGUE TRANSCRIPT (APPENDIX) ---
    if segments:
        if has_summary_content:
            story.append(PageBreak())
        
        section_prefix = "06 // " if has_summary_content else "01 // "
        story.append(Paragraph(f"{section_prefix}VERBATIM DIALOGUE TRANSCRIPT (APPENDIX)", style_section_h))
        story.append(HRFlowable(width="100%", thickness=1, color=WARM_SAND, spaceAfter=8))

        current_speaker = None
        for seg in segments:
            speaker = seg.get("speaker_name") or seg.get("speaker", "Speaker")
            start_sec = int(seg.get("start_time", 0.0))
            m = start_sec // 60
            s = start_sec % 60
            ts_str = f"[{m:02d}:{s:02d}]"
            text = (seg.get("text") or "").strip()

            if speaker != current_speaker:
                story.append(Paragraph(f"{_esc(speaker.upper())} <font color='#666666' size='7'>{ts_str}</font>", style_transcript_speaker))
                current_speaker = speaker

            story.append(Paragraph(_esc(text), style_transcript_text))

    # Build the document
    doc.build(
        story,
        canvasmaker=lambda *args, **kwargs: NumberedCanvas(*args, doc_title=doc_title, **kwargs),
    )

    pdf_bytes = buffer.getvalue()
    if output_path:
        Path(output_path).write_bytes(pdf_bytes)

    return pdf_bytes


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
