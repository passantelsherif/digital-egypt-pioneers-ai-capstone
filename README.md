# Sawa Web App — Setup Guide

## Project structure
```
sawa-app/
├── backend/          ← Python FastAPI server (your models live here)
└── frontend/         ← React app (UI)
```

---

## Step 1 — Backend setup

Copy these files from your old Sawa project into `backend/`:
```
hand_utils.py
hand_landmarker.task
sawa_asl_model.keras
sawa_label_classes.json
sawa_arsl_model.keras
sawa_arsl_label_classes.json
asl_alphabet_features.npy      ← for EN Text-to-Sign skeleton
asl_alphabet_labels.npy
arsl_alphabet_features.npy     ← for AR Text-to-Sign skeleton
arsl_alphabet_labels.npy
sawa_layers.py                 ← needed by the ASL model loader
```

Then install dependencies and run:

```powershell
cd sawa-app/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

You should see:
```
✅ EN landmark refs: 28 letters
✅ AR landmark refs: 32 letters
INFO: Uvicorn running on http://127.0.0.1:8000
```

---

## Step 2 — Frontend setup

```powershell
cd sawa-app/frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

---

## How it works

```
Browser (React)  ──WebSocket──▶  FastAPI (Python)
                                   │
                                   ├── hand_utils.py   (MediaPipe)
                                   ├── predictor.py    (EN model)
                                   └── predictor.py    (AR model)
```

- **Sign to Text**: browser sends camera frames over WebSocket →
  backend extracts landmarks + predicts → sends letter back
- **Text to Sign**: browser calls REST API `/landmarks/en/A` →
  backend returns the 63-float landmark vector from training data →
  browser draws the animated skeleton

---

## Troubleshooting

**"WebSocket connection failed"**
→ Make sure the backend is running on port 8000

**"No landmark refs loaded"**
→ Check that the `.npy` files are in `backend/` folder

**Arabic model error on load**
→ Make sure `sawa_layers.py` is in `backend/` and imported before `load_model`
   Add this to the top of `main.py` if needed:
   ```python
   import sawa_layers  # registers AttentionPooling1D
   ```
