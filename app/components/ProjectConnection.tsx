"use client";
import { useEffect, useRef, useState } from "react";
import { AudioWaveform } from "./AudioWaveform";
import type { BolnaWebCall } from "@bolna/web-call";
import type { ViewGraph } from "./CodeGraphView";
import { sessionToken } from "../zones/client";
import w from "../team/workspace.module.css";
export type ConnectedProject = { repository: string; sha: string; indexedFiles: number; label: "FIXTURE" | "LIVE"; fetchedAt?: string; graph: ViewGraph };
export function ProjectConnection({ repository, selectedZone, onConnected }: { repository: string; selectedZone: "team_memory" | "leader_desk" | "code_navigator"; onConnected: (project: ConnectedProject) => void }) {
  const [url, setUrl] = useState(`https://github.com/${repository}`);
  const [project, setProject] = useState<ConnectedProject | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [consent, setConsent] = useState(false), [state, setState] = useState("idle");
  const [levels, setLevels] = useState<number[]>(() => Array(28).fill(0));
  const panel = useRef<HTMLElement>(null);
  const [showDock, setShowDock] = useState(false);
  const audio = useRef<HTMLAudioElement>(null), call = useRef<BolnaWebCall | null>(null), starting = useRef(false);
  const connect = async () => {
    setLoading(true); setError("");
    try { const r = await fetch("/api/project", { method: "POST", headers: { Authorization: `Session ${sessionToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ repositoryUrl: url }), signal: AbortSignal.timeout(20000) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Repository connection failed");
      setProject(data); onConnected(data); return data;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not connect repository"); }
    finally { setLoading(false); }
  };
  useEffect(() => () => { void call.current?.stop(); }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setShowDock(!entry.isIntersecting), { threshold: 0.15 });
    if (panel.current) observer.observe(panel.current);
    return () => observer.disconnect();
  }, []);
  const start = async () => {
    if (!consent || starting.current || !["idle", "ended"].includes(state)) return;
    starting.current = true; setState("connecting"); setError("");
    try { if (!project && !await connect()) throw new Error("Connect your approved repository before starting voice.");
      const { BolnaWebCall } = await import("@bolna/web-call");
      const client = new BolnaWebCall({ audioElement: audio.current!, getSession: async () => {
        const r = await fetch("/api/project", { method: "POST", headers: { Authorization: `Session ${sessionToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "voice", repositoryUrl: url, consented: true }), signal: AbortSignal.timeout(20000) });
        const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Voice session unavailable"); return data;
      } });
      client.on("state-change", next => { setState(next); if (next !== "active") setLevels(Array(28).fill(0)); });
      client.on("volume-level", level => setLevels(previous => [...previous.slice(1), Number.isFinite(level) ? level : 0])); client.on("error", e => setError(e.message)); call.current = client; await client.start();
    } catch (e) { await call.current?.stop(); setState("ended"); setError(e instanceof Error ? e.message : "Microphone or voice connection unavailable"); }
    finally { starting.current = false; }
  };
  const active = !["idle", "ended"].includes(state);
  const voiceStatus = state === "active" ? "Voice active · speak now" : state === "connecting" ? "Connecting voice…" : state === "ringing" ? "Calling the voice guide…" : "Microphone off · voice chat not started";
  const zoneLabel = selectedZone === "team_memory" ? "Team Memory" : selectedZone === "code_navigator" ? "Code Navigator" : "Leader guide";
  const REPO_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M6 3v12M18 9v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 15c0-4 12-2 12-6" /></svg>;
  const MIC_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7" /></svg>;
  return <><section ref={panel} className={w.panel} aria-label="Project and voice connection">
    <div className={w.panelHead}>
      <span className={w.panelIcon} aria-hidden="true">{REPO_ICON}</span>
      <div><h2>Project connection</h2><p>{project ? "Repository indexed and pinned." : "Your code, ready for the conversation."}</p></div>
    </div>
    {project && <div className={w.repoCard}>
      <span className={w.snapLabel}>{project.label ?? "UNKNOWN"}</span>
      <span className={w.mono}>{project.repository}</span>
      <span className={w.repoFacts}><span><b>{project.indexedFiles}</b> files</span><span className={w.sha}>{project.sha.slice(0, 7)}</span></span>
    </div>}
    <form className={w.ask} onSubmit={e => { e.preventDefault(); void connect(); }}>
      <input className={w.input} type="url" aria-label="GitHub repository URL" value={url} onChange={e => { setUrl(e.target.value); setProject(null); }} placeholder="https://github.com/owner/repository" required disabled={active} />
      <button className={w.btn} disabled={loading || active}>{loading ? "Connecting…" : project ? "Reconnect" : "Connect"}</button>
    </form>
    {project && <button className={w.link} onClick={() => { onConnected(project); document.getElementById("code-navigator")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Open code graph</button>}
    {project?.label === "FIXTURE" && <p className={w.note} data-tone="warn" role="status">Sample snapshot only. It does not prove a real Wispr import. Use an authorized LIVE snapshot for real-team answers.</p>}

    <div className={w.voice} data-active={state === "active"}>
      <div className={w.voiceHead}>
        <span className={w.panelIcon} data-active={state === "active"} aria-hidden="true">{MIC_ICON}</span>
        <div><strong>Voice guide</strong><span className={w.voiceStatus} data-active={state === "active"} role="status">{voiceStatus}</span></div>
        <span className={w.voiceZone}>{zoneLabel}</span>
      </div>
      <AudioWaveform samples={levels} active={state === "active"} />
      <label className={w.consent}><input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); if (!e.target.checked) void call.current?.stop(); }} /> I consent to this voice call and recording</label>
      <button className={`${w.btn} ${w.full} ${active ? w.danger : w.primary}`} disabled={!active && (!consent || loading)} onClick={() => active ? void call.current?.stop() : void start()}>{active ? "End call" : "Start voice chat"}</button>
    </div>
    <audio ref={audio} autoPlay />{error && <p className={w.error} role="alert">{error}</p>}
  </section>
  {showDock && active && <aside className={w.dock} aria-label="Voice chat controls">
    <div className={w.voiceHead}>
      <span className={w.panelIcon} data-active={state === "active"} aria-hidden="true">{MIC_ICON}</span>
      <div><strong>{zoneLabel}</strong><span className={w.voiceStatus} data-active={state === "active"} role="status">{voiceStatus}</span></div>
    </div>
    <AudioWaveform samples={levels} active={state === "active"} />
    <button className={`${w.btn} ${w.full} ${w.danger}`} onClick={() => void call.current?.stop()}>End voice chat</button>
    {error && <p className={w.error} role="alert">{error}</p>}
  </aside>}
  </>;
}
