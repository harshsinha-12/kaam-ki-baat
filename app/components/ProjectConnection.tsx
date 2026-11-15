"use client";
import { useEffect, useRef, useState } from "react";
import type { BolnaWebCall } from "@bolna/web-call";
import type { ViewGraph } from "./CodeGraphView";
import { sessionToken } from "../zones/client";
import s from "../zones/zones.module.css";
export type ConnectedProject = { repository: string; sha: string; indexedFiles: number; graph: ViewGraph };
export function ProjectConnection({ repository, onConnected }: { repository: string; onConnected: (project: ConnectedProject) => void }) {
  const [url, setUrl] = useState(`https://github.com/${repository}`);
  const [project, setProject] = useState<ConnectedProject | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [consent, setConsent] = useState(false), [state, setState] = useState("idle");
  const audio = useRef<HTMLAudioElement>(null), call = useRef<BolnaWebCall | null>(null), starting = useRef(false);
  const connect = async () => {
    setLoading(true); setError("");
    try { const r = await fetch("/api/project", { method: "POST", headers: { Authorization: `Session ${sessionToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ repositoryUrl: url }), signal: AbortSignal.timeout(20000) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Repository connection failed");
      setProject(data); onConnected(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not connect repository"); }
    finally { setLoading(false); }
  };
  useEffect(() => () => { void call.current?.stop(); }, []);
  const start = async () => {
    if (!consent || !project || starting.current || !["idle", "ended"].includes(state)) return;
    starting.current = true; setState("connecting"); setError("");
    try { const { BolnaWebCall } = await import("@bolna/web-call");
      const client = new BolnaWebCall({ audioElement: audio.current!, getSession: async () => {
        const r = await fetch("/api/project", { method: "POST", headers: { Authorization: `Session ${sessionToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "voice", repositoryUrl: url, consented: true }), signal: AbortSignal.timeout(20000) });
        const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Voice session unavailable"); return data;
      } });
      client.on("state-change", setState); client.on("error", e => setError(e.message)); call.current = client; await client.start();
    } catch (e) { await call.current?.stop(); setState("ended"); setError(e instanceof Error ? e.message : "Microphone or voice connection unavailable"); }
    finally { starting.current = false; }
  };
  const active = !["idle", "ended"].includes(state);
  return <section className={s.repoPanel} aria-label="Project and voice connection">
    <div className={s.repoHeading}><div><h2>Your repository</h2><p>Code, documentation, and one voice guide for Charan’s team.</p></div><span className={s.badge}>{project ? `${project.indexedFiles} files · ${project.sha.slice(0,7)}` : "Choose your approved repository"}</span></div>
    <form className={s.row} onSubmit={e => { e.preventDefault(); void connect(); }}><input className={s.input} type="url" aria-label="GitHub repository URL" value={url} onChange={e => { setUrl(e.target.value); setProject(null); }} placeholder="https://github.com/owner/repository" required disabled={active} /><button className={`${s.btn} ${s.primary}`} disabled={loading || active}>{loading ? "Connecting…" : "Connect repository"}</button></form>
    {project && <div className={s.projectActions}><button className={s.btn} onClick={() => { onConnected(project); document.getElementById("code-navigator")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Open code graph ↗</button><label><input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); if (!e.target.checked) void call.current?.stop(); }} /> I consent to this voice call and recording</label><button className={`${s.btn} ${s.primary}`} disabled={!consent || active} onClick={() => void start()}>Talk to project guide</button>{active && <button className={s.btn} onClick={() => void call.current?.stop()}>End call</button>}<span className={s.meta} role="status">{state === "idle" ? "Voice ready when you are" : state}</span></div>}
    <audio ref={audio} autoPlay />{error && <p className={s.bad} role="alert">{error}</p>}
  </section>;
}
