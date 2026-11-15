import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebcamController, type WebcamEnvironment, type WebcamLandmarker, type WebcamSnapshot } from "../lib/focus/webcam";
import { webcamYawDeg, type WebcamPoseMatrix } from "../lib/focus/webcam-pose";
import type { SelectorZone } from "../lib/focus/selector";

function pose(yaw: number, scale = 1): WebcamPoseMatrix {
  const angle = yaw * Math.PI / 180;
  return { rows: 4, columns: 4, data: [
    scale * Math.cos(angle), 0, -scale * Math.sin(angle), 0,
    0, scale, 0, 0,
    scale * Math.sin(angle), 0, scale * Math.cos(angle), 0,
    123, 456, 789, 1,
  ] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class Track extends EventTarget {
  readyState: MediaStreamTrackState = "live";
  stops = 0;
  stop() { this.stops++; this.readyState = "ended"; }
  disconnect() { this.readyState = "ended"; this.dispatchEvent(new Event("ended")); }
}

function harness(overrides: Partial<WebcamEnvironment> = {}) {
  const track = new Track();
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  const video = {
    srcObject: null, muted: false, playsInline: false, readyState: 2, currentTime: 0,
    play: async () => {}, pause: () => {},
  } as unknown as HTMLVideoElement;
  let time = 0, id = 0, cameras = 0, models = 0, inferences = 0, closed = 0;
  let result: ReturnType<WebcamLandmarker["detectForVideo"]> = { faceLandmarks: [[]], facialTransformationMatrixes: [pose(0)] };
  const queued = new Map<number, FrameRequestCallback>();
  const constraints: MediaStreamConstraints[] = [];
  const landmarker: WebcamLandmarker = {
    detectForVideo: () => { inferences++; return result; }, close: () => { closed++; },
  };
  const env: WebcamEnvironment = {
    supported: () => true,
    getUserMedia: async (input) => { cameras++; constraints.push(input); return stream; },
    loadLandmarker: async () => { models++; return landmarker; },
    now: () => time,
    requestFrame: (callback) => { queued.set(++id, callback); return id; },
    cancelFrame: (key) => { queued.delete(key); },
    ...overrides,
  };
  const selections: SelectorZone[] = [], snapshots: WebcamSnapshot[] = [];
  const controller = new WebcamController(video, { onSelect: (zone) => selections.push(zone), onChange: (snapshot) => snapshots.push(snapshot) }, env);
  return {
    controller, track, stream, video, env, landmarker, selections, snapshots, constraints, queued,
    stats: () => ({ cameras, models, inferences, closed }),
    at(value: number) { time = value; },
    frame(at: number, yaw: number | null = 0, faceCount = yaw === null ? 0 : 1, newFrame = true) {
      time = at;
      result = { faceLandmarks: Array(faceCount).fill([]), facialTransformationMatrixes: yaw === null ? [] : Array(faceCount).fill(pose(yaw)) };
      if (newFrame) video.currentTime += 0.1;
      const work = [...queued.values()]; queued.clear(); work.forEach((callback) => callback(time));
    },
    hold(from: number, to: number, yaw: number | null) { for (let at = from; at <= to; at += 100) this.frame(at, yaw); },
  };
}

describe("webcam pose normalization (synthetic matrices, not camera evidence)", () => {
  it("matches positive=user-left, negative=user-right without translation/scale affecting yaw", () => {
    for (const yaw of [-60, -35, 0, 35, 60]) {
      assert.ok(Math.abs(webcamYawDeg(pose(yaw, 2))! - yaw) < 0.00001);
    }
  });
  it("rejects absent, malformed, nonfinite and degenerate pose data", () => {
    assert.equal(webcamYawDeg(undefined), null);
    assert.equal(webcamYawDeg({ ...pose(0), rows: 3 }), null);
    assert.equal(webcamYawDeg({ ...pose(0), data: [1, 2] }), null);
    assert.equal(webcamYawDeg({ ...pose(0), data: Array(16).fill(NaN) }), null);
    assert.equal(webcamYawDeg({ ...pose(0), data: Array(16).fill(0) }), null);
  });
});

describe("webcam controller lifecycle (mock media, never physical verification)", () => {
  it("is off by default, starts once, requests no audio and does not auto-calibrate", async () => {
    const h = harness();
    assert.equal(h.controller.getSnapshot().status, "idle");
    assert.equal(h.stats().cameras, 0);
    await Promise.all([h.controller.start(), h.controller.start()]);
    assert.equal(h.stats().cameras, 1);
    assert.equal(h.constraints[0].audio, false);
    assert.equal(h.video.srcObject, h.stream);
    h.hold(100, 1500, 35);
    assert.equal(h.controller.getSnapshot().status, "calibrating");
    assert.deepEqual(h.selections, []);
    h.controller.stop();
    assert.equal(h.track.stops, 1);
    assert.equal(h.stats().closed, 1);
    assert.equal(h.video.srcObject, null);
    assert.equal(h.queued.size, 0);
  });

  it("denied camera permission is unavailable and never loads the model or emits", async () => {
    const h = harness({ getUserMedia: async () => { throw new DOMException("Permission denied", "NotAllowedError"); } });
    await h.controller.start();
    assert.equal(h.controller.getSnapshot().status, "unavailable");
    assert.match(h.controller.getSnapshot().message, /permission denied/i);
    assert.equal(h.stats().models, 0);
    assert.equal(h.controller.recenter(), false);
    assert.deepEqual(h.selections, []);
  });

  it("unsupported, missing and busy cameras report honest unavailable states", async () => {
    const unsupported = harness({ supported: () => false });
    await unsupported.controller.start();
    assert.equal(unsupported.controller.getSnapshot().status, "unavailable");
    assert.equal(unsupported.stats().cameras, 0);
    for (const [name, message] of [["NotFoundError", /No usable camera/], ["NotReadableError", /other camera apps/]] as const) {
      const h = harness({ getUserMedia: async () => { throw new DOMException("failure", name); } });
      await h.controller.start();
      assert.equal(h.controller.getSnapshot().status, "unavailable");
      assert.match(h.controller.getSnapshot().message, message);
    }
  });

  it("stopping while permission is pending releases a late stream without restarting", async () => {
    const permission = deferred<MediaStream>();
    const h = harness({ getUserMedia: () => permission.promise });
    const starting = h.controller.start();
    h.controller.stop();
    permission.resolve(h.stream);
    await starting;
    assert.equal(h.controller.getSnapshot().status, "idle");
    assert.equal(h.track.stops, 1);
    assert.equal(h.stats().models, 0);
    assert.equal(h.queued.size, 0);
    assert.deepEqual(h.selections, []);
  });

  it("stopping during model loading closes the late model and stops the camera", async () => {
    const model = deferred<WebcamLandmarker>();
    const h = harness({ loadLandmarker: () => model.promise });
    const starting = h.controller.start();
    await Promise.resolve();
    h.controller.stop();
    assert.equal(h.track.stops, 1);
    model.resolve(h.landmarker);
    await starting;
    assert.equal(h.stats().closed, 1);
    assert.equal(h.controller.getSnapshot().status, "idle");
    assert.equal(h.queued.size, 0);
  });

  it("model and video startup failures release camera/resources rather than simulating tracking", async () => {
    const missingModel = harness({ loadLandmarker: async () => { throw new Error("asset unavailable"); } });
    await missingModel.controller.start();
    assert.equal(missingModel.controller.getSnapshot().status, "unavailable");
    assert.match(missingModel.controller.getSnapshot().message, /Face tracker unavailable/);
    assert.equal(missingModel.track.stops, 1);
    const badVideo = harness();
    badVideo.video.play = async () => { throw new Error("decoder failed"); };
    await badVideo.controller.start();
    assert.equal(badVideo.controller.getSnapshot().status, "unavailable");
    assert.equal(badVideo.track.stops, 1);
    assert.equal(badVideo.stats().closed, 1);
  });

  it("requires a fresh single face for calibration; missing/multiple faces cannot select", async () => {
    const h = harness();
    await h.controller.start();
    assert.equal(h.controller.recenter(), false);
    h.frame(100, null);
    assert.equal(h.controller.getSnapshot().status, "lost");
    assert.equal(h.controller.recenter(), false);
    h.frame(200, 0, 2);
    assert.match(h.controller.getSnapshot().message, /More than one face/);
    assert.equal(h.controller.recenter(), false);
    h.frame(300, 0);
    assert.equal(h.controller.getSnapshot().status, "calibrating");
    h.at(1000);
    assert.equal(h.controller.recenter(), false, "stale last pose is not a calibration");
    assert.deepEqual(h.selections, []);
    h.controller.stop();
  });

  it("feeds calibrated pose into the shared selector for center/left/right dwell-confirmed selections", async () => {
    const h = harness();
    await h.controller.start();
    h.frame(100, 10);
    assert.equal(h.controller.recenter(), true);
    h.hold(200, 700, 10);
    h.hold(800, 2300, 45);
    h.hold(2400, 4100, -25);
    assert.deepEqual(h.selections, ["leader_desk", "team_memory", "code_navigator"]);
    assert.equal(h.controller.getSnapshot().selectedZone, "code_navigator");
    assert.equal(h.controller.getSnapshot().status, "tracking");
    h.controller.stop();
  });

  it("does not select from a glance or allow lost-time to count as dwell", async () => {
    const h = harness();
    await h.controller.start(); h.frame(100, 0); h.controller.recenter();
    h.hold(200, 700, 0);
    h.frame(800, 40); h.frame(900, 40); h.hold(1000, 1600, 0);
    assert.deepEqual(h.selections, ["leader_desk"]);
    h.hold(1700, 1900, 40);
    h.frame(2000, null);
    h.frame(3000, 40);
    h.hold(3100, 3400, 40);
    assert.deepEqual(h.selections, ["leader_desk"], "resume needs a new full dwell");
    h.frame(3500, 40);
    assert.deepEqual(h.selections, ["leader_desk", "team_memory"]);
    h.controller.stop();
  });

  it("freezes on missing/stalled video, rejects stale calibration and resumes without phantom changes", async () => {
    const h = harness();
    await h.controller.start(); h.frame(100); h.controller.recenter(); h.hold(200, 700, 0);
    const inferred = h.stats().inferences;
    h.frame(750, 40, 1, false);
    assert.equal(h.stats().inferences, inferred, "duplicate video frame is not inferred");
    h.frame(1400, 40, 1, false);
    assert.equal(h.controller.getSnapshot().status, "lost");
    assert.equal(h.controller.recenter(), false);
    assert.equal(h.controller.getSnapshot().selectedZone, "leader_desk");
    h.hold(1500, 2200, 0);
    assert.equal(h.controller.getSnapshot().status, "tracking");
    assert.deepEqual(h.selections, ["leader_desk"]);
    h.controller.stop();
  });

  it("recenter clears the old selection and requires another full dwell", async () => {
    const h = harness();
    await h.controller.start(); h.frame(100); h.controller.recenter(); h.hold(200, 700, 0);
    assert.deepEqual(h.selections, ["leader_desk"]);
    h.controller.recenter();
    assert.equal(h.controller.getSnapshot().selectedZone, null);
    h.hold(800, 1100, 0);
    assert.deepEqual(h.selections, ["leader_desk"]);
    h.frame(1200, 0);
    assert.deepEqual(h.selections, ["leader_desk", "leader_desk"]);
    h.controller.stop();
  });

  it("disconnect/revocation immediately releases resources; queued old frames cannot emit", async () => {
    const h = harness();
    await h.controller.start(); h.frame(100); h.controller.recenter();
    const staleFrame = [...h.queued.values()][0];
    h.track.disconnect();
    assert.equal(h.controller.getSnapshot().status, "unavailable");
    assert.match(h.controller.getSnapshot().message, /disconnected or permission/);
    staleFrame(2000);
    assert.equal(h.stats().closed, 1);
    assert.equal(h.track.stops, 1);
    assert.equal(h.video.srcObject, null);
    assert.equal(h.queued.size, 0);
    assert.deepEqual(h.selections, []);
  });

  it("a stop during a status callback suppresses that frame's selection", async () => {
    const h = harness();
    let stopped = false;
    const selected: SelectorZone[] = [];
    let tracker!: WebcamController;
    tracker = new WebcamController(h.video, {
      onSelect: (zone) => selected.push(zone),
      onChange: (snapshot) => {
        if (snapshot.selectedZone && !stopped) { stopped = true; tracker.stop(); }
      },
    }, h.env);
    await tracker.start(); h.frame(100); tracker.recenter(); h.hold(200, 700, 0);
    assert.equal(tracker.getSnapshot().status, "idle");
    assert.deepEqual(selected, []);
  });
});
