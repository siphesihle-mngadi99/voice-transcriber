import os
import json
import re
from pathlib import Path
from typing import Dict, Any, List, Optional
import requests

from voice_transcriber.config import DATA_DIR
from voice_transcriber.core.database import get_segments, save_recording_summary, get_recording

DEFAULT_GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
DEFAULT_GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
]

CONFIG_FILE = DATA_DIR / "llm_config.json"


def get_llm_config() -> Dict[str, Any]:
    """Loads persisted LLM provider configuration or falls back to embedded defaults."""
    config = {
        "provider": "groq",
        "groq_api_key": os.getenv("GROQ_API_KEY", DEFAULT_GROQ_API_KEY),
        "groq_model": os.getenv("GROQ_MODEL", DEFAULT_GROQ_MODEL),
        "gemini_api_key": os.getenv("GEMINI_API_KEY", ""),
        "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
        "ollama_host": os.getenv("OLLAMA_HOST", "http://localhost:11434"),
        "ollama_model": os.getenv("OLLAMA_MODEL", "llama3.2"),
    }
    if CONFIG_FILE.exists():
        try:
            stored = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            config.update(stored)
        except Exception:
            pass
    if not config.get("groq_api_key"):
        config["groq_api_key"] = DEFAULT_GROQ_API_KEY
    if not config.get("groq_model"):
        config["groq_model"] = DEFAULT_GROQ_MODEL
    return config


def save_llm_config(new_config: Dict[str, Any]) -> Dict[str, Any]:
    """Persists LLM provider configuration to disk."""
    current = get_llm_config()
    current.update(new_config)
    CONFIG_FILE.write_text(json.dumps(current, indent=2), encoding="utf-8")
    return current


def check_ollama_status(host: str = "http://localhost:11434") -> Dict[str, Any]:
    """Checks if a local Ollama instance is active and returns available models."""
    try:
        res = requests.get(f"{host.rstrip('/')}/api/tags", timeout=1.5)
        if res.status_code == 200:
            data = res.json()
            models = [m.get("name") for m in data.get("models", [])]
            return {"connected": True, "models": models}
    except Exception:
        pass
    return {"connected": False, "models": []}


def detect_llm_status() -> Dict[str, Any]:
    """Returns the current connection status of all available LLM providers."""
    cfg = get_llm_config()
    ollama_stat = check_ollama_status(cfg.get("ollama_host", "http://localhost:11434"))

    return {
        "active_provider": cfg.get("provider", "auto"),
        "groq_configured": bool(cfg.get("groq_api_key")),
        "gemini_configured": bool(cfg.get("gemini_api_key")),
        "ollama_connected": ollama_stat["connected"],
        "ollama_models": ollama_stat["models"],
    }


def format_transcript_for_llm(segments: List[Dict[str, Any]], max_chars: int = 18000) -> str:
    """Formats segments into a clean dialogue script with merged speaker turns and token budgeting."""
    if not segments:
        return ""

    merged = []
    current = None

    for s in segments:
        spk = s.get("speaker_name") or s.get("speaker") or "Speaker"
        text = (s.get("text") or "").strip()
        if not text:
            continue
        start_sec = int(s.get("start_time", 0))

        if current and current["speaker"] == spk:
            current["text"] += " " + text
        else:
            if current:
                merged.append(current)
            current = {"speaker": spk, "start": start_sec, "text": text}

    if current:
        merged.append(current)

    lines = []
    for m in merged:
        m_str = f"{m['start'] // 60:02d}"
        s_str = f"{m['start'] % 60:02d}"
        lines.append(f"[{m_str}:{s_str}] {m['speaker']}: {m['text']}")

    full = "\n\n".join(lines)

    # Safe token budget for free-tier limits (18,000 chars ~ 4,500 tokens)
    if len(full) > max_chars:
        half = max_chars // 2
        return full[:half] + "\n\n[... dialogue synthesized for summary budget ...]\n\n" + full[-half:]

    return full


SYSTEM_PROMPT = """You are an expert executive meeting assistant, lecture synthesizer, and note taker.
Your task is to analyze the provided conversation/lecture transcript and generate structured, highly actionable notes.

IMPORTANT RULES:
1. Do NOT use emojis anywhere in your response. Keep the tone professional, objective, and clear.
2. Output MUST strictly be valid JSON without conversational preamble or markdown backticks around the json.
3. Extract precise ideas, feedback, decisions, suggestions, and action items.

JSON SCHEMA:
{
  "overview": "Comprehensive 2-3 paragraph narrative summary of the meeting or lecture. Capture key context, core discussions, and overall conclusions.",
  "feedback": [
    {
      "point": "Concise summary of feedback, critique, consensus, or decision made",
      "context": "Context or speaker attribution explaining the feedback"
    }
  ],
  "ideas": [
    {
      "title": "Title of the idea or concept",
      "description": "Explanation of the creative proposal, brainstormed concept, or suggestion"
    }
  ],
  "action_items": [
    {
      "task": "Specific actionable next step",
      "owner": "Person or team responsible, or 'Unassigned'",
      "timestamp": "MM:SS timestamp where this was discussed"
    }
  ],
  "chapters": [
    {
      "title": "Chapter or agenda topic title",
      "start_time": 0,
      "summary": "1-2 sentence summary of this chapter"
    }
  ]
}
"""


def _extract_json(text: str) -> Dict[str, Any]:
    """Safely extracts JSON from model response even if surrounded by markdown fences."""
    cleaned = text.strip()
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
    if match:
        cleaned = match.group(1)
    else:
        # Fallback: find first { and last }
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1:
            cleaned = cleaned[start : end + 1]
    return json.loads(cleaned)


def call_groq(api_key: str, transcript: str, model: Optional[str] = None) -> Dict[str, Any]:
    """Generates notes via Groq cloud API with automatic model fallback."""
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json",
    }

    candidates = []
    if model:
        candidates.append(model)
    for m in GROQ_MODELS:
        if m not in candidates:
            candidates.append(m)

    last_error = None
    for cand in candidates:
        payload = {
            "model": cand,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Here is the transcript:\n\n{transcript}\n\nGenerate the structured notes JSON now."},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        try:
            res = requests.post(url, json=payload, headers=headers, timeout=60)
            if res.status_code in (400, 404):
                last_error = f"Model {cand} unavailable ({res.status_code}): {res.text}"
                continue
            if not res.ok:
                raise ValueError(f"Groq API error ({res.status_code}): {res.text}")
            data = res.json()
            content = data["choices"][0]["message"]["content"]
            result = _extract_json(content)
            result["used_model"] = cand
            return result
        except Exception as e:
            last_error = str(e)
            if "not exist" in str(e).lower() or "404" in str(e) or "400" in str(e):
                continue
            raise

    raise ValueError(f"All Groq models failed. Last error: {last_error}")


def call_gemini(api_key: str, transcript: str, model: str = "gemini-1.5-flash") -> Dict[str, Any]:
    """Generates notes via Google Gemini API."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key.strip()}"
    headers = {"Content-Type": "application/json"}
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [
            {"parts": [{"text": f"Here is the transcript:\n\n{transcript}\n\nGenerate the structured notes JSON now."}]}
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }
    res = requests.post(url, json=payload, headers=headers, timeout=60)
    if not res.ok:
        raise ValueError(f"Gemini API error ({res.status_code}): {res.text}")
    data = res.json()
    content = data["candidates"][0]["content"]["parts"][0]["text"]
    return _extract_json(content)


def call_ollama(host: str, model: str, transcript: str) -> Dict[str, Any]:
    """Generates notes via local Ollama instance."""
    url = f"{host.rstrip('/')}/api/chat"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Here is the transcript:\n\n{transcript}\n\nGenerate the structured notes JSON now."},
        ],
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.2},
    }
    res = requests.post(url, json=payload, timeout=120)
    if not res.ok:
        raise ValueError(f"Ollama error ({res.status_code}): {res.text}")
    data = res.json()
    content = data["message"]["content"]
    return _extract_json(content)


def summarize_recording(
    rec_id: str,
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Executes the summarization pipeline for a recording and persists result to SQLite."""
    segments = get_segments(rec_id)
    if not segments:
        raise ValueError("No transcript segments found for this recording.")

    transcript_text = format_transcript_for_llm(segments)
    cfg = get_llm_config()

    chosen_provider = provider or cfg.get("provider", "auto")

    # Auto-resolve provider
    if chosen_provider == "auto":
        if api_key:
            # Detect key type
            if api_key.startswith("gsk_"):
                chosen_provider = "groq"
            elif api_key.startswith("AIza"):
                chosen_provider = "gemini"
            else:
                chosen_provider = "groq"
        elif cfg.get("groq_api_key"):
            chosen_provider = "groq"
        elif cfg.get("gemini_api_key"):
            chosen_provider = "gemini"
        elif check_ollama_status(cfg.get("ollama_host"))["connected"]:
            chosen_provider = "ollama"
        else:
            return {
                "status": "needs_config",
                "message": "No LLM provider configured. Please provide a free Groq or Gemini API key, or launch local Ollama.",
            }

    # Execute request with chosen provider
    notes = None
    if chosen_provider == "groq":
        key = api_key or cfg.get("groq_api_key") or DEFAULT_GROQ_API_KEY
        if not key:
            raise ValueError("Groq API key not provided.")
        model = cfg.get("groq_model", DEFAULT_GROQ_MODEL)
        notes = call_groq(key, transcript_text, model=model)
        used = notes.get("used_model", model)
        notes["provider_name"] = f"GROQ // {used.upper()}"

    elif chosen_provider == "gemini":
        key = api_key or cfg.get("gemini_api_key")
        if not key:
            raise ValueError("Gemini API key not provided.")
        notes = call_gemini(key, transcript_text)
        notes["provider_name"] = "GEMINI // 1.5 FLASH"

    elif chosen_provider == "ollama":
        host = cfg.get("ollama_host", "http://localhost:11434")
        model = cfg.get("ollama_model", "llama3.2")
        notes = call_ollama(host, model, transcript_text)
        notes["provider_name"] = f"OLLAMA // {model.upper()}"

    else:
        raise ValueError(f"Unsupported provider: {chosen_provider}")

    notes["status"] = "success"
    # Persist in SQLite
    save_recording_summary(rec_id, json.dumps(notes))
    return notes
