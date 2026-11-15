import type { WebcamLandmarker } from "./webcam";

// Match the exact package version in package.json. Only static runtime/model
// assets are downloaded. Camera frames are passed directly to local WASM.
export const WEBCAM_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";
export const WEBCAM_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export async function loadWebcamLandmarker(): Promise<WebcamLandmarker> {
  const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
  const files = await FilesetResolver.forVisionTasks(WEBCAM_WASM_URL);
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: WEBCAM_MODEL_URL, delegate: "CPU" },
    runningMode: "VIDEO",
    // Reject ambiguous multi-face frames rather than choosing another person.
    // The shared selector supplies smoothing (MediaPipe only smooths numFaces=1).
    numFaces: 2,
    minFaceDetectionConfidence: 0.6,
    minFacePresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
  });
}
