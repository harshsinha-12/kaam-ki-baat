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
  compact?: boolean;
}

const ZONE_LABELS: Record<SelectorZone, string> = {
  team_memory: "Left · Team Memory", leader_desk: "Center · Leader Desk", code_navigator: "Right · Code Navigator",
};
const ZONES: { id: SelectorZone; direction: string; title: string }[] = [
  { id: "team_memory", direction: "← Left", title: "Team Memory" },
  { id: "leader_desk", direction: "↑ Center", title: "Leader Desk" },
  { id: "code_navigator", direction: "Right →", title: "Code Navigator" },
];
const STATUS_LABELS: Record<WebcamTrackingStatus, string> = {
  idle: "Camera off", starting: "Connecting", calibrating: "Calibrate to begin",
  tracking: "Tracking", lost: "Tracking paused", unavailable: "Unavailable",
};

/** Opt-in local head orientation, never gaze/identity/authorization. */
export function WebcamHeadTracker({ onSelect, onStatusChange, disabled = false, compact = false }: WebcamHeadTrackerProps) {
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
  const markerPosition = 50 - Math.max(-50, Math.min(50, snapshot.yawDeg ?? 0));
  return <section className={`${styles.tracker} ${compact ? styles.compactTracker : ""}`} aria-label="Webcam head tracking" data-webcam-status={snapshot.status}>
    <div className={styles.preview} data-running={running}>
      <video ref={video} className={styles.cameraPreview} muted playsInline aria-label="Live camera preview, mirrored" />
      {!running && <span className={styles.previewPlaceholder}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25"><rect x="3" y="5" width="13" height="14" rx="3" /><path d="m16 10 5-3v10l-5-3" /></svg>
        <strong>Your camera preview</strong><span>Start the camera to see yourself here.</span>
      </span>}
      <span className={styles.previewLabel}><i aria-hidden="true" />{running ? snapshot.status === "tracking" ? "Live · head tracking" : STATUS_LABELS[snapshot.status] : "Camera off"}</span>
      <span className={styles.previewPrivacy}>Only on your device</span>
      {running && <span className={styles.headPosition} style={{ left: `${markerPosition}%` }} aria-hidden="true" />}
    </div>
    <div className={styles.heading}>
      <div className={styles.titleGroup}>
        <span className={styles.cameraIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m8 6 1.5-2h5L16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" /><circle cx="12" cy="12.5" r="3.5" /></svg></span>
        <div><span className={styles.eyebrow}>Webcam · on this device</span><h4>Move your head to select</h4></div>
      </div>
      <span className={styles.statusBadge}><i aria-hidden="true" />{STATUS_LABELS[snapshot.status]}</span>
    </div>
    <p className={styles.message} role="status" aria-live="polite">{snapshot.message}</p>
    <div className={styles.orientation} aria-label="Head movement zones">
      <div className={styles.zoneRail}>{ZONES.map(zone => <div key={zone.id} className={styles.zone}
        data-zone={zone.id} data-selected={snapshot.selectedZone === zone.id} data-tracking={snapshot.status === "tracking"}>
        <span>{zone.direction}</span><strong>{zone.title}</strong>
      </div>)}</div>
      <div className={styles.poseTrack} aria-hidden="true"><span className={styles.neutralMark} />
        {snapshot.yawDeg !== null && <span className={styles.poseMarker} style={{ left: `${markerPosition}%` }} />}
      </div>
      <div className={styles.readout}><span aria-live="polite">{snapshot.selectedZone ? `Selected: ${ZONE_LABELS[snapshot.selectedZone]}` : "Calibrate, then hold a turn briefly."}</span>
        <span className={styles.angle} aria-label="Head turn in degrees">{snapshot.yawDeg === null ? "—" : `${Math.round(snapshot.yawDeg)}°`}</span>
      </div>
    </div>
    <div className={styles.controls}>
      <button type="button" className={styles.primary} disabled={disabled || running} onClick={() => void controller.current?.start()}>Start camera <span aria-hidden="true">↗</span></button>
      <button type="button" disabled={disabled || !snapshot.canCalibrate} onClick={() => controller.current?.recenter()}>Calibrate / recenter</button>
      <button type="button" className={styles.stop} disabled={!running} onClick={() => controller.current?.stop()}>Stop camera</button>
    </div>
    <details className={styles.trackingDetails}><summary>Camera privacy &amp; controls</summary>
    <div className={styles.privacy}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m10 2 6 2.5v4.8c0 4-6 7.7-6 7.7s-6-3.7-6-7.7V4.5Z" /><path d="m7 9.5 2 2 4-4" /></svg>
      <span>Camera off by default. No video saved or uploaded. No microphone access.</span></div>
    <p className={styles.hint}>Head turns select only. Click or use your keyboard to activate; Leader Desk still requires verification. Starting downloads the local tracking model.</p>
    </details>
  </section>;
}
