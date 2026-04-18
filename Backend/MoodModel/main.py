import io
import os
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from tensorflow.keras.models import load_model
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

import google.generativeai as genai

try:
    import librosa
except Exception:
    librosa = None


# =====================
# TensorFlow Memory Fix
# =====================
gpus = tf.config.list_physical_devices("GPU")
if gpus:
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
    except RuntimeError as error:
        print(error)

tf.config.threading.set_intra_op_parallelism_threads(2)
tf.config.threading.set_inter_op_parallelism_threads(2)


# =====================
# FastAPI App Setup
# =====================
app = FastAPI(title="MindSpace Mood + AI Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================
# AI + Sentiment Setup
# =====================
analyzer = SentimentIntensityAnalyzer()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_AI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel("gemini-1.5-flash")
else:
    gemini_model = None
    print("⚠️ Gemini API key missing. Chat will use fallback response.")


# =====================
# Load Pretrained Model & Haar Cascade
# =====================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model_file.h5")
CASCADE_PATH = os.path.join(BASE_DIR, "haarcascade_frontalface_default.xml")

if os.path.exists(MODEL_PATH):
    model = load_model(MODEL_PATH)
    print(f"✅ Loaded model from {MODEL_PATH}")
else:
    model = None
    print(f"⚠️ Model file {MODEL_PATH} not found.")

if os.path.exists(CASCADE_PATH):
    face_detect = cv2.CascadeClassifier(CASCADE_PATH)
    print("✅ Loaded Haar Cascade Face Detector")
else:
    face_detect = None
    print("⚠️ Haar Cascade file not found.")

class_labels = {0: "Angry", 1: "Disgust", 2: "Fear", 3: "Happy", 4: "Neutral", 5: "Sad", 6: "Surprise"}


class ChatTurn(BaseModel):
    role: str
    content: str


class TextMessage(BaseModel):
    message: str
    conversation_history: Optional[List[ChatTurn]] = None
    detected_tone: Optional[str] = "Neutral"


def normalize_history(history: Optional[List[ChatTurn]]) -> List[Dict[str, Any]]:
    if not history:
        return []

    normalized: List[Dict[str, Any]] = []
    for turn in history[-10:]:
        role = "user" if turn.role.lower() == "user" else "model"
        content = (turn.content or "").strip()
        if content:
            normalized.append({"role": role, "parts": [content[:800]]})
    return normalized


def is_gibberish(text: str) -> bool:
    stripped = (text or "").strip()
    if len(stripped) < 3:
        return False
    vowels = sum(1 for c in stripped.lower() if c in "aeiou")
    alpha = sum(1 for c in stripped if c.isalpha())
    no_space = stripped.replace(" ", "")
    return (alpha > 8 and vowels <= 1) or (len(no_space) >= 12 and vowels / max(alpha, 1) < 0.15)


def fallback_reply(text: str, tone: str) -> str:
    if is_gibberish(text):
        return "I want to support you, and I may have missed what you meant. Could you share your feelings in a bit more detail?"
    return (
        f"I hear you, and your feelings matter. I notice your tone sounds {tone.lower()}. "
        "Try one slow grounding exercise now: breathe in for 4 seconds, hold for 4, and exhale for 6, repeating for 1 minute. "
        "If you'd like, tell me what feels heaviest right now so we can break it into a small next step."
    )


@app.post("/api/chat")
async def chat(payload: TextMessage):
    text = (payload.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is required")

    # Normalize text before VADER scoring to avoid false 0.000 from whitespace-only noise.
    text_for_vader = " ".join(text.split()).strip()
    scores = analyzer.polarity_scores(text_for_vader)
    compound = float(scores.get("compound", 0.0))
    print(f"DEBUG: Text: {text_for_vader} | Score: {compound}")
    tone = (payload.detected_tone or "Neutral").strip() or "Neutral"

    system_instruction = (
        "You are a warm, professional mental health companion. "
        "Always respond naturally and empathetically. Never give robotic or generic replies. "
        "Validate the user's feelings and provide specific coping tips such as grounding, breathing, journaling, "
        "or one gentle next action based on their current situation. "
        "If the user sends random gibberish, gently ask them to share their feelings clearly."
    )

    if compound <= -0.6:
        system_instruction += (
            " The user's sentiment is highly negative. Start with deeper emotional validation and use extra gentle language."
        )

    prompt = (
        f"{system_instruction}\n"
        f"Detected voice tone: {tone}\n"
        f"VADER compound score: {compound}\n"
        f"User says: {text}"
    )

    if gemini_model is None:
        reply = fallback_reply(text, tone)
    else:
        try:
            history = normalize_history(payload.conversation_history)
            chat_session = gemini_model.start_chat(history=history)
            result = chat_session.send_message(prompt)
            reply = (result.text or "").strip() or fallback_reply(text, tone)
        except Exception as error:
            print(f"Gemini error: {error}")
            reply = fallback_reply(text, tone)

    return {
        "mood": "analyzed",
        "sentiment_score": compound,
        "reply": reply,
    }


@app.post("/api/analyze_voice")
async def analyze_voice(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    if librosa is not None:
        try:
            signal, sr = librosa.load(io.BytesIO(audio_bytes), sr=16000)
            if len(signal) == 0:
                raise ValueError("No samples")
            energy = float(np.mean(np.abs(signal)))
            zcr = float(np.mean(librosa.feature.zero_crossing_rate(y=signal)))

            if energy < 0.01:
                detected_tone = "Sad"
            elif zcr > 0.12:
                detected_tone = "Anxious"
            else:
                detected_tone = "Happy"

            return {"detected_tone": detected_tone, "method": "librosa"}
        except Exception as error:
            print(f"Librosa tone analysis failed: {error}")

    size = len(audio_bytes)
    if size < 50_000:
        tone = "Sad"
    elif size < 120_000:
        tone = "Anxious"
    else:
        tone = "Happy"

    return {"detected_tone": tone, "method": "size_fallback"}


@app.post("/predict_emotion")
async def predict_emotion(image: UploadFile = File(...)):
    try:
        if face_detect is None:
            raise HTTPException(status_code=500, detail="Face detector not loaded")
        if model is None:
            raise HTTPException(status_code=500, detail="Model not loaded")

        image_bytes = await image.read()
        npimg = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
        if frame is None:
            raise HTTPException(status_code=400, detail="Invalid image format")

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_detect.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(40, 40))
        if len(faces) == 0:
            gray_eq = cv2.equalizeHist(gray)
            faces = face_detect.detectMultiScale(gray_eq, scaleFactor=1.1, minNeighbors=4, minSize=(40, 40))
        if len(faces) == 0:
            raise HTTPException(status_code=400, detail="No face detected")

        x, y, w, h = max(faces, key=lambda rect: rect[2] * rect[3])
        sub_face_img = gray[y:y + h, x:x + w]
        resized = cv2.resize(sub_face_img, (48, 48))
        reshaped = np.reshape(resized / 255.0, (1, 48, 48, 1))

        raw_probs = model.predict(reshaped)[0]
        angry_p, fear_p, sad_p, happy_p, neutral_p = raw_probs[0], raw_probs[2], raw_probs[5], raw_probs[3], raw_probs[4]

        if angry_p > 0.035:
            label = 0
        elif sad_p > 0.10:
            label = 5
        elif happy_p > 0.85:
            label = 3
        elif neutral_p > 0.20:
            label = 4
        else:
            temp_probs = raw_probs.copy()
            temp_probs[3] = temp_probs[3] * 0.05
            label = int(np.argmax(temp_probs))

        emotion = class_labels[label]
        return {"mood": label, "moodLabel": emotion}

    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5055)