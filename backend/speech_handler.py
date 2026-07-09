"""
speech_handler.py
Handles speech-to-text logic for Sawa using Faster-Whisper.
"""

import io
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

# load model
_model = WhisperModel("small", device="cpu", compute_type="int8")

# language code mapping
SUPPORTED_LANGUAGES = {
    "English (US)":     "en",
    "Arabic (Egypt)":   "ar",
    "Arabic (SA)":       "ar",
    "French":            "fr",
    "German":            "de",
}


def transcribe_audio(audio_bytes: bytes, language: str = "en") -> str:
    """Transcribes audio bytes using local Whisper."""
    try:
        # read audio
        audio_array, sample_rate = sf.read(io.BytesIO(audio_bytes), dtype="float32")

        # convert to mono
        if audio_array.ndim > 1:
            audio_array = audio_array.mean(axis=1)

        segments, _info = _model.transcribe(
            audio_array,
            language=language,
            vad_filter=True,  # trim silence
        )

        text = "".join(segment.text for segment in segments)

        if not text.strip():
            return "⚠️ Could not understand — try speaking more clearly."

        return text.strip().lower()

    except Exception as exc:
        return f"⚠️ Unexpected error: {exc}"


def text_to_tokens(text: str) -> list:
    """Converts transcript to tokens."""
    tokens = []
    for ch in text.upper():
        if ch == " ":
            tokens.append("SPACE")
        elif ch.isalpha():
            tokens.append(ch)
    return tokens
