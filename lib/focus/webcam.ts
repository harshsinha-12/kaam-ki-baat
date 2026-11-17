import { calibrate, DEFAULT_SELECTOR, initialSelector, step, type SelectorZone } from "./selector";
import { webcamYawDeg, type WebcamPoseMatrix } from "./webcam-pose";
import { loadWebcamLandmarker } from "./webcam-mediapipe";

export type WebcamTrackingStatus = "idle" | "starting" | "calibrating" | "tracking" | "lost" | "unavailable";

export interface WebcamSnapshot {
  status: WebcamTrackingStatus;
  message: string;
  yawDeg: number | null;
  selectedZone: SelectorZone | null;
  canCalibrate: boolean;
}

export const initialWebcamSnapshot = (): WebcamSnapshot => ({
  status: "idle", message: "Camera off. Start when you are ready.", yawDeg: null, selectedZone: null, canCalibrate: false,
});

export interface WebcamLandmarker {
  detectForVideo(video: HTMLVideoElement, at: number): {
    faceLandmarks: readonly unknown[];
    facialTransformationMatrixes: readonly WebcamPoseMatrix[];
  };
  close(): void;
}

/** Dependency boundary for lifecycle tests; production always uses real media. */
export interface WebcamEnvironment {
  supported(): boolean;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  loadLandmarker(): Promise<WebcamLandmarker>;
  now(): number;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
}

function browserEnvironment(): WebcamEnvironment {
  return {
    supported: () => globalThis.isSecureContext === true && !!globalThis.navigator?.mediaDevices?.getUserMedia,
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    loadLandmarker: loadWebcamLandmarker,
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (id) => cancelAnimationFrame(id),
  };
}

function cameraError(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera permission denied. Allow camera access for this site and browser, then retry.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No usable camera is available. Connect a camera and retry.";
  if (name === "NotReadableError" || name === "AbortError") return "Camera could not start. Close other camera apps and retry.";
  return "Camera could not start. Check camera access and retry.";
}

/**
 * Owns one opt-in camera session. It emits selections only: no API calls,
 * activation, authentication, recording, audio capture or frame uploads.
 */
export class WebcamController {
  private readonly env: WebcamEnvironment;
  private generation = 0;
  private running = false;
  private stream: MediaStream | null = null;
  private landmarker: WebcamLandmarker | null = null;
  private frame: number | null = null;
  private selector = initialSelector();
  private latestYaw: number | null = null;
  private latestPoseAt = -Infinity;
  private lastVideoTime = -1;
  private lastFrameAt = 0;
  private lastInferenceAt = -Infinity;
  private snapshot = initialWebcamSnapshot();
  private readonly trackEnded = () => this.fail("Camera disconnected or permission was revoked. Reconnect or allow access, then retry.");

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly callbacks: { onSelect(zone: SelectorZone): void; onChange(snapshot: WebcamSnapshot): void },
    environment?: WebcamEnvironment,
  ) { this.env = environment ?? browserEnvironment(); }

  getSnapshot(): WebcamSnapshot { return { ...this.snapshot }; }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    this.publish("starting", "Waiting for camera permission…");
    if (!this.env.supported()) {
      this.fail("Camera unavailable. Use HTTPS or localhost in a browser with camera support.");
      return;
    }
    let stage: "camera" | "model" | "video" = "camera";
    try {
      const stream = await this.env.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 30 } },
      });
      if (!this.current(generation)) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      stream.getVideoTracks().forEach((track) => track.addEventListener("ended", this.trackEnded));
      if (!stream.getVideoTracks().some((track) => track.readyState === "live")) {
        this.fail("Camera disconnected before it could start. Reconnect and retry."); return;
      }
      stage = "model";
      this.publish("starting", "Loading the local face tracker…");
      const landmarker = await this.env.loadLandmarker();
      if (!this.current(generation)) { landmarker.close(); return; }
      this.landmarker = landmarker;
      stage = "video";
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = stream;
      await this.video.play();
      if (!this.current(generation)) return;
      this.lastFrameAt = this.env.now();
      this.publish("calibrating", "Face forward, then choose Calibrate camera. No zone is selected until calibration.");
      this.frame = this.env.requestFrame(() => this.tick(generation));
    } catch (error) {
      if (!this.current(generation)) return;
      this.fail(stage === "model"
        ? "Face tracker unavailable. Check your connection to the model download and retry."
        : stage === "video" ? "Camera video could not play. Retry in a supported browser." : cameraError(error));
    }
  }

  stop(message = "Camera off. Start when you are ready."): void {
    this.release();
    this.snapshot = initialWebcamSnapshot();
    this.publish("idle", message);
  }

  /** Explicit neutral capture. Never calibrate to stale/missing face data. */
  recenter(): boolean {
    const at = this.env.now();
    if (!this.running || this.latestYaw === null || at - this.latestPoseAt > DEFAULT_SELECTOR.maxGapMs) return false;
    // Start a fresh selector so center also requires a fresh dwell and can emit
    // after recalibration even if it was selected before tracking stopped.
    this.selector = calibrate(initialSelector(), this.latestYaw, at);
    this.publish("tracking", "Calibrated. Glance left or right to pick an agent; it stays picked when you look back.");
    return true;
  }

  private current(generation: number): boolean { return this.running && this.generation === generation; }

  private tick(generation: number): void {
    if (!this.current(generation)) return;
    const at = this.env.now();
    try {
      // One synchronous WASM inference per decoded frame, capped at 15 fps.
      // Never feed duplicate video frames/timestamps into MediaPipe.
      if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime && at - this.lastInferenceAt >= 1000 / 15) {
        this.lastVideoTime = this.video.currentTime;
        this.lastFrameAt = at;
        this.lastInferenceAt = at;
        const result = this.landmarker!.detectForVideo(this.video, at);
        const singleFace = result.faceLandmarks.length === 1 && result.facialTransformationMatrixes.length === 1;
        this.sample(singleFace ? webcamYawDeg(result.facialTransformationMatrixes[0]) : null, at,
          result.faceLandmarks.length > 1 ? "More than one face is visible. Keep only your face in view." : "Face not tracked. Face the camera in good light.");
      } else if (at - this.lastFrameAt > DEFAULT_SELECTOR.maxGapMs) {
        this.sample(null, at, "Camera frames stopped. Check the camera or restart tracking.");
      }
    } catch {
      this.fail("Face tracking failed. Restart the camera or use manual controls.");
      return;
    }
    if (this.current(generation)) this.frame = this.env.requestFrame(() => this.tick(generation));
  }

  private sample(yaw: number | null, at: number, lostMessage: string): void {
    const generation = this.generation;
    this.latestYaw = yaw;
    if (yaw !== null) this.latestPoseAt = at;
    const output = step(this.selector, yaw, at);
    this.selector = output.state;
    this.publish(yaw === null ? "lost" : this.selector.neutralYaw === null ? "calibrating" : "tracking",
      yaw === null ? lostMessage : this.selector.neutralYaw === null
        ? "Face found. Face forward, then choose Calibrate camera."
        : "Tracking locally. Hold a head turn briefly to select; activation stays explicit.");
    if (output.emit && this.current(generation)) this.callbacks.onSelect(output.emit);
  }

  private publish(status: WebcamTrackingStatus, message: string): void {
    this.snapshot = {
      status, message,
      yawDeg: this.latestYaw === null || this.selector.neutralYaw === null ? null : this.selector.filteredYaw,
      selectedZone: this.selector.selected,
      canCalibrate: this.running && this.latestYaw !== null && this.env.now() - this.latestPoseAt <= DEFAULT_SELECTOR.maxGapMs,
    };
    this.callbacks.onChange({ ...this.snapshot });
  }

  private fail(message: string): void {
    this.release();
    this.publish("unavailable", message);
  }

  private release(): void {
    this.running = false;
    ++this.generation;
    if (this.frame !== null) this.env.cancelFrame(this.frame);
    this.frame = null;
    this.stream?.getVideoTracks().forEach((track) => track.removeEventListener("ended", this.trackEnded));
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.selector = initialSelector();
    this.latestYaw = null;
    this.latestPoseAt = -Infinity;
    this.lastVideoTime = -1;
    this.lastInferenceAt = -Infinity;
  }
}
