"""This module uses MediaPipe Face Mesh landmarks to estimate blink activity and brow tension, producing a conservative local facial load score that degrades gracefully when the camera feed is missing or unusable."""

from __future__ import annotations

from collections import deque
from math import hypot
from typing import Any

import cv2
import mediapipe as mp
import numpy as np
from scipy.spatial.distance import euclidean


LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]
BROW_LEFT = 334
BROW_RIGHT = 105
LEFT_IRIS  = [474, 475, 476, 477]
RIGHT_IRIS = [469, 470, 471, 472]


def eye_aspect_ratio(landmarks: list[Any], indices: list[int], w: int, h: int) -> float:
    coords = [(landmarks[index].x * w, landmarks[index].y * h) for index in indices]
    vertical_a = euclidean(coords[1], coords[5])
    vertical_b = euclidean(coords[2], coords[4])
    horizontal = euclidean(coords[0], coords[3])
    if horizontal == 0:
        return 0.0
    return float((vertical_a + vertical_b) / (2.0 * horizontal))


def compute_blink_rate(ear_history: list[float], fps: int = 10) -> float:
    if len(ear_history) < 3:
        return 0.0
    threshold = 0.21
    blink_count = 0
    eyes_closed = False
    for ear in ear_history:
        if ear < threshold and not eyes_closed:
            blink_count += 1
            eyes_closed = True
        elif ear >= threshold:
            eyes_closed = False
    minutes_observed = max(len(ear_history) / max(fps, 1) / 60.0, 1 / 60.0)
    return round(blink_count / minutes_observed, 2)


def brow_furrow_distance(landmarks: list[Any], img_w: int, img_h: int) -> float:
    # Inner brow corners: landmark 55 (left inner) and 285 (right inner)
    left_inner_x = landmarks[55].x * img_w
    right_inner_x = landmarks[285].x * img_w
    return abs(right_inner_x - left_inner_x)  # decreases when furrowed


def brow_furrow_score(landmarks: list[Any], history: list[float], img_w: int, img_h: int, baseline_override: float | None = None) -> float:
    brow_distance = brow_furrow_distance(landmarks, img_w, img_h)
    history.append(float(brow_distance))
    baseline = baseline_override if baseline_override is not None else max(sum(history) / len(history), 1e-6)

    # A decreasing brow distance typically indicates furrowing.
    contraction = max(0.0, min(1.0, (baseline - brow_distance) / baseline))
    return round(contraction * 40.0, 2)


def iris_load_score(landmarks: list[Any], img_w: int, img_h: int, baseline_override: float | None = None) -> float:
    """
    Returns 0-100. Higher = more dilation = higher cognitive load.
    Uses iris horizontal diameter relative to eye width as a proxy for pupil dilation.
    """
    l_iris = [landmarks[i] for i in LEFT_IRIS]
    iris_w = abs(l_iris[0].x - l_iris[2].x) * img_w
    eye_w  = abs(landmarks[133].x - landmarks[33].x) * img_w
    ratio  = iris_w / eye_w if eye_w > 0 else 0
    
    if baseline_override is not None and baseline_override > 0:
        # compute delta from baseline
        delta = max(0.0, ratio - baseline_override)
        return min(100.0, (delta / baseline_override) * 200) # simplified scaling

    return min(100.0, ratio * 200)  # normalize to 0-100 without baseline


class FaceProcessor:
    def __init__(self, history_size: int = 120) -> None:
        self._mp_face_mesh = mp.solutions.face_mesh
        self._mesh = self._mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.ear_history: deque[float] = deque(maxlen=history_size)
        self.brow_history: deque[float] = deque(maxlen=history_size)
        
        self.baseline_ear: float | None = None
        self.baseline_brow: float | None = None
        self.baseline_iris: float | None = None

    def process_frame(self, frame: np.ndarray) -> dict[str, float] | None:
        if frame is None or frame.size == 0:
            return None

        try:
            height, width = frame.shape[:2]
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = self._mesh.process(rgb_frame)
        except Exception:
            return None

        if not result.multi_face_landmarks:
            return None

        landmarks = result.multi_face_landmarks[0].landmark
        left_ear = eye_aspect_ratio(landmarks, LEFT_EYE, width, height)
        right_ear = eye_aspect_ratio(landmarks, RIGHT_EYE, width, height)
        ear = round((left_ear + right_ear) / 2.0, 4)
        self.ear_history.append(ear)

        blink_rate = compute_blink_rate(list(self.ear_history), fps=10)
        
        brow_score = brow_furrow_score(landmarks, self.brow_history, width, height, baseline_override=self.baseline_brow)
        brow_distance = brow_furrow_distance(landmarks, width, height)
        
        iris_score = iris_load_score(landmarks, width, height, baseline_override=self.baseline_iris)

        # blink component scaling is untouched initially, but can incorporate EAR baseline if needed
        # We'll use blink rate but optionally could adjust if baseline EAR is very high/low
        blink_component = min(60.0, max(0.0, abs(blink_rate - 18.0) * 2.5))
        
        # EAR 30%, brow furrow 25%, jaw tension 25%, iris ratio 20%.
        # As jaw tension isn't fully implemented in this script yet, we'll map components
        # We assume blink_component represents EAR and jaw tension isn't tracked here yet 
        # (the prompt asks to integrate it but didn't provide jaw tension landmarks, we'll keep the blend normalized)
        # raw_score weightings approximation:
        # Actually, let's just combine the 3 active components based on relative 30:25:20 = 40:33.3:26.7
        # we will map blink rate to EAR score component (0-100)
        ear_score = (blink_component / 60.0) * 100
        brow_component = (brow_score / 40.0) * 100
        
        raw_score = round(min(100.0, (ear_score * 0.40) + (brow_component * 0.33) + (iris_score * 0.27)), 2)
        return {
            "ear": ear,
            "blinks_per_min": blink_rate,
            "brow_distance": round(float(brow_distance), 4),
            "raw_score": raw_score,
        }
