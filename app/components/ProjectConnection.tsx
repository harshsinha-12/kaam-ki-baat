"use client";
import { useEffect, useRef, useState } from "react";
import { AudioWaveform } from "./AudioWaveform";
import type { BolnaWebCall } from "@bolna/web-call";
import type { ViewGraph } from "./CodeGraphView";
import { sessionToken } from "../zones/client";
import s from "../zones/zones.module.css";
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
  return <><section ref={panel} className={s.repoPanel} aria-label="Project and voice connection">
    <div className={s.repoHeading}>
      <div className={s.repoTitle}><span className={s.repoIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 3h12a2 2 0 0 1 2 2v16H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Z"/><path d="M4 17a3 3 0 0 1 3-3h12M8 7h7M8 10h4"/></svg></span><div><h2>Project connection</h2><p>Your code and documentation, ready for the conversation.</p></div></div>
      <span className={s.badge}>{project ? `${project.label ?? "UNKNOWN"} · ${project.indexedFiles} files · ${project.sha.slice(0,7)}` : "Select your approved repository"}</span>
    </div>
    <form className={s.row} onSubmit={e => { e.preventDefault(); void connect(); }}><input className={s.input} type="url" aria-label="GitHub repository URL" value={url} onChange={e => { setUrl(e.target.value); setProject(null); }} placeholder="https://github.com/owner/repository" required disabled={active} /><button className={s.btn} disabled={loading || active}>{loading ? "Connecting…" : project ? "Reconnect" : "Connect repository"}<span aria-hidden="true"> ↗</span></button></form>
    <div className={s.projectActions}>
      <div className={s.voiceSummary}><span className={s.micIcon} data-active={state === "active"} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg></span><div><strong>Voice guide</strong><span className={s.voiceStatus} data-active={state === "active"} role="status">{voiceStatus}</span></div></div>
      <AudioWaveform samples={levels} active={state === "active"} />
      <div className={s.voiceContext}><span className={s.label}>Current context</span><strong aria-live="polite">{zoneLabel}</strong></div>
      <div className={s.voiceActions}>
        <label><input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); if (!e.target.checked) void call.current?.stop(); }} /> I consent to this voice call and recording</label>
        <button className={`${s.btn} ${active ? s.endCall : s.primary}`} disabled={!active && (!consent || loading)} onClick={() => active ? void call.current?.stop() : void start()}>{active ? "End call" : "Start voice chat"}<span aria-hidden="true">{active ? " ◼" : " ↗"}</span></button>
      </div>
    </div>
    {project && <div className={s.projectFooter}><span>Repository connected · {project.repository}</span><button className={s.textButton} onClick={() => { onConnected(project); document.getElementById("code-navigator")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Open code graph <span aria-hidden="true">↗</span></button></div>}
    {project?.label === "FIXTURE" && <p className={s.bad} role="status">Sample snapshot only. Code and meeting context here do not prove a real Wispr MCP import. Use an authorized LIVE snapshot for real-team answers.</p>}
    <audio ref={audio} autoPlay />{error && <p className={s.bad} role="alert">{error}</p>}
  </section>
  {showDock && <aside className={s.voiceDock} aria-label="Voice chat controls">
    <div className={s.dockHeader}><strong>{zoneLabel}</strong><span className={s.voiceStatus} data-active={state === "active"} role="status">{voiceStatus}</span></div>
    <AudioWaveform samples={levels} active={state === "active"} />
    {!active && <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I consent to this voice call and recording</label>}
    <button className={`${s.btn} ${s.primary}`} disabled={!consent && !active} onClick={() => active ? void call.current?.stop() : void start()}>{active ? "End voice chat" : "Start voice chat · enable microphone"}</button>
    {error && <p className={s.bad} role="alert">{error}</p>}
    <small>Camera tracking selects context. Start voice to hear and answer questions.</small>
  </aside>}
  </>;
}
