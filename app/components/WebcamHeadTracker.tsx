"use client";

import { useEffect, useRef, useState } from "react";
import type { SelectorZone } from "@/lib/focus/selector";
import { initialWebcamSnapshot, WebcamController, type WebcamTrackingStatus } from "@/lib/focus/webcam";
import styles from "./webcam.module.css";

export type { WebcamTrackingStatus } from "@/lib/focus/webcam";

export interface WebcamHeadTrackerProps {
  onSelect(zone: SelectorZone): void;
  onStatusChange?(status: WebcamTrackingStatus): void;
  disabled?: boolean;
}

const ZONE_LABELS: Record<SelectorZone, string> = {
  team_memory: "Left · Team Memory", leader_desk: "Center · Leader Desk", code_navigator: "Right · Code Navigator",
};

/** Opt-in local head orientation, never gaze/identity/authorization. */
export function WebcamHeadTracker({ onSelect, onStatusChange, disabled = false }: WebcamHeadTrackerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const controller = useRef<WebcamController | null>(null);
  const callbacks = useRef({ onSelect, onStatusChange, disabled });
  callbacks.current = { onSelect, onStatusChange, disabled };
  const [snapshot, setSnapshot] = useState(initialWebcamSnapshot);

  useEffect(() => {
    const tracker = new WebcamController(video.current!, {
      onSelect: (zone) => { if (!callbacks.current.disabled) callbacks.current.onSelect(zone); },
      onChange: setSnapshot,
    });
    controller.current = tracker;
    const stopHidden = () => { if (document.hidden) tracker.stop("Camera stopped while this page was hidden. Start again when ready."); };
    const stopLeaving = () => tracker.stop();
    document.addEventListener("visibilitychange", stopHidden);
    window.addEventListener("pagehide", stopLeaving);
    return () => {
      document.removeEventListener("visibilitychange", stopHidden);
      window.removeEventListener("pagehide", stopLeaving);
      tracker.stop();
      controller.current = null;
    };
  }, []);

  useEffect(() => { if (disabled) controller.current?.stop(); }, [disabled]);
  useEffect(() => { callbacks.current.onStatusChange?.(snapshot.status); }, [snapshot.status]);

  const running = ["starting", "calibrating", "tracking", "lost"].includes(snapshot.status);
  return <section className={styles.tracker} aria-label="Webcam head tracking" data-webcam-status={snapshot.status}>
    <div className={styles.heading}><strong>Webcam head tracking</strong><span>{snapshot.status}</span></div>
    <p role="status" aria-live="polite">{snapshot.message}</p>
    <div className={styles.controls}>
      <button type="button" disabled={disabled || running} onClick={() => void controller.current?.start()}>Start camera</button>
      <button type="button" disabled={!running} onClick={() => controller.current?.stop()}>Stop camera</button>
      <button type="button" disabled={disabled || !snapshot.canCalibrate} onClick={() => controller.current?.recenter()}>Calibrate / recenter</button>
    </div>
    <p className={styles.readout}>Head turn: {snapshot.yawDeg === null ? "—" : `${Math.round(snapshot.yawDeg)}°`}
      {" · "}{snapshot.selectedZone ? `Last camera selection: ${ZONE_LABELS[snapshot.selectedZone]}` : "No camera selection"}</p>
    <p className={styles.hint}>Left → Team Memory · Center → Leader Desk · Right → Code Navigator.<br />
      Selection only. Use your normal click or keyboard controls to activate. Leader access still requires verification.</p>
    <p className={styles.hint}>Camera off by default. Frames stay on this device; no footage is stored or uploaded. No microphone access. Starting downloads the face-tracking model.</p>
    {/* A decoder surface only; no canvas, capture, recorder or image serialization. */}
    <video ref={video} className={styles.decoder} muted playsInline aria-hidden="true" tabIndex={-1} />
  </section>;
}
