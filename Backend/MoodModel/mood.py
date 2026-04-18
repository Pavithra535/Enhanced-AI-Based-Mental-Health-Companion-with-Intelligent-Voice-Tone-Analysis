"""
Mood detection via DeepFace (RetinaFace detector). TensorFlow/DeepFace load lazily on first request.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
@app.route('/')
def home():
    return {"status": "success", "message": "Soul Space Mood Model is Running!"}
CORS(app)

# Canonical labels (match MindSpace Backend models/Mood.js)
LABELS_ORDER = ["Angry", "Disgust", "Fear", "Happy", "Neutral", "Sad", "Surprise"]
LABEL_TO_VALUE = {label: i for i, label in enumerate(LABELS_ORDER)}

# DeepFace dominant_emotion strings are lowercase
DEEPFACE_TO_CANONICAL = {
    "angry": "Angry",
    "disgust": "Disgust",
    "fear": "Fear",
    "happy": "Happy",
    "neutral": "Neutral",
    "sad": "Sad",
    "surprise": "Surprise",
}

MIN_CONFIDENCE = 0.40
DETECTOR_BACKENDS = ["retinaface", "opencv", "mtcnn"]

_init_lock = threading.Lock()
_engine_ready = False
DeepFace = None  # set in ensure_emotion_engine()

_history_lock = threading.Lock()
MOOD_HISTORY: List[Dict[str, Any]] = []
MAX_HISTORY = 500


def ensure_emotion_engine() -> None:
    """Lazy singleton: import DeepFace only on first emotion request."""
    global _engine_ready, DeepFace
    with _init_lock:
        if _engine_ready:
            return
        from deepface import DeepFace as _DeepFace

        DeepFace = _DeepFace
        _engine_ready = True


def _normalize_confidence(raw: float) -> float:
    """DeepFace may return 0-100 or 0-1 depending on version."""
    if raw > 1.0:
        return min(1.0, max(0.0, raw / 100.0))
    return min(1.0, max(0.0, float(raw)))


def _score_to_ratio(raw: float) -> float:
    """Normalize arbitrary DeepFace score to 0..1 for weighted checks."""
    return _normalize_confidence(float(raw or 0.0))


def _dominant_emotion_from_result(face: Dict[str, Any], lip_downturn: bool = False) -> Tuple[str, float]:
    """Return canonical label and confidence from one DeepFace analyze face dict."""
    dominant_raw = (face.get("dominant_emotion") or "neutral").lower()
    emotion_scores = face.get("emotion") or {}
    canonical = DEEPFACE_TO_CANONICAL.get(dominant_raw, "Neutral")
    raw_conf = 0.0
    sad_ratio = _score_to_ratio(float(emotion_scores.get("sad", 0.0))) if emotion_scores else 0.0
    neutral_ratio = _score_to_ratio(float(emotion_scores.get("neutral", 0.0))) if emotion_scores else 0.0

    # Weighted check: if sad is present strongly, do not let neutral dominate.
    if canonical == "Neutral" and sad_ratio >= 0.20:
        canonical = "Sad"
        raw_conf = float(emotion_scores.get("sad", 0.0))

    # Micro-expression boost: downturn at lip corners suggests sadness.
    if canonical == "Neutral" and lip_downturn and sad_ratio >= 0.12 and sad_ratio >= (neutral_ratio * 0.45):
        canonical = "Sad"
        raw_conf = float(emotion_scores.get("sad", 0.0))

    if emotion_scores:
        if raw_conf <= 0.0:
            key = dominant_raw if dominant_raw in emotion_scores else max(
                emotion_scores, key=lambda k: emotion_scores[k]
            )
            raw_conf = float(emotion_scores.get(key, 0.0))
    confidence = _normalize_confidence(raw_conf)
    return canonical, confidence


def _preprocess_low_light(frame_bgr: np.ndarray) -> np.ndarray:
    """
    Improve detectability under low light:
    - grayscale -> CLAHE (contrast) -> back to BGR
    """
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)


def _enhance_eye_mouth_contrast(frame_bgr: np.ndarray) -> np.ndarray:
    """
    Apply stronger CLAHE specifically on eye and mouth bands.
    If precise landmarks are unavailable, this uses robust facial-layout bands.
    """
    h, w = frame_bgr.shape[:2]
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    base_clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    boosted = base_clahe.apply(gray)

    # Approximate facial feature bands for webcam framing.
    eye_y0, eye_y1 = int(h * 0.25), int(h * 0.48)
    mouth_y0, mouth_y1 = int(h * 0.60), int(h * 0.86)
    x0, x1 = int(w * 0.18), int(w * 0.82)

    local_clahe = cv2.createCLAHE(clipLimit=3.2, tileGridSize=(6, 6))
    if eye_y1 > eye_y0 and x1 > x0:
        boosted[eye_y0:eye_y1, x0:x1] = local_clahe.apply(boosted[eye_y0:eye_y1, x0:x1])
    if mouth_y1 > mouth_y0 and x1 > x0:
        boosted[mouth_y0:mouth_y1, x0:x1] = local_clahe.apply(boosted[mouth_y0:mouth_y1, x0:x1])

    return cv2.cvtColor(boosted, cv2.COLOR_GRAY2BGR)


def _lip_corners_downturned(frame_bgr: np.ndarray, region: Dict[str, Any]) -> bool:
    """
    Micro-expression heuristic using feature points as lightweight landmarks:
    detect mouth-region corners and compare against center lip level.
    """
    x = int(region.get("x", 0) or 0)
    y = int(region.get("y", 0) or 0)
    w = int(region.get("w", 0) or 0)
    h = int(region.get("h", 0) or 0)
    if w <= 0 or h <= 0:
        return False

    frame_h, frame_w = frame_bgr.shape[:2]
    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(frame_w, x + w)
    y1 = min(frame_h, y + h)
    if x1 <= x0 or y1 <= y0:
        return False

    face = frame_bgr[y0:y1, x0:x1]
    fh, fw = face.shape[:2]
    mx0, mx1 = int(fw * 0.15), int(fw * 0.85)
    my0, my1 = int(fh * 0.58), int(fh * 0.90)
    if mx1 <= mx0 or my1 <= my0:
        return False

    mouth = face[my0:my1, mx0:mx1]
    gray = cv2.cvtColor(mouth, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    points = cv2.goodFeaturesToTrack(gray, maxCorners=50, qualityLevel=0.01, minDistance=3)
    if points is None or len(points) < 6:
        return False

    pts = points.reshape(-1, 2)
    left = pts[np.argmin(pts[:, 0])]
    right = pts[np.argmax(pts[:, 0])]
    center_band = pts[(pts[:, 0] > np.percentile(pts[:, 0], 40)) & (pts[:, 0] < np.percentile(pts[:, 0], 60))]
    if center_band.size == 0:
        return False

    corners_y = float((left[1] + right[1]) / 2.0)
    center_y = float(np.median(center_band[:, 1]))
    downturn = corners_y > (center_y + 1.5)
    return bool(downturn)


def _analyze_frame_bgr(frame: np.ndarray) -> Tuple[str, float]:
    """
    Run DeepFace emotion with multiple detector backends and preprocessing.
    Uses enforce_detection=False and manually validates results so we can fallback
    within the same request instead of hard failing early.
    """
    ensure_emotion_engine()
    assert DeepFace is not None

    # Try original + enhanced frames with multiple detector backends
    candidates: List[Tuple[str, str, np.ndarray]] = [
        ("original", backend, frame) for backend in DETECTOR_BACKENDS
    ]
    enhanced = _preprocess_low_light(frame)
    candidates.extend([("enhanced", backend, enhanced) for backend in DETECTOR_BACKENDS])
    eye_mouth_enhanced = _enhance_eye_mouth_contrast(frame)
    candidates.extend([("eye_mouth_enhanced", backend, eye_mouth_enhanced) for backend in DETECTOR_BACKENDS])

    last_error: Optional[BaseException] = None
    last_error_ctx: Optional[str] = None

    for prep_name, backend, img in candidates:
        try:
            results = DeepFace.analyze(
                img,
                actions=["emotion"],
                detector_backend=backend,
                enforce_detection=False,
            )
            if isinstance(results, dict):
                results = [results]

            # Manual validation: must have non-empty emotion distribution
            valid_faces = [
                face for face in (results or [])
                if isinstance(face, dict) and (face.get("emotion") or {})
            ]
            if not valid_faces:
                raise ValueError("No face/emotion found in result")

            # Prefer largest region if present
            best = valid_faces[0]
            best_area = 0.0
            for face in valid_faces:
                r = face.get("region") or {}
                w = float(r.get("w", 0) or 0)
                h = float(r.get("h", 0) or 0)
                area = w * h
                if area >= best_area:
                    best_area = area
                    best = face

            lip_downturn = _lip_corners_downturned(img, best.get("region") or {})
            mood, conf = _dominant_emotion_from_result(best, lip_downturn=lip_downturn)
            sad_dbg = _score_to_ratio(float((best.get("emotion") or {}).get("sad", 0.0)))
            neu_dbg = _score_to_ratio(float((best.get("emotion") or {}).get("neutral", 0.0)))
            print(
                f"[DeepFace] success backend={backend} preprocess={prep_name} "
                f"mood={mood} conf={conf:.4f} sad={sad_dbg:.3f} neutral={neu_dbg:.3f} lip_downturn={lip_downturn}"
            )
            return mood, conf
        except Exception as e:
            last_error = e
            last_error_ctx = f"backend={backend} preprocess={prep_name}"
            print(f"[DeepFace] failed {last_error_ctx}: {e}")

    # Prefer the face with largest facial area if regions are present
    if last_error is None:
        raise ValueError("No face detected")
    raise RuntimeError(f"All DeepFace backends failed ({last_error_ctx}): {last_error}") from last_error


def _append_history(mood: str, confidence: float, message: str) -> int:
    with _history_lock:
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "mood": mood,
            "confidence": round(confidence, 4),
            "message": message or "",
        }
        MOOD_HISTORY.append(entry)
        if len(MOOD_HISTORY) > MAX_HISTORY:
            del MOOD_HISTORY[: len(MOOD_HISTORY) - MAX_HISTORY]
        return len(MOOD_HISTORY)


def _decode_image_from_request() -> Tuple[Optional[np.ndarray], Optional[Any]]:
    """Returns (frame_bgr, error_response) where error_response is Flask (jsonify, status) tuple."""
    if "image" not in request.files:
        return None, (jsonify({"error": "No image provided"}), 400)
    file = request.files["image"]
    if not file or file.filename == "":
        return None, (jsonify({"error": "No image file selected"}), 400)

    data = file.read()
    if not data:
        return None, (jsonify({"error": "Empty image upload"}), 400)

    # Small delay to let client-side webcam autofocus settle (requested).
    time.sleep(0.1)

    npimg = np.frombuffer(data, np.uint8)
    frame = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    if frame is None:
        return None, (jsonify({"error": "Invalid image format"}), 400)

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    if cv2.mean(gray)[0] < 5:
        return None, (
            jsonify(
                {
                    "error": "Camera frame is too dark or empty. Please check your camera.",
                }
            ),
            400,
        )

    return frame, None


def _optional_message() -> str:
    """Optional form field `message` for multipart requests."""
    raw = request.form.get("message") if request.form else None
    if raw is None:
        return ""
    return (raw or "").strip()[:2000]


def _run_detection(compatibility: bool):
    frame, err = _decode_image_from_request()
    if err:
        return err

    message = _optional_message()

    try:
        mood_label, confidence = _analyze_frame_bgr(frame)
    except Exception as e:
        print(f"DeepFace analyze failed: {e}")
        import traceback

        traceback.print_exc()
        err_text = str(e).lower()
        if "face" in err_text or "detect" in err_text:
            return (
                jsonify(
                    {
                        "error": "No face detected in frame. Please show your face clearly.",
                    }
                ),
                400,
            )
        return jsonify({"error": str(e)}), 500

    if confidence < MIN_CONFIDENCE:
        return (
            jsonify(
                {
                    "error": "Face detected but confidence is too low. Please improve lighting and look at the camera.",
                    "confidence": round(confidence, 4),
                }
            ),
            422,
        )

    history_count = _append_history(mood_label, confidence, message)
    conf_rounded = round(confidence, 4)

    if compatibility:
        value = LABEL_TO_VALUE.get(mood_label, 4)
        return (
            jsonify(
                {
                    "mood": value,
                    "moodLabel": mood_label,
                    "confidence": conf_rounded,
                    "history_count": history_count,
                }
            ),
            200,
        )

    return (
        jsonify(
            {
                "mood": mood_label,
                "confidence": conf_rounded,
                "history_count": history_count,
            }
        ),
        200,
    )


@app.route("/detect-emotion", methods=["POST"])
def detect_emotion():
    """Primary API: { mood, confidence, history_count } with string mood label."""
    return _run_detection(compatibility=False)


@app.route("/predict_emotion", methods=["POST"])
def predict_emotion():
    """Legacy / Node proxy: includes mood (0-6) and moodLabel for MongoDB compatibility."""
    return _run_detection(compatibility=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5055)
