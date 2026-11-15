import type { EventStore } from "../store/event-store";
import { ACTIVATION_METHODS, FOCUS_PROVIDERS, ZONES, type ActivationMethod, type FocusProvider, type Zone } from "./contracts";
import type { Actor } from "./identity";
import { ev, focusInput, focusInputStatus, focusState } from "./state";
import { INPUT_STATES, type FocusSnapshot, type InputState } from "../focus/input-contracts";

// Server side of FocusInput. Providers (AirPods companion, webcam, manual) send
// low-privilege selection events. Selection never grants anything; activation
// is a separate, explicit act that is authorized here.

export type FocusResult =
  | { ok: true; zone: Zone; seq: number; locked: boolean; lockReason?: string }
  | { ok: false; status: 400 | 409; reason: string };

export function zoneAccess(actor: Actor, zone: Zone): { allowed: true } | { allowed: false; reason: string } {
  if (zone === "leader_desk") {
    if (actor.role !== "leader") return { allowed: false, reason: "Leader Desk is for the verified team leader only" };
    if (!actor.stepUpFresh) return { allowed: false, reason: "leader must re-verify (step-up) before using the Leader Desk" };
  }
  if (zone === "code_navigator" && !actor.repoAccess) return { allowed: false, reason: "no access to the repository" };
  return { allowed: true };
}

export async function recordFocus(store: EventStore, actor: Actor, body: Record<string, unknown>): Promise<FocusResult> {
  const zone = body.zone as Zone;
  const provider = body.provider as FocusProvider;
  const seq = Number(body.seq);
  if (!ZONES.includes(zone)) return { ok: false, status: 400, reason: "unknown zone" };
  if (!FOCUS_PROVIDERS.includes(provider)) return { ok: false, status: 400, reason: "unknown focus provider" };
  if (!Number.isSafeInteger(seq) || seq < 1) return { ok: false, status: 400, reason: "seq must be a positive safe integer" };
  if (Object.keys(body).some((k) => !["zone", "provider", "seq", "confidence", "inputEpoch", "session_token", "sessionToken"].includes(k)))
    return { ok: false, status: 400, reason: "unexpected fields in focus event" }; // e.g. a forged "role" or "activate"
  const access = zoneAccess(actor, zone);
  return store.appendGuarded<FocusResult>((events) => {
    const input = focusInput(events, actor.sessionId);
    // Legacy clients work until this device explicitly opts into arbitration.
    // After the first switch, even old clients cannot bypass the active input.
    if (input.epoch > 0 && (input.provider !== provider || body.inputEpoch !== input.epoch))
      return { reject: { ok: false, status: 409, reason: "inactive provider or stale input epoch; refresh focus-input" } };
    const last = focusState(events, actor.sessionId);
    if (seq <= last.seq) return { reject: { ok: false, status: 409, reason: `stale or duplicate focus event (seq ${seq} <= ${last.seq})` } };
    return {
      append: ev("focus", actor.sessionId, { zone, provider, seq, inputEpoch: input.epoch, confidence: Number(body.confidence ?? 1) }),
      result: { ok: true, zone, seq, locked: !access.allowed, lockReason: access.allowed ? undefined : access.reason },
    };
  });
}

export async function readFocusInput(store: EventStore, actor: Actor): Promise<FocusSnapshot> {
  const events = await store.all();
  return { ok: true, input: focusInput(events, actor.sessionId), focus: focusState(events, actor.sessionId), status: focusInputStatus(events, actor.sessionId) };
}

type InputResult = FocusSnapshot | { ok: false; status: 400 | 409; reason: string };

export async function selectFocusInput(store: EventStore, actor: Actor, body: Record<string, unknown>): Promise<InputResult> {
  if (!FOCUS_PROVIDERS.includes(body.provider as FocusProvider) || Object.keys(body).some(k => k !== "provider"))
    return { ok: false, status: 400, reason: "provide only a known input provider" };
  // The switch and all focus checks share the store's write lock. Even an
  // in-flight event from the previous provider cannot cross this boundary.
  const expected = await store.appendGuarded<number>(events => {
    const input = focusInput(events, actor.sessionId);
    const epoch = input.epoch + 1;
    return { append: ev("focus_input", actor.sessionId, { provider: body.provider, epoch }), result: epoch };
  });
  const result = await readFocusInput(store, actor);
  return result.input.epoch === expected ? result : { ok: false, status: 409, reason: "input changed again; refresh focus-input" };
}

type StatusResult = { ok: true } | { ok: false; status: 400 | 409; reason: string };
export async function recordFocusInputStatus(store: EventStore, actor: Actor, body: Record<string, unknown>): Promise<StatusResult> {
  if (Object.keys(body).some(k => !["inputEpoch", "state", "calibrated", "lastSampleAt"].includes(k)) ||
      !Number.isSafeInteger(body.inputEpoch) || !INPUT_STATES.includes(body.state as InputState) || typeof body.calibrated !== "boolean" ||
      !(body.lastSampleAt === null || typeof body.lastSampleAt === "string" && Number.isFinite(Date.parse(body.lastSampleAt))))
    return { ok: false, status: 400, reason: "invalid input status" };
  return store.appendGuarded<StatusResult>(events => {
    const input = focusInput(events, actor.sessionId);
    if (input.provider !== "airpods" || input.epoch === 0 || input.epoch !== body.inputEpoch)
      return { reject: { ok: false as const, status: 409 as const, reason: "inactive provider or stale input epoch" } };
    return { append: ev("focus_input_status", actor.sessionId, body), result: { ok: true as const } };
  });
}

export type ActivationResult = { ok: true; zone: Zone } | { ok: false; status: 400 | 403 | 409; reason: string };

export async function activateZone(store: EventStore, actor: Actor, body: Record<string, unknown>): Promise<ActivationResult> {
  const zone = body.zone as Zone;
  const method = body.method as ActivationMethod;
  if (!ZONES.includes(zone)) return { ok: false, status: 400, reason: "unknown zone" };
  if (!ACTIVATION_METHODS.includes(method)) return { ok: false, status: 400, reason: "activation must be explicit (tap, click, keyboard, voice command or double nod)" };
  const access = zoneAccess(actor, zone);
  if (!access.allowed) return { ok: false, status: 403, reason: access.reason };
  return store.appendGuarded<ActivationResult>((events) => {
    const f = focusState(events, actor.sessionId);
    const input = focusInput(events, actor.sessionId);
    // Supplying the new epoch cannot make a pre-switch selection current.
    // The newly selected provider must confirm a fresh selection first.
    if (input.epoch > 0 && (f.inputEpoch !== input.epoch || f.provider !== input.provider))
      return { reject: { ok: false, status: 409, reason: "input changed; select again before activating" } };
    if (body.expectedSeq !== undefined && body.expectedSeq !== f.seq || body.inputEpoch !== undefined && body.inputEpoch !== focusInput(events, actor.sessionId).epoch)
      return { reject: { ok: false, status: 409, reason: "selection changed; review it before activating" } };
    // Activation applies to the zone the user has SELECTED; manual providers select and activate in one gesture.
    if (f.zone !== zone && method !== "click" && method !== "tap" && method !== "keyboard")
      return { reject: { ok: false, status: 409, reason: "activate the zone you have selected" } };
    return { append: ev("activation", actor.sessionId, { zone, method }), result: { ok: true, zone } };
  });
}
