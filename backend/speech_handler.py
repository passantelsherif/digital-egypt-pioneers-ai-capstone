"""
speech_handler.py
─────────────────
Handles speech-to-text logic for Sawa using st.audio_input (Streamlit built-in)
and Faster-Whisper for fully offline, free transcription.

st.audio_input records directly from the browser — no sounddevice, no mic
permission issues, no fixed duration. The user presses Start, speaks, presses
Stop, and the audio bytes come back to Python.

app.py only needs:
    from speech_handler import transcribe_audio, text_to_tokens

Dependencies:
    pip install faster-whisper soundfile numpy
    (SpeechRecognition / sounddevice are no longer needed)

Notes
-----
- faster-whisper runs 100% locally (CPU or GPU) — no API key, no internet
  required after the model weights are downloaded once.
- The model is loaded once at import time and reused across calls (loading
  it per-request would be very slow).
- "tiny" / "base" / "small" / "medium" / "large-v3" are the available model
  sizes — bigger = more accurate but slower. "small" is a good default
  balance for Arabic + English on CPU.
"""

import io
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

# ── Load the model once (stateless, reusable across calls) ───────────────────
# compute_type="int8" keeps it fast and light on CPU. Switch to "float16"
# if you're running on a CUDA GPU for extra speed.
_model = WhisperModel("small", device="cpu", compute_type="int8")

# Map our friendly language names to Whisper's 2-letter ISO codes.
# (Whisper auto-detects dialect, e.g. ar-EG vs ar-SA are both just "ar".)
SUPPORTED_LANGUAGES = {
    "English (US)":     "en",
    "Arabic (Egypt)":   "ar",
    "Arabic (SA)":       "ar",
    "French":            "fr",
    "German":            "de",
}


def transcribe_audio(audio_bytes: bytes, language: str = "en") -> str:
    """
    Transcribe WAV/WebM bytes (from st.audio_input) using local Whisper.

    Parameters
    ----------
    audio_bytes : bytes
        Raw audio bytes returned by  st.audio_input(...).read()
    language : str
        2-letter ISO code e.g. "en" or "ar" (see SUPPORTED_LANGUAGES values)

    Returns
    -------
    str
        Recognised text (lowercased, stripped) on success.
        A string starting with "⚠️" on any error.
    """
    try:
        # soundfile can read WAV/WebM/OGG straight out of the BytesIO buffer
        audio_array, sample_rate = sf.read(io.BytesIO(audio_bytes), dtype="float32")

        # If stereo, collapse to mono (Whisper expects a single channel)
        if audio_array.ndim > 1:
            audio_array = audio_array.mean(axis=1)

        segments, _info = _model.transcribe(
            audio_array,
            language=language,
            vad_filter=True,  # trims leading/trailing silence automatically
        )

        text = "".join(segment.text for segment in segments)

        if not text.strip():
            return "⚠️ Could not understand — try speaking more clearly."

        return text.strip().lower()

    except Exception as exc:
        return f"⚠️ Unexpected error: {exc}"


def text_to_tokens(text: str) -> list:
    """
    Convert transcript to the token list SignVisualizer expects:
        letters → single uppercase char e.g. "H"
        spaces  → "SPACE"

    Example:
        "hello world" → ["H","E","L","L","O","SPACE","W","O","R","L","D"]
    """
    tokens = []
    for ch in text.upper():
        if ch == " ":
            tokens.append("SPACE")
        elif ch.isalpha():
            tokens.append(ch)
    return tokens
