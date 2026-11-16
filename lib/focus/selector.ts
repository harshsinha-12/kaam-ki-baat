// Client-side head-turn selector shared by the webcam (MediaPipe yaw) provider
// and mirrored by the native AirPods companion (CoreMotion yaw). Pure and
// deterministic so it can be unit-tested without hardware.
//
// Pipeline per sample: calibrate neutral -> EMA filter -> zone with hysteresis
// -> dwell before emitting a selection -> slow re-centering when idle.
// It only ever emits SELECTIONS. Activation is a separate explicit gesture.
//
// Glance and latch: a 30 to 40 degree glance to a side selects that agent within
// about half a second, and the choice STAYS when you look back at the screen, so
// you can activate and talk without holding your head turned. Leader Desk (centre)
// is chosen by keeping your head at the screen for `centerHoldMs`, or explicitly
// with the up arrow / a click, which the UI handles.

export type SelectorZone = "team_memory" | "leader_desk" | "code_navigator";

export interface SelectorConfig {
  enterDeg: number; // |yaw| beyond this enters a side zone
  exitDeg: number; // |yaw| must fall below this to leave it (hysteresis, < enterDeg)
  dwellMs: number; // must stay in a side zone this long before selecting it
  centerHoldMs: number; // facing the screen this long returns the selection to Leader Desk
  alpha: number; // EMA smoothing 0..1 (higher = less smoothing)
  maxGapMs: number; // samples further apart than this = tracking lost
  recenterPerSec: number; // fraction of drift absorbed per second while centered
}

export const DEFAULT_SELECTOR: SelectorConfig = { enterDeg: 24, exitDeg: 12, dwellMs: 300, centerHoldMs: 4000, alpha: 0.35, maxGapMs: 500, recenterPerSec: 0.05 };

export interface SelectorState {
  neutralYaw: number | null;
  filteredYaw: number;
  candidate: SelectorZone;
  candidateSince: number;
  selected: SelectorZone | null;
  lastSampleAt: number | null;
  tracking: "uncalibrated" | "ok" | "lost";
}

export const initialSelector = (): SelectorState => ({
  neutralYaw: null, filteredYaw: 0, candidate: "leader_desk", candidateSince: 0, selected: null, lastSampleAt: null, tracking: "uncalibrated",
});

/** Capture the user's comfortable "front" as neutral. */
export function calibrate(state: SelectorState, yawDeg: number, at: number): SelectorState {
  return { ...state, neutralYaw: yawDeg, filteredYaw: 0, candidate: "leader_desk", candidateSince: at, lastSampleAt: at, tracking: "ok" };
}

export interface SelectorOutput {
  state: SelectorState;
  emit: SelectorZone | null; // new selection to send to the server (once per change)
}

/**
 * Feed one yaw sample in degrees (positive = user turned to THEIR left), or null
 * when the face / headphones are not tracked (camera lost, bad light, AirPods out).
 * Sign convention is normalized by each provider before calling this.
 */
export function step(state: SelectorState, yawDeg: number | null, at: number, cfg: SelectorConfig = DEFAULT_SELECTOR): SelectorOutput {
  if (state.neutralYaw === null) return { state, emit: null };
  if (yawDeg === null || !Number.isFinite(yawDeg)) {
    // Tracking lost: freeze. Never infer a selection from missing data.
    return { state: { ...state, tracking: "lost", lastSampleAt: at }, emit: null };
  }
  const gap = state.lastSampleAt === null ? 0 : at - state.lastSampleAt;
  const resumed = state.tracking === "lost" || gap > cfg.maxGapMs;
  const rel = wrap(yawDeg - state.neutralYaw);
  // After a gap, restart the filter instead of blending stale values (avoids a phantom swing).
  const filtered = resumed ? rel : state.filteredYaw + cfg.alpha * (rel - state.filteredYaw);

  const side = (deg: number): SelectorZone => (deg >= 0 ? "team_memory" : "code_navigator");
  let zone: SelectorZone;
  const inSide = state.candidate !== "leader_desk";
  if (inSide) zone = Math.abs(filtered) < cfg.exitDeg ? "leader_desk" : side(filtered);
  else zone = Math.abs(filtered) > cfg.enterDeg ? side(filtered) : "leader_desk";

  let next: SelectorState = { ...state, filteredYaw: filtered, lastSampleAt: at, tracking: "ok" };
  if (zone !== state.candidate || resumed) next = { ...next, candidate: zone, candidateSince: at };

  // Slow drift correction while looking roughly forward.
  if (zone === "leader_desk" && Math.abs(filtered) < cfg.exitDeg && gap > 0) {
    const k = Math.min(1, (cfg.recenterPerSec * gap) / 1000);
    next = { ...next, neutralYaw: state.neutralYaw + k * wrap(yawDeg - state.neutralYaw) };
  }

  let emit: SelectorZone | null = null;
  // Sides select after a short dwell; the centre needs a long hold so looking
  // back at the screen does not undo a glance.
  const needed = next.candidate === "leader_desk" && next.selected !== null ? cfg.centerHoldMs : cfg.dwellMs;
  if (at - next.candidateSince >= needed && next.selected !== next.candidate) {
    next = { ...next, selected: next.candidate };
    emit = next.candidate;
  }
  return { state: next, emit };
}

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
