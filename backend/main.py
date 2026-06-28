"""
Sawa backend — FastAPI + WebSocket
Run with: uvicorn main:app --reload --port 8000
"""
import asyncio
import base64
import json
import os

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from hand_utils import HandTracker
from predictor  import SignPredictor

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load models once at startup ───────────────────────────────────────────────
tracker      = HandTracker()
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
    X          = np.load(npy_path)
    y          = np.load(labels_path, allow_pickle=True).tolist()
    labels_arr = np.array(y)
    ref = {}
    for label in set(y):
        mask       = labels_arr == label
        median_vec = np.median(X[mask], axis=0)
        ref[label] = median_vec[:63].tolist()
    return ref

EN_LANDMARKS = load_reference_landmarks("asl_alphabet_features.npy",  "asl_alphabet_labels.npy")
AR_LANDMARKS = load_reference_landmarks("arsl_alphabet_features.npy", "arsl_alphabet_labels.npy")
print(f"✅ EN landmark refs: {len(EN_LANDMARKS)} letters")
print(f"✅ AR landmark refs: {len(AR_LANDMARKS)} letters")


# ── REST: Text-to-Sign ────────────────────────────────────────────────────────
@app.get("/landmarks/{lang}/{letter}")
def get_landmarks_ref(lang: str, letter: str):
    db  = EN_LANDMARKS if lang == "en" else AR_LANDMARKS
    vec = db.get(letter.upper()) or db.get(letter)
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
    Client → { lang, frame: <base64 jpeg> }
    Server → { letter, conf, annotated_frame: <base64 jpeg with green dots> }
    The server draws green landmark dots directly on the frame (same as
    the working Streamlit version) and sends the annotated image back.
    """
    await websocket.accept()
    loop = asyncio.get_event_loop()

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            lang      = msg.get("lang", "en")
            predictor = en_predictor if lang == "en" else ar_predictor

            try:
                img_data  = base64.b64decode(msg["frame"])
                img_array = np.frombuffer(img_data, dtype=np.uint8)
                frame     = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            except Exception as e:
                print(f"⚠️ Exception decoding frame: {e}")
                frame = None

            if frame is None:
                print(f"⚠️ frame is None! msg['frame'] length: {len(msg.get('frame', ''))}")
                await websocket.send_text(
                    json.dumps({"letter": None, "conf": 0.0, "annotated_frame": ""})
                )
                continue

            def process():
                # ... existing frame processing ...
                landmarks, annotated = tracker.get_landmarks(frame)
                has_hand = bool(np.any(landmarks))
                
                # Debug: save a frame if no hands detected, to see what the server is seeing
                if not hasattr(process, 'last_debug_time'):
                    process.last_debug_time = 0
                import time
                if not has_hand and time.time() - process.last_debug_time > 5:
                    cv2.imwrite(f"debug_frame_{int(time.time())}.jpg", frame)
                    process.last_debug_time = time.time()
                
                if has_hand:
                    letter, conf = predictor.predict(landmarks)
                else:
                    letter, conf = None, 0.0

                # Encode annotated frame (with green dots) as base64 jpeg
                _, buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
                frame_b64 = base64.b64encode(buf).decode('utf-8')

                return frame_b64, letter, float(conf)

            frame_b64, letter, conf = await loop.run_in_executor(None, process)

            await websocket.send_text(json.dumps({
                "letter":          letter,
                "conf":            conf,
                "annotated_frame": frame_b64,
            }))

    except WebSocketDisconnect:
        pass
