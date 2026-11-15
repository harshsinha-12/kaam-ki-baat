"use client";
import { useEffect, useRef, useState } from "react";
import type { BolnaWebCall } from "@bolna/web-call";
import type { ViewGraph } from "./CodeGraphView";
import { sessionToken } from "../zones/client";
import s from "../zones/zones.module.css";
export type ConnectedProject = { repository: string; sha: string; indexedFiles: number; graph: ViewGraph };
export function ProjectConnection({ repository, selectedZone, onConnected }: { repository: string; selectedZone: "team_memory" | "leader_desk" | "code_navigator"; onConnected: (project: ConnectedProject) => void }) {
  const [url, setUrl] = useState(`https://github.com/${repository}`);
  const [project, setProject] = useState<ConnectedProject | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [consent, setConsent] = useState(false), [state, setState] = useState("idle");
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
      client.on("state-change", setState); client.on("error", e => setError(e.message)); call.current = client; await client.start();
    } catch (e) { await call.current?.stop(); setState("ended"); setError(e instanceof Error ? e.message : "Microphone or voice connection unavailable"); }
    finally { starting.current = false; }
  };
  const active = !["idle", "ended"].includes(state);
  const voiceStatus = state === "active" ? "Voice active · speak now" : state === "connecting" ? "Connecting voice…" : state === "ringing" ? "Calling the voice guide…" : "Microphone off · voice chat not started";
  const zoneLabel = selectedZone === "team_memory" ? "Team Memory" : selectedZone === "code_navigator" ? "Code Navigator" : "Leader guide";
  return <><section ref={panel} className={s.repoPanel} aria-label="Project and voice connection">
    <div className={s.repoHeading}><div><h2>Your repository</h2><p>Code, documentation, and one voice guide for Charan’s team.</p></div><span className={s.badge}>{project ? `${project.indexedFiles} files · ${project.sha.slice(0,7)}` : "Choose your approved repository"}</span></div>
    <form className={s.row} onSubmit={e => { e.preventDefault(); void connect(); }}><input className={s.input} type="url" aria-label="GitHub repository URL" value={url} onChange={e => { setUrl(e.target.value); setProject(null); }} placeholder="https://github.com/owner/repository" required disabled={active} /><button className={`${s.btn} ${s.primary}`} disabled={loading || active}>{loading ? "Connecting…" : "Connect repository"}</button></form>
    <div className={s.projectActions}>{project && <button className={s.btn} onClick={() => { onConnected(project); document.getElementById("code-navigator")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Open code graph ↗</button>}<label><input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); if (!e.target.checked) void call.current?.stop(); }} /> I consent to this voice call and recording</label><button className={`${s.btn} ${s.primary}`} disabled={!consent || active} onClick={() => void start()}>Start new voice chat</button>{active && <button className={s.btn} onClick={() => void call.current?.stop()}>End call</button>}<span className={s.meta} aria-live="polite">Voice context: {selectedZone === "team_memory" ? "Team Memory" : selectedZone === "code_navigator" ? "Code Navigator" : "Charan’s team · AI leader guide"}</span><span className={s.voiceStatus} data-active={state === "active"} role="status">{voiceStatus}</span></div>
    <audio ref={audio} autoPlay />{error && <p className={s.bad} role="alert">{error}</p>}
  </section>
  {showDock && <aside className={s.voiceDock} aria-label="Voice chat controls">
    <div className={s.dockHeader}><strong>{zoneLabel}</strong><span className={s.voiceStatus} data-active={state === "active"} role="status">{voiceStatus}</span></div>
    {!active && <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I consent to this voice call and recording</label>}
    <button className={`${s.btn} ${s.primary}`} disabled={!consent && !active} onClick={() => active ? void call.current?.stop() : void start()}>{active ? "End voice chat" : "Start voice chat · enable microphone"}</button>
    {error && <p className={s.bad} role="alert">{error}</p>}
    <small>Camera tracking selects context. Start voice to hear and answer questions.</small>
  </aside>}
  </>;
}
