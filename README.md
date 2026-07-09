# Sawa · سوا
### A Real-Time Bidirectional Sign Language Communication System

> **Sawa** (Arabic: *together*) — a communication bridge between deaf/mute users and hearing/speaking users that requires neither side to learn the other's language.

Built as an AI Capstone for the **Digital Egypt Pioneers Initiative** · eYouth · Ministry of Communications and Information Technology

---

## The Problem

Deaf and mute individuals face a persistent communication gap in everyday life — in hospitals, public transport, retail, and emergencies. Sign language interpreters are rarely available on demand, and most existing digital tools either ignore Arabic sign language entirely or require the non-signing party to already understand signs.

Sawa closes that gap in real time, in both directions, in both English and Arabic.

---

## What It Does

### 🔤 Sign to Text
Open your camera. Sign a letter. Hold it steady for under a second. Watch it appear in the live buffer — letter by letter, building into words and full sentences.

No word-level gesture recognition needed. Sawa uses a **letter buffer** with a hold-to-confirm streak mechanism: the model must predict the same letter for 10 consecutive frames before it commits to the buffer. A dedicated **space sign** marks word boundaries. A **DEL sign** removes the last character. The result is a robust, misread-resistant way to spell out anything the alphabet can express.

### 🔊 Speech to Sign
Speak, upload an audio file, or type manually. Sawa transcribes the speech locally (no external API), tokenizes the text letter by letter, fetches a reference hand-landmark vector for each letter, and renders it as an **animated 2D hand skeleton** — in English or Arabic — that the other person can follow at their own pace.

### 🌍 Two Languages. One Pipeline.
Both the English (ASL) and Arabic (ArASL) classifiers share the same Dense MLP architecture and MediaPipe landmark-extraction pipeline. Switching languages is instant — both models are loaded at startup. The entire interface also switches between English and Arabic (including right-to-left layout) independently of which sign language is being used.

---

## System Architecture

```
┌─────────────────────────────┐     WebSocket / REST      ┌──────────────────────────────┐
│     Client · React (Vite)   │ ◄────────────────────────► │   Server · FastAPI (Python)  │
│                             │                            │                              │
│  AppContext (UI lang / RTL) │   frame ──────────────►   │  WS /ws/sign-to-text         │
│  Sign to Text               │   ◄──────── letter + conf │  GET /landmarks/{lang}/{c}   │
│    └ LetterBuffer           │                            │  GET /letters/{lang}         │
│    └ AR label → char map    │   GET letter ──────────►  │  POST /transcribe            │
│  Speech to Sign             │   POST audio ──────────►  │                              │
│    └ HandSkeleton canvas    │                            │  HandTracker (hand_utils.py) │
│    └ LangToggle             │                            │  SignPredictor × 2 (EN / AR) │
│                             │                            │  AR Char ↔ Label Maps        │
└─────────────────────────────┘                            │  Reference Landmark Store    │
                                                           │  Whisper Transcriber         │
                                                           └──────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Backend framework | FastAPI + Uvicorn | 0.115.0 / 0.30.6 |
| Real-time comms | WebSockets | 13.1 |
| Computer vision | OpenCV | 4.10.0.84 |
| Hand tracking | MediaPipe | 0.10.33 |
| ML framework | TensorFlow / Keras | 2.18.0 |
| Numerical ops | NumPy | 1.26.4 |
| Speech-to-text | faster-whisper (local, CPU, int8) | latest |
| Frontend framework | React 18 + Vite | 18.3.1 / 5.4.8 |
| Routing | React Router DOM | 6.26.2 |
| Animation | Framer Motion | 11.5.4 |

---

## Model Architecture

Both the English and Arabic classifiers share an **identical Dense MLP architecture** — only the output layer differs to match each language's class count.

```
Input (126-dim)          21 landmarks × 3 coords × 2 hands, wrist-centered & scale-normalized
     │
Dense(256, ReLU) → BatchNormalization → Dropout(0.5)
     │
Dense(128, ReLU) → BatchNormalization → Dropout(0.3)
     │
Dense(num_classes, softmax)          28 classes (EN) · 32 classes (AR)
```

**Training:** Adam (lr=1e-3) · sparse categorical cross-entropy · early stopping · LR reduction on plateau · class-weight balancing

---

## Datasets

| Language | Dataset | Source | Size |
|---|---|---|---|
| English | ASL Alphabet | [Kaggle · grassknoted/asl-alphabet](https://www.kaggle.com/datasets/grassknoted/asl-alphabet) | ~87,000 images · 29 classes |
| Arabic | ArASL (ArSL2018) | [Kaggle · gannayasser/arabic-alphabets-sign-language-dataset-arasl](https://www.kaggle.com/datasets/gannayasser/arabic-alphabets-sign-language-dataset-arasl) | 54,049 images · 32 classes · 40+ signers |

Raw images are not used at inference time. Both datasets were processed once through MediaPipe HandLandmarker, with landmarks centered on the wrist and scale-normalized by the hand's bounding-box diagonal, then cached as `.npy` feature/label files for training and reference-landmark lookup.

> **Dataset citation:** G. Latif, J. Alghazo, N. Mohammad, R. AlKhalaf, and R. AlKhalaf, "Arabic Alphabets Sign Language Dataset (ArASL)," Mendeley Data, v1, 2018.

---

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- A webcam

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The backend expects the following model and data files in the `backend/` directory:

```
sawa_asl_model.keras
sawa_label_classes.json
sawa_arsl_model.keras
sawa_arsl_label_classes.json
asl_alphabet_features.npy
asl_alphabet_labels.npy
arsl_alphabet_features.npy
arsl_alphabet_labels.npy
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## How the Letter Buffer Works

The buffer is the core of Sawa's "letters into words" strategy. Rather than recognizing whole words as single gestures — a much harder and more fragile problem — Sawa recognizes individual letters reliably and assembles them:

```
Frame stream:  A A A A A A A A A A → commit "A"   (10 consecutive frames = ~0.8s)
               _ _ _ _             → grace period  (up to 4 frames tolerated)
               [SPACE] × 10        → append " "    (word boundary)
               B B B B B B B B B B → commit "B"
```

- **STREAK_THRESHOLD = 10 frames** to confirm a letter
- **GRACE_FRAMES = 4** frames of dropout tolerated before the streak resets
- **SPACE** and **DEL** are recognized signs like any other letter — no special hardware needed

This same mechanism works identically for English and Arabic.

---

## Project Structure

```
├── backend/
│   ├── main.py              # FastAPI app — WebSocket + REST endpoints
│   ├── hand_utils.py        # MediaPipe HandTracker + landmark normalization
│   ├── predictor.py         # SignPredictor (Keras classifier wrapper)
│   ├── requirements.txt
│   └── *.keras / *.json / *.npy
│
├── frontend/
│   └── src/
│       ├── context/
│       │   └── AppContext.jsx       # UI language (EN/AR) + RTL + translations
│       ├── pages/
│       │   ├── Home.jsx
│       │   ├── SignToText.jsx       # Live camera → letter buffer
│       │   └── SpeechToSign.jsx    # Voice / file / text → hand skeleton
│       └── components/
│           ├── LetterBuffer.jsx     # Animated letter tiles + hold-progress bar
│           ├── HandSkeleton.jsx     # 2D hand landmark canvas renderer
│           └── LangToggle.jsx       # EN / AR sign-language switch
│
├── SawaNotebook.ipynb       # English model training pipeline
└── docs/
    └── Sawa_Technical_Documentation.docx
```

---

## Team

Built collaboratively by a five-person team — no fixed role assignments, everyone owned whatever the project needed at each stage.

| Name | GitHub |
|---|---|
| Omar Bassam Mahmoud *(Team Leader)* | |
| Saher Atef Faheem | |
| Anas Alaa Saad | |
| Passant Shaaban Abdelazeem | |
| Omar Hany Tohami | |

---

## License

This project was built for educational and demonstration purposes as part of the Digital Egypt Pioneers Initiative AI Capstone.

---

<p align="center">
  <strong>Sawa · سوا · together</strong>
</p>
