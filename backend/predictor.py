import numpy as np
import tensorflow as tf
import json

CONFIDENCE_THRESHOLD = 0.6


class SignPredictor:
    def __init__(self,
                 model_path="sawa_asl_model.keras",
                 labels_path="sawa_label_classes.json"):
        self.model = tf.keras.models.load_model(model_path)
        with open(labels_path, "r") as f:
            self.labels = json.load(f)

    def predict(self, landmarks):
        input_vec = np.array(landmarks, dtype=np.float32).reshape(1, -1)
        probs     = self.model.predict(input_vec, verbose=0)[0]
        idx       = int(np.argmax(probs))
        conf      = float(probs[idx])
        if conf >= CONFIDENCE_THRESHOLD:
            return self.labels[idx], conf
        return None, 0.0
