/* This hook captures webcam frames, runs MediaPipe FaceLandmarker client-side to compute
   blink rate, brow tension, and EAR, then posts the facial load score to the backend
   at a fixed cadence — mirroring the useKeystrokeAnalyzer pattern. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Same 6-point eye landmark indices used in the backend face_processor.py
const LEFT_EYE = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
const BROW_LEFT = 334;
const BROW_RIGHT = 105;

const EAR_BLINK_THRESHOLD = 0.21;
const HISTORY_SIZE = 120;
const PROCESS_INTERVAL_MS = 200; // ~5 FPS

export type FaceMetrics = {
  ear: number;
  blinksPerMin: number;
  browDistance: number;
  rawScore: number;
};

function euclidean(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function eyeAspectRatio(
  landmarks: Array<{ x: number; y: number }>,
  indices: number[],
  w: number,
  h: number
): number {
  const coords = indices.map((i) => ({ x: landmarks[i].x * w, y: landmarks[i].y * h }));
  const vertA = euclidean(coords[1], coords[5]);
  const vertB = euclidean(coords[2], coords[4]);
  const horiz = euclidean(coords[0], coords[3]);
  if (horiz === 0) return 0;
  return (vertA + vertB) / (2 * horiz);
}

function computeBlinkRate(earHistory: number[], fps = 5): number {
  if (earHistory.length < 3) return 0;
  let blinkCount = 0;
  let eyesClosed = false;
  for (const ear of earHistory) {
    if (ear < EAR_BLINK_THRESHOLD && !eyesClosed) {
      blinkCount++;
      eyesClosed = true;
    } else if (ear >= EAR_BLINK_THRESHOLD) {
      eyesClosed = false;
    }
  }
  const minutesObserved = Math.max(earHistory.length / Math.max(fps, 1) / 60, 1 / 60);
  return Math.round(blinkCount / minutesObserved * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function useFaceAnalyzer(sessionId: string | null, enabled = true) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const earHistoryRef = useRef<number[]>([]);
  const browHistoryRef = useRef<number[]>([]);
  const lastProcessTimeRef = useRef(0);
  const rafRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  const [metrics, setMetrics] = useState<FaceMetrics>({
    ear: 0,
    blinksPerMin: 0,
    browDistance: 0,
    rawScore: 0,
  });
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize MediaPipe FaceLandmarker
  const initLandmarker = useCallback(async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
      landmarkerRef.current = landmarker;
    } catch (err) {
      console.error('FaceLandmarker init failed:', err);
      setError('Failed to load face detection model.');
    }
  }, []);

  // Start webcam
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsActive(true);
      setError(null);
    } catch (err) {
      console.error('Camera access denied:', err);
      setError('Camera access denied. Enable camera to use face tracking.');
      setIsActive(false);
    }
  }, []);

  // Process frame loop
  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const now = performance.now();
    if (now - lastProcessTimeRef.current < PROCESS_INTERVAL_MS) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }
    lastProcessTimeRef.current = now;

    try {
      const result = landmarker.detectForVideo(video, now);
      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        const landmarks = result.faceLandmarks[0];
        const w = video.videoWidth;
        const h = video.videoHeight;

        // EAR calculation
        const leftEar = eyeAspectRatio(landmarks, LEFT_EYE, w, h);
        const rightEar = eyeAspectRatio(landmarks, RIGHT_EYE, w, h);
        const ear = Math.round(((leftEar + rightEar) / 2) * 10000) / 10000;

        // Update EAR history (capped)
        const earHist = earHistoryRef.current;
        earHist.push(ear);
        if (earHist.length > HISTORY_SIZE) earHist.shift();

        // Blink rate
        const blinksPerMin = computeBlinkRate(earHist, 5);

        // Brow furrow
        const browDist = Math.sqrt(
          (landmarks[BROW_LEFT].x - landmarks[BROW_RIGHT].x) ** 2 +
            (landmarks[BROW_LEFT].y - landmarks[BROW_RIGHT].y) ** 2
        );
        const browHist = browHistoryRef.current;
        browHist.push(browDist);
        if (browHist.length > HISTORY_SIZE) browHist.shift();

        const baseline = Math.max(
          browHist.reduce((s, v) => s + v, 0) / browHist.length,
          1e-6
        );
        const contraction = clamp((baseline - browDist) / baseline, 0, 1);
        const browScore = Math.round(contraction * 40 * 100) / 100;

        // Composite score (same formula as backend)
        const blinkComponent = clamp(Math.abs(blinksPerMin - 18) * 2.5, 0, 60);
        const rawScore = clamp(
          Math.round((blinkComponent + browScore) * 100) / 100,
          0,
          100
        );

        setMetrics({
          ear: Math.round(ear * 10000) / 10000,
          blinksPerMin: Math.round(blinksPerMin * 100) / 100,
          browDistance: Math.round(browDist * 10000) / 10000,
          rawScore: Math.round(rawScore * 100) / 100,
        });
      }
    } catch {
      // Silently skip failed frames
    }

    rafRef.current = requestAnimationFrame(processFrame);
  }, []);

  // Lifecycle: init + start camera when enabled
  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    (async () => {
      await initLandmarker();
      if (cancelled) return;
      await startCamera();
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(processFrame);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
      setIsActive(false);
    };
  }, [enabled, initLandmarker, startCamera, processFrame]);

  // POST metrics to backend every 5s (mirrors keystroke hook pattern)
  const metricsRef = useRef(metrics);
  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    if (!enabled || !sessionId) return undefined;

    const interval = window.setInterval(async () => {
      const current = metricsRef.current;
      try {
        await fetch('/signal/face', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            ear: current.ear,
            blinks_per_min: current.blinksPerMin,
            brow_distance: current.browDistance,
            raw_score: current.rawScore,
          }),
        });
      } catch {
        // Silent failure keeps the UI responsive when the backend is restarting.
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [enabled, sessionId]);

  // Create hidden canvas for frame extraction if needed
  useEffect(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
  }, []);

  return useMemo(
    () => ({ metrics, videoRef, isActive, error }),
    [metrics, isActive, error]
  );
}
