import cv2
import numpy as np
import os
import urllib.request

from mediapipe.tasks import python as mp_task
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions
# CORRECT import for Image and ImageFormat
from mediapipe.tasks.python.vision.core.image import Image, ImageFormat

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
MODEL_PATH = "hand_landmarker.task"

def download_model():
    if not os.path.exists(MODEL_PATH):
        print("📥 Downloading hand_landmarker.task (~10MB) ...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("✅ Download complete!")

def normalize_hand_landmarks(flat_xyz63):
    """Center on the wrist (landmark 0) and scale by the hand's bounding-box
    diagonal. Must match the normalization used in the training notebook
    (CELL 6) exactly -- the alphabet MLP was trained on normalized vectors,
    not raw MediaPipe coordinates, so skipping this step here would feed the
    model out-of-distribution input and silently tank accuracy."""
    pts = np.array(flat_xyz63, dtype=np.float32).reshape(21, 3)
    wrist = pts[0].copy()
    pts -= wrist
    scale = np.linalg.norm(pts.max(axis=0) - pts.min(axis=0))
    if scale > 1e-6:
        pts /= scale
    return pts.flatten()


class HandTracker:
    def __init__(self):
        download_model()
        options = HandLandmarkerOptions(
            base_options=mp_task.BaseOptions(model_asset_path=MODEL_PATH),
            num_hands=2,
            # Matches the extraction settings used in the training notebook
            # (CELL 6) so live inference sees the same detection behavior
            # the model was trained on.
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.detector = HandLandmarker.create_from_options(options)

    def get_landmarks(self, frame):
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = Image(image_format=ImageFormat.SRGB, data=rgb_frame)
        detection_result = self.detector.detect(mp_image)
        landmarks = np.zeros(126, dtype=np.float32)
        annotated_frame = frame.copy()

        if detection_result.hand_landmarks:
            for i, hand_landmarks in enumerate(detection_result.hand_landmarks[:2]):
                flat = []
                for landmark in hand_landmarks:
                    flat.extend([landmark.x, landmark.y, landmark.z])
                flat = normalize_hand_landmarks(flat)
                start = i * 63
                landmarks[start:start + 63] = flat

            # Draw dots on the annotated frame (uses raw, un-normalized
            # coordinates -- this is just for on-screen visualization and
            # is unrelated to the feature vector returned above)
            for hand_landmarks in detection_result.hand_landmarks[:2]:
                for landmark in hand_landmarks:
                    x = int(landmark.x * frame.shape[1])
                    y = int(landmark.y * frame.shape[0])
                    cv2.circle(annotated_frame, (x, y), 3, (0, 255, 0), -1)

        return landmarks, annotated_frame
