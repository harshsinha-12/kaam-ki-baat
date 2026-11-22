"use client";
import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { listen, type ListenEvent, type Listener } from "@/lib/core/wake-phrase";
import { isConfirmation, type Plan } from "@/lib/core/voice-commands";
import { zone } from "../zones/client";
import h from "./hands-free.module.css";

// Hands-free control for the workspace.
//  • "Hey Wispr" / "Hey Kaam": opt-in wake phrase through the browser's speech
//    recogniser. Off by default; one click asks for the microphone; "bas" or the
//    switch turns it off. Pauses whenever the tab is hidden.
//  • Wispr Flow: hold Flow's key with the cursor in the command field and speak.
//    Flow types the words here, so no second microphone is needed at all.
// Commands are planned on the server (command_plan) and executed by the page
// through a fixed allowlist. Anything that reaches the lead asks for a "yes".

export interface Frame {
  id: string; at: string; zone: "team_memory" | "leader_desk" | "code_navigator";
  query?: string; answer?: string; note?: string; sha: string;
  source?: { path: string; start: number; end: number };
}
export interface RecallHitView { frame: Frame; score: number; why: string[]; freshness: "current" | "older_commit"; sourceAvailable: boolean }

type Rec = { start(): void; stop(): void; abort(): void; continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
type RecCtor = new () => Rec;

const speechCtor = (): RecCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

type Log = { id: number; heard: string; say: string; kind: "done" | "ask" | "refused" };

export function HandsFree({ enabled, onPlan, captureView, onOpenFrame }: {
  enabled: boolean;
  /** Execute an allowlisted plan in the page; return what to say back (or a refusal). */
  onPlan(plan: Plan, confirmed: boolean): Promise<string>;
  /** What is on screen right now, for a memory frame. */
  captureView(): Record<string, unknown> | null;
  onOpenFrame(frame: Frame): void;
}) {
  const [state, setState] = useState<Listener>({ state: "off" });
  const stateRef = useRef(state); stateRef.current = state;
  const rec = useRef<Rec | null>(null);
  const [heard, setHeard] = useState("");
  const [text, setText] = useState("");
  const [log, setLog] = useState<Log[]>([]);
  const [pending, setPending] = useState<Plan | null>(null);
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const [voiceReply, setVoiceReply] = useState(true);
  const [frames, setFrames] = useState<RecallHitView[] | null>(null);
  const [recallQ, setRecallQ] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const supported = typeof window !== "undefined" && !!speechCtor();

  const say = useCallback((line: string) => {
    if (!voiceReply || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line); u.rate = 1.05; u.lang = "en-IN";
    window.speechSynthesis.speak(u);
  }, [voiceReply]);
  const push = useCallback((entry: Omit<Log, "id">) => setLog((l) => [{ ...entry, id: ++seq.current }, ...l].slice(0, 5)), []);

  const recall = useCallback(async (question: string) => {
    const r = await zone<{ hits: RecallHitView[]; total: number; window?: string }>("recall_search", { question });
    if (r.status !== 200) throw new Error(r.data.error ?? "Recall failed");
    setFrames(r.data.hits);
    return r.data.hits.length ? `Found ${r.data.hits.length} frame${r.data.hits.length > 1 ? "s" : ""}${r.data.window ? ` from ${r.data.window}` : ""}.`
      : r.data.total ? "No saved frame matches that." : "No frames yet. Say “remember this” on any answer.";
  }, []);

  const run = useCallback(async (command: string) => {
    // A pending confirmation is answered first: "yes/haan" runs it, anything else cancels it.
    const waiting = pendingRef.current;
    if (waiting) {
      setPending(null);
      if (isConfirmation(command)) {
        try { const line = await onPlan(waiting, true); push({ heard: command, say: line, kind: "done" }); say(line); }
        catch (e) { push({ heard: command, say: (e as Error).message, kind: "refused" }); }
        return;
      }
      push({ heard: command, say: "Cancelled. Nothing was sent.", kind: "refused" });
    }
    setBusy(true);
    try {
      const r = await zone<{ plan: Plan }>("command_plan", { text: command });
      if (r.status !== 200 || !r.data.plan) throw new Error(r.data.error ?? "Command could not be planned");
      const plan = r.data.plan;
      if (plan.command.type === "stop_listening") { stop(); push({ heard: command, say: plan.say, kind: "done" }); return; }
      if (plan.command.type === "not_allowed") { push({ heard: command, say: plan.say, kind: "refused" }); say(plan.say); return; }
      if (plan.needsConfirm) { setPending(plan); push({ heard: command, say: plan.say, kind: "ask" }); say(plan.say); return; }
      if (plan.command.type === "capture_frame") {
        const view = captureView();
        if (!view) { push({ heard: command, say: "Nothing on screen to remember yet.", kind: "refused" }); return; }
        const c = await zone("recall_capture", { ...view, note: plan.command.note });
        if (c.status !== 200) throw new Error(c.data.error ?? "Frame was not saved");
        push({ heard: command, say: plan.say, kind: "done" }); say("Remembered."); await recall("");
        return;
      }
      if (plan.command.type === "recall") { const line = await recall(plan.command.query); push({ heard: command, say: line, kind: "done" }); say(line); return; }
      const line = await onPlan(plan, false);
      push({ heard: command, say: line, kind: "done" }); say(line);
    } catch (e) { push({ heard: command, say: (e as Error).message, kind: "refused" }); }
    finally { setBusy(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPlan, captureView, recall, say, push]);

  const step = useCallback((e: ListenEvent) => {
    const r = listen(stateRef.current, e);
    stateRef.current = r.next; setState(r.next);
    if (r.command) void run(r.command);
    return r;
  }, [run]);
  const stepRef = useRef(step); stepRef.current = step;

  const start = useCallback(async () => {
    const Ctor = speechCtor();
    step({ type: "enable" });
    if (!Ctor) { step({ type: "denied", reason: "This browser has no speech recogniser. Use Wispr Flow in the command field instead." }); return; }
    try {
      // Ask for the microphone explicitly so the permission is the person's choice, then release it.
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      media.getTracks().forEach((t) => t.stop());
    } catch { step({ type: "denied", reason: "Microphone permission was not granted. Nothing is listening." }); return; }
    const r = new Ctor();
    r.continuous = true; r.interimResults = true; r.lang = "en-IN";
    r.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i]; const t = res[0].transcript;
        setHeard(t.slice(-120));
        stepRef.current({ type: "transcript", text: t, final: res.isFinal, now: Date.now() });
      }
    };
    r.onerror = (ev) => { if (ev.error === "not-allowed" || ev.error === "service-not-allowed") stepRef.current({ type: "denied", reason: "Microphone permission was withdrawn. Nothing is listening." }); };
    // Recognisers stop after silence; keep going only while armed and visible.
    r.onend = () => { if ((stateRef.current.state === "armed" || stateRef.current.state === "awake") && !document.hidden) { try { r.start(); } catch { /* already started */ } } };
    rec.current = r;
    step({ type: "granted" });
    try { r.start(); } catch { /* started */ }
  }, [step]);

  const stop = useCallback(() => {
    step({ type: "disable" });
    const r = rec.current; rec.current = null;
    if (r) { r.onend = null; try { r.abort(); } catch { /* idle */ } }
    setHeard("");
  }, [step]);

  useEffect(() => {
    const vis = () => {
      const r = rec.current; if (!r) return;
      if (document.hidden) { try { r.stop(); } catch { /* idle */ } } else if (stateRef.current.state === "armed") { try { r.start(); } catch { /* running */ } }
    };
    document.addEventListener("visibilitychange", vis);
    const tick = setInterval(() => { if (stateRef.current.state === "awake") { step({ type: "tick", now: Date.now() }); force(); } }, 500);
    return () => { document.removeEventListener("visibilitychange", vis); clearInterval(tick); const r = rec.current; if (r) { r.onend = null; try { r.abort(); } catch { /* idle */ } } };
  }, [step]);
  useEffect(() => { if (!enabled && stateRef.current.state !== "off") stop(); }, [enabled, stop]);

  const s = state.state;
  const on = s === "armed" || s === "awake";
  const status = s === "off" ? "Off" : s === "asking" ? "Asking for the microphone" : s === "armed" ? "Listening for “Hey Wispr”" : s === "awake" ? "Go ahead…" : "Not listening";
  const submit = () => { const t = text.trim(); if (!t || busy) return; setText(""); step({ type: "typed", text: t, now: Date.now() }); };

  return (
    <section className={h.box} data-state={s} aria-label="Hands-free">
      <header className={h.head}>
        <span className={h.orb} data-state={s} aria-hidden><i /><i /><i /></span>
        <div className={h.headText}>
          <strong>Hands-free</strong>
          <span role="status" aria-live="polite">{status}</span>
        </div>
        <button type="button" className={h.switch} role="switch" aria-checked={on || s === "asking"} disabled={!enabled}
          onClick={() => (s === "off" || s === "blocked" ? void start() : stop())} aria-label="Listen for the wake phrase">
          <i />
        </button>
      </header>

      {s === "blocked" && <p className={h.note} data-tone="warn">{state.reason}</p>}
      {(on || s === "asking") && (
        <p className={h.heard} data-awake={s === "awake"}>
          {s === "awake" ? <><b>Heard:</b> {state.pending || "…"}</> : heard ? <span className={h.ghostText}>{heard}</span> : <span className={h.ghostText}>Say “Hey Wispr, code dikhao”.</span>}
          {s === "awake" && <span className={h.window} style={{ "--p": 1 } as CSSProperties} aria-hidden />}
        </p>
      )}

      <div className={h.cmd}>
        <input className={h.input} value={text} disabled={!enabled} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder={pending ? "Say or type “yes” to confirm" : "Hold Flow’s key here and speak, or type"} aria-label="Command (Wispr Flow dictates here)" />
        <button type="button" className={h.go} disabled={!enabled || busy || !text.trim()} onClick={submit} aria-label="Run command">↵</button>
      </div>
      {pending && (
        <div className={h.confirm}>
          <span>{pending.command.type === "ask_lead" ? `Send to the lead${pending.command.question ? `: “${pending.command.question}”` : ""}?` : pending.say}</span>
          <button type="button" className={h.yes} onClick={() => void run("yes")}>Yes, send</button>
          <button type="button" className={h.no} onClick={() => void run("cancel")}>Cancel</button>
        </div>
      )}

      {log.length > 0 && <ol className={h.log} aria-label="Recent commands">
        {log.map((l) => <li key={l.id} data-kind={l.kind}><span>{l.heard}</span><small>{l.say}</small></li>)}
      </ol>}

      <details className={h.frames} onToggle={(e) => { if (e.currentTarget.open && !frames) void recall("").catch(() => setFrames([])); }}>
        <summary><span>Memory frames</span><small>{frames ? `${frames.length} shown` : "Say “remember this”"}</small></summary>
        <div className={h.framesBody}>
          <div className={h.cmd}>
            <input className={h.input} value={recallQ} onChange={(e) => setRecallQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void recall(recallQ).catch(() => setFrames([])); }}
              placeholder="What was I looking at… (kal, passkey, freeze)" aria-label="Search memory frames" />
            <button type="button" className={h.go} onClick={() => void recall(recallQ).catch(() => setFrames([]))} aria-label="Search frames">⌕</button>
          </div>
          <button type="button" className={h.snap} disabled={!enabled} onClick={() => void run("remember this")}>Remember this view</button>
          {frames?.length === 0 && <p className={h.note}>Nothing yet. Frames keep the question, the answer and the exact lines, never a picture of your screen.</p>}
          <ul className={h.filmstrip}>
            {frames?.map((hit) => (
              <li key={hit.frame.id}>
                <button type="button" className={h.frame} data-zone={hit.frame.zone} onClick={() => onOpenFrame(hit.frame)}>
                  <span className={h.frameTop}><i data-zone={hit.frame.zone} />{new Date(hit.frame.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                    {hit.freshness === "older_commit" && <em>older commit</em>}</span>
                  <strong>{hit.frame.note ?? hit.frame.query ?? hit.frame.answer}</strong>
                  {hit.frame.source && <code>{hit.frame.source.path.split("/").slice(-2).join("/")}:{hit.frame.source.start}–{hit.frame.source.end}{!hit.sourceAvailable && " (gone)"}</code>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <footer className={h.foot}>
        <label className={h.opt}><input type="checkbox" checked={voiceReply} onChange={(e) => setVoiceReply(e.target.checked)} />Speak replies</label>
        <span>{supported ? "Browser speech may be processed by your browser’s provider." : "No speech recogniser here: dictate with Wispr Flow."}</span>
      </footer>
    </section>
  );
}
