import type { FocusProvider, Zone } from "../zones/contracts";

export interface FocusInput { provider: FocusProvider; epoch: number }
export interface ConfirmedFocus { zone: Zone | null; provider: FocusProvider | null; seq: number; activeZone: Zone | null; inputEpoch: number | null }
export const INPUT_STATES = ["unavailable", "permission_required", "denied", "waiting", "uncalibrated", "tracking", "disconnected", "stopped"] as const;
export type InputState = typeof INPUT_STATES[number];
export interface InputStatus {
  state: InputState;
  calibrated: boolean;
  lastSampleAt: string | null;
  receivedAt: string;
  fresh: boolean;
}
export interface FocusSnapshot {
  ok: true;
  input: FocusInput;
  focus: ConfirmedFocus;
  status: InputStatus | null;
}
