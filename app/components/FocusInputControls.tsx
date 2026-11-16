"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserFocusController } from "@/lib/focus/browser-controller";
import type { ConfirmedFocus, FocusSnapshot } from "@/lib/focus/input-contracts";
import type { FocusProvider, Zone } from "@/lib/zones/contracts";
import { WebcamHeadTracker, type WebcamTrackingStatus } from "./WebcamHeadTracker";
import { sessionToken } from "../zones/client";
import styles from "./spatial.module.css";

export const ZONE_LABELS: Record<Zone, string> = { team_memory: "Team Memory", leader_desk: "Leader Desk", code_navigator: "Code Navigator" };
type Access = Record<Zone, { allowed: boolean; reason?: string }>;

export function FocusInputControls({ onConfirmedFocus, compact = false }: { onConfirmedFocus: (focus: ConfirmedFocus) => void; compact?: boolean }) {
  const [draft, setDraft] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [snapshot, setSnapshot] = useState<FocusSnapshot | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [connection, setConnection] = useState("disconnected");
  const [error, setError] = useState("");
  const [changing, setChanging] = useState(false);
  const [webcamStatus, setWebcamStatus] = useState<WebcamTrackingStatus>("idle");
  const controller = useRef<BrowserFocusController | null>(null);
  const confirmedCallback = useRef(onConfirmedFocus);
  confirmedCallback.current = onConfirmedFocus;
  const lastSequence = useRef(-1);

  useEffect(() => { setDeviceToken(sessionToken()); }, []);

  useEffect(() => {
    if (!deviceToken) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    lastSequence.current = -1;
    setConnection("connecting"); setError(""); setSnapshot(null); setAccess(null);
    const request = async (action: string, body?: Record<string, unknown>) => {
      const timeout = new AbortController();
      const cancel = () => timeout.abort();
      abort.signal.addEventListener("abort", cancel, { once: true });
      if (abort.signal.aborted) cancel();
      const id = setTimeout(cancel, 6000);
      try {
        const response = await fetch(`/api/zones/${action}`, {
          method: body ? "POST" : "GET", cache: "no-store", signal: timeout.signal,
          headers: { Authorization: `Session ${deviceToken}`, "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Focus service unavailable. Reconnect when the service is ready.");
        const value = await response.json() as Record<string, unknown>;
        if (!response.ok || value.ok !== true) {
          if (alive && [401, 403].includes(response.status)) { setConnection("unavailable"); setAccess(null); }
          throw new Error(typeof value.error === "string" ? value.error : "Device session unavailable.");
        }
        return value;
      } finally { clearTimeout(id); abort.signal.removeEventListener("abort", cancel); }
    };
    const focus = new BrowserFocusController(request, next => {
      if (!alive) return;
      setSnapshot(next); setConnection("connected");
      if (next.focus.seq > lastSequence.current && next.focus.provider === next.input.provider && next.focus.inputEpoch === next.input.epoch) {
        lastSequence.current = next.focus.seq;
        confirmedCallback.current(next.focus);
      }
    });
    controller.current = focus;
    const poll = async () => {
      try {
        const me = await request("me");
        if (!alive) return;
        setAccess(me.zones as Access);
        await focus.refresh();
        if (focus.snapshot?.input.epoch === 0) await focus.switchInput("manual");
        if (alive) setError("");
      } catch (e) {
        if (alive) { setConnection("unavailable"); setAccess(null); setError(e instanceof Error ? e.message : "Device session unavailable."); }
      } finally { if (alive) timer = setTimeout(poll, 1000); }
    };
    void poll();
    return () => { alive = false; clearTimeout(timer); abort.abort(); focus.dispose(); if (controller.current === focus) controller.current = null; };
  }, [deviceToken]);

  const switchInput = useCallback(async (provider: FocusProvider) => {
    if (!controller.current) return;
    setChanging(true); setError("");
    try { await controller.current.switchInput(provider); }
    catch (e) { setConnection("unavailable"); setError(e instanceof Error ? e.message : "Input could not change."); }
    finally { setChanging(false); }
  }, []);
  const select = useCallback((zone: Zone, lease?: number) => {
    if (!controller.current) return;
    void controller.current.select(zone, lease).catch(e => setError(e instanceof Error ? e.message : "Focus could not be saved."));
  }, []);

  useEffect(() => {
    if (snapshot?.input.provider !== "manual" || connection !== "connected" || changing) return;
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || el.closest("input, textarea, select, button, a, [contenteditable=true]")) return;
      const target: Record<string, Zone> = { ArrowLeft: "team_memory", ArrowUp: "leader_desk", ArrowRight: "code_navigator" };
      if (target[e.key]) { e.preventDefault(); select(target[e.key]); }
      if (e.key === "Enter") { e.preventDefault(); void controller.current?.activate("keyboard").catch(e => setError(e.message)); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [snapshot?.input.provider, connection, changing, select]);

  const disconnect = async () => {
    // Stop the native writer too. If the server cannot confirm manual mode,
    // retain the connection and explain the failure instead of claiming stopped.
    try {
      if (controller.current) await controller.current.switchInput("manual");
      controller.current?.dispose(); setDeviceToken(""); setSnapshot(null); setAccess(null); setConnection("disconnected");
      try { sessionStorage.removeItem("kkb_session"); } catch { /* private mode */ }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not stop the active input."); }
  };
  const forget = () => {
    controller.current?.dispose(); setDeviceToken(""); setSnapshot(null); setAccess(null); setConnection("disconnected"); setError("");
    try { sessionStorage.removeItem("kkb_session"); } catch { /* private mode */ }
  };

  const provider = snapshot?.input.provider ?? "manual";
  const focus = snapshot?.focus;
  const currentSelection = !!focus?.zone && focus.provider === provider && focus.inputEpoch === snapshot?.input.epoch;
  const zoneAccess = focus?.zone ? access?.[focus.zone] : null;
  const airpods = snapshot?.status;
  const airpodsFresh = airpods?.fresh && Date.now() - Date.parse(airpods.receivedAt) <= 6000;
  const webcamLease = controller.current?.lease;
  return <section className={`${styles.inputPanel} ${compact ? styles.compactInput : ""}`} aria-label="Focus input controls">
    <div className={styles.inputTop}><div><span className={styles.eyebrow}>Workspace control</span><h3>Focus input</h3></div><span className={styles.connectionBadge} data-state={connection}>{changing ? "Switching…" : connection === "connected" ? "Controls connected" : connection}</span></div>
    {!deviceToken ? <form className={styles.connect} onSubmit={e => {
      e.preventDefault(); const token = draft.trim(); setDeviceToken(token); setDraft("");
      try { sessionStorage.setItem("kkb_session", token); } catch { /* private mode */ }
    }}>
      <label htmlFor="focus-device-token">Connect a device session</label>
      <input id="focus-device-token" type="password" autoComplete="off" required minLength={16} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Device session token" />
      <button type="submit">Connect focus controls</button>
      <p>Your device session controls selection and explicit activation. The participant call session below keeps its existing evidence scope.</p>
    </form> : <>
      <fieldset className={styles.inputSelector} disabled={connection !== "connected" || changing}>
        <legend>Choose one input</legend>
        {(["manual", "webcam", "airpods"] as const).map(input => <label key={input} className={styles.inputChoice} data-active={provider === input}><input type="radio" name="focus-input" aria-label={input === "manual" ? "Manual" : input === "webcam" ? "Webcam" : "AirPods"} checked={provider === input} onChange={() => void switchInput(input)} /><span><strong>{input === "manual" ? "Manual" : input === "webcam" ? "Webcam" : "AirPods"}</strong><small>{input === "manual" ? "Keyboard & click" : input === "webcam" ? "Local head tracking" : "macOS companion"}</small></span></label>)}
      </fieldset>
      <div className={compact ? styles.routeIndicator : styles.focusReadout} data-zone={currentSelection ? focus?.zone : undefined} role="status" aria-live="polite">
        <span><small>{compact ? "Targeted agent" : "Selected zone"}</small><strong>{currentSelection && focus?.zone ? focus.zone === "leader_desk" ? "Leader guide" : ZONE_LABELS[focus.zone] : "Awaiting selection"}</strong></span>
        {compact && <span className={styles.routeHint}>{currentSelection ? provider === "manual" ? "Click or use arrow keys to change the guide · same voice call" : "Turn your head to change the guide · same voice call" : "Select an area to confirm this input"}</span>}
        {!currentSelection && focus?.zone && <span>Last confirmed: {ZONE_LABELS[focus.zone]}</span>}
        {compact && <button className={styles.activateButton} disabled={connection !== "connected" || changing || !currentSelection || !zoneAccess?.allowed} onClick={() => void controller.current?.activate().catch(e => setError(e.message))}>{focus?.activeZone === focus?.zone && currentSelection ? `Active: ${ZONE_LABELS[focus.zone!]}` : `Activate ${currentSelection && focus?.zone ? ZONE_LABELS[focus.zone] : "selected zone"}`}</button>}
        {zoneAccess && !zoneAccess.allowed && <span className={styles.routeHint}>Leader workspace locked · AI guide only</span>}
      </div>
      {provider === "manual" && <>
        <p className={styles.provenance}>Permission: no motion permission needed · Calibration: not required. Use ← / ↑ / → to select, then Enter or Activate.</p>
        <div className={styles.manualZones} aria-label="Select a zone">{(["team_memory", "leader_desk", "code_navigator"] as const).map((zone, i) => <button key={zone} disabled={connection !== "connected" || changing} aria-pressed={currentSelection && focus?.zone === zone} onClick={() => select(zone)}>{["←", "↑", "→"][i]} {ZONE_LABELS[zone]}</button>)}</div>
      </>}
      {provider === "webcam" && <>
        <p className={styles.provenance}>Permission: {["tracking", "calibrating", "lost"].includes(webcamStatus) ? "camera granted" : webcamStatus === "unavailable" ? "unavailable, see camera status" : "requested when you start camera"} · Calibration: {webcamStatus === "tracking" ? "calibrated" : webcamStatus === "lost" ? "tracking lost; no new selection" : "not confirmed"}</p>
        <WebcamHeadTracker compact={compact} key={snapshot?.input.epoch} disabled={connection !== "connected" || changing} onStatusChange={setWebcamStatus} onSelect={zone => select(zone, webcamLease)} />
      </>}
      {provider === "airpods" && <div>
        <p>AirPods: {!airpodsFresh ? "unavailable, no fresh companion heartbeat" : airpods!.state.replaceAll("_", " ")} · Permission: {!airpodsFresh ? "unknown" : ["denied", "permission_required"].includes(airpods!.state) ? airpods!.state.replaceAll("_", " ") : "reported by companion"} · Calibration: {airpodsFresh && airpods?.calibrated ? "calibrated" : "not confirmed"}</p>
        <p>Open the macOS companion with the same device session. Start motion and recenter there. Head turns select only.</p>
      </div>}
      <details className={styles.advancedControls} open={compact ? undefined : true}><summary>Selection &amp; device details</summary>
      <div className={styles.focusActions}>
        {!compact && <button className={styles.activateButton} disabled={connection !== "connected" || changing || !currentSelection || !zoneAccess?.allowed} onClick={() => void controller.current?.activate().catch(e => setError(e.message))}>Activate {currentSelection && focus?.zone ? ZONE_LABELS[focus.zone] : "selected zone"}</button>}
        <span>Active zone: {focus?.activeZone ? ZONE_LABELS[focus.activeZone] : "none"}</span>
        <button onClick={() => void disconnect()} disabled={changing}>Disconnect focus controls</button>
        {connection === "unavailable" && <button onClick={forget}>Forget unavailable session</button>}
      </div>
      {connection === "unavailable" && <p>Stop the companion locally if it is still running. Reconnect a valid device session to restore focus controls.</p>}
      <p className={styles.provenance}>Selection does not activate a zone or unlock the Leader Desk. Switching inputs keeps the same Bolna conversation.</p>
      </details>
    </>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
