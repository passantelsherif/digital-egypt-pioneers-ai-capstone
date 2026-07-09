"""
Sawa backend — FastAPI + WebSocket
Run with: uvicorn main:app --reload --port 8000
"""
from faster_whisper import WhisperModel
import soundfile as sf
import io
from fastapi import UploadFile, File, Form
import asyncio
import base64
import json
import os

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from hand_utils import HandTracker
from predictor import SignPredictor

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load models once at startup ───────────────────────────────────────────────
tracker = HandTracker()
en_predictor = SignPredictor(model_path="sawa_asl_model.keras",
                             labels_path="sawa_label_classes.json")
try:
    ar_predictor = SignPredictor(model_path="sawa_arsl_model.keras",
                                 labels_path="sawa_arsl_label_classes.json")
    print("✅ Arabic model loaded")
except Exception as e:
    print(f"⚠️  Arabic model not found, falling back to English: {e}")
    ar_predictor = en_predictor

# ── Reference landmarks for Text-to-Sign ─────────────────────────────────────


def load_reference_landmarks(npy_path, labels_path):
    if not os.path.exists(npy_path) or not os.path.exists(labels_path):
        return {}
    X = np.load(npy_path)
    y = np.load(labels_path, allow_pickle=True).tolist()
    labels_arr = np.array(y)
    ref = {}
    for label in set(y):
        mask = labels_arr == label
        median_vec = np.median(X[mask], axis=0)
        ref[label] = median_vec[:63].tolist()
    return ref


EN_LANDMARKS = load_reference_landmarks(
    "asl_alphabet_features.npy",  "asl_alphabet_labels.npy")
AR_LANDMARKS = load_reference_landmarks(
    "arsl_alphabet_features.npy", "arsl_alphabet_labels.npy")
print(f"✅ EN landmark refs: {len(EN_LANDMARKS)} letters")
print(f"✅ AR landmark refs: {len(AR_LANDMARKS)} letters")

# Maps Arabic Unicode characters → ARSL model label strings
AR_CHAR_TO_LABEL = {
    'ع': 'ain',
    'ال': 'al',
    'أ': 'aleff',
    'ا': 'aleff',   # plain alef also maps to aleff
    'ب': 'bb',
    'د': 'dal',
    'ظ': 'dha',
    'ض': 'dhad',
    'ف': 'fa',
    'ق': 'gaaf',
    'غ': 'ghain',
    'ه': 'ha',
    'ح': 'haa',
    'ج': 'jeem',
    'ك': 'kaaf',
    'خ': 'khaa',
    'لا': 'la',
    'ل': 'laam',
    'م': 'meem',
    'ن': 'nun',
    'ر': 'ra',
    'ص': 'saad',
    'س': 'seen',
    'ش': 'sheen',
    'ط': 'ta',
    'ت': 'taa',
    'ث': 'thaa',
    'ذ': 'thal',
    'ة': 'toot',
    'و': 'waw',
    'ى': 'ya',
    'ي': 'yaa',
    'ز': 'zay',
}


# ── REST: Text-to-Sign ────────────────────────────────────────────────────────
@app.get("/landmarks/{lang}/{letter}")
def get_landmarks_ref(lang: str, letter: str):
    db = EN_LANDMARKS if lang == "en" else AR_LANDMARKS
    # For Arabic, resolve the character to the model's label key
    if lang == "ar":
        label = AR_CHAR_TO_LABEL.get(letter) or AR_CHAR_TO_LABEL.get(letter.upper())
        key = label if label else letter
    else:
        key = letter.upper()
    vec = db.get(key) or db.get(key.lower())
    if vec is None:
        return {"found": False, "landmarks": []}
    return {"found": True, "landmarks": vec}


@app.get("/letters/{lang}")
def get_letters(lang: str):
    db = EN_LANDMARKS if lang == "en" else AR_LANDMARKS
    return {"letters": sorted(db.keys())}


# ── WebSocket: Sign-to-Text ───────────────────────────────────────────────────
@app.websocket("/ws/sign-to-text")
async def sign_to_text_ws(websocket: WebSocket):
    """
    Client -> { lang, frame: <base64 jpeg> }
    Server -> { letter, conf }
    """
    await websocket.accept()
    loop = asyncio.get_event_loop()

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            lang = msg.get("lang", "en")
            predictor = en_predictor if lang == "en" else ar_predictor

            try:
                img_data = base64.b64decode(msg["frame"])
                img_array = np.frombuffer(img_data, dtype=np.uint8)
                frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            except Exception as e:
                print(f"⚠️ Exception decoding frame: {e}")
                frame = None

            if frame is None:
                print(
                    f"⚠️ frame is None! msg['frame'] length: {len(msg.get('frame', ''))}")
                await websocket.send_text(
                    json.dumps(
                        {"letter": None, "conf": 0.0, "annotated_frame": ""})
                )
                continue

            def process():
                landmarks = tracker.get_landmarks(frame)
                has_hand = bool(np.any(landmarks))

                if has_hand:
                    letter, conf = predictor.predict(landmarks)
                else:
                    letter, conf = None, 0.0

                return letter, float(conf)

            letter, conf = await loop.run_in_executor(None, process)

            await websocket.send_text(json.dumps({
                "letter": letter,
                "conf":   conf,
            }))

    except WebSocketDisconnect:
        pass
# Add this to your main.py in the backend folder
# Copy these imports and the endpoint into main.py


# Load whisper model once
_whisper = WhisperModel("small", device="cpu", compute_type="int8")


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str = Form("en")):
    try:
        audio_bytes = await audio.read()

        # Save to a temp file and let whisper handle the format
        import tempfile
        import os
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        segments, _ = _whisper.transcribe(
            tmp_path, language=language, vad_filter=True)
        text = "".join(s.text for s in segments).strip().lower()
        os.unlink(tmp_path)

        if not text:
            return {"error": "Could not understand — try speaking more clearly."}

        return {"text": text}

    except Exception as e:
        return {"error": str(e)}
