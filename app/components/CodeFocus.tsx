"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CodeSourceFocus } from "@/lib/codegraph/source";
import { zone } from "../zones/client";
import s from "./code-source.module.css";

export interface CodeSourceRequest { path: string; line: number; id: string }

/** Source bytes and line ranges come only from the authenticated snapshot API. */
export function CodeFocus({ request, refreshKey = 0, onFocus }: {
  request?: CodeSourceRequest | null; refreshKey?: number; onFocus?(focus: CodeSourceFocus): void;
}) {
  const [focus, setFocus] = useState<CodeSourceFocus | null>(null);
  const [files, setFiles] = useState<{ path: string; lineCount: number }[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const mounted = useRef(false), serial = useRef(0), revision = useRef("");
  const viewport = useRef<HTMLDivElement>(null);
  const callback = useRef(onFocus); callback.current = onFocus;
  const receive = useCallback((next: CodeSourceFocus | null) => {
    if (!next) { revision.current = ""; setFocus(null); return; }
    if (next.revision === revision.current) return;
    revision.current = next.revision; setFocus(next); callback.current?.(next);
  }, []);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; serial.current++; }; }, []);
  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const r = await zone<{ files: { path: string; lineCount: number }[] }>("code_files");
      if (!mounted.current) return;
      if (r.status !== 200 || !Array.isArray(r.data.files)) {
        if ([401, 403].includes(r.status)) { setFiles([]); receive(null); }
        throw new Error(r.data.error ?? "Repository files are unavailable.");
      }
      setFiles(r.data.files); setError("");
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Repository files could not load."); }
    finally { if (mounted.current) setLoadingFiles(false); }
  }, [receive]);
  useEffect(() => { void loadFiles(); }, [loadFiles]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const sequence = serial.current;
      const previousRevision = revision.current;
      try {
        if (document.hidden) return;
        const r = await zone<{ focus: CodeSourceFocus | null }>("code_focus");
        if (!alive || sequence !== serial.current || previousRevision !== revision.current) return;
        if (r.status !== 200) {
          if ([401, 403].includes(r.status)) { receive(null); setFiles([]); }
          throw new Error(r.data.error ?? "Source updates are unavailable.");
        }
        receive(r.data.focus); setError("");
      } catch (e) { if (alive && sequence === serial.current) setError(e instanceof Error ? e.message : "Source updates could not refresh."); }
      finally { if (alive) timer = setTimeout(poll, 1500); }
    };
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [receive, refreshKey]);

  const open = useCallback(async (path: string, line = 1) => {
    const sequence = ++serial.current;
    setOpening(true); setError("");
    try {
      const r = await zone<{ focus: CodeSourceFocus }>("code_open", { path, line });
      if (!mounted.current || sequence !== serial.current) return;
      if (r.status !== 200 || !r.data.focus) {
        if ([401, 403].includes(r.status)) { receive(null); setFiles([]); }
        throw new Error(r.data.error ?? "This source could not be opened.");
      }
      receive(r.data.focus);
    } catch (e) { if (mounted.current && sequence === serial.current) setError(e instanceof Error ? e.message : "This source could not be opened."); }
    finally { if (mounted.current && sequence === serial.current) setOpening(false); }
  }, [receive]);
  useEffect(() => { if (request) void open(request.path, request.line); }, [request, open]);

  useEffect(() => {
    if (!focus) return;
    const box = viewport.current, hot = box?.querySelector<HTMLElement>("[data-hot=true]");
    if (box && hot) box.scrollTop = Math.max(0, hot.offsetTop - box.clientHeight / 3);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "nearest" });
  }, [focus]);

  const matching = files.filter(f => f.path.toLowerCase().includes(filter.trim().toLowerCase()));
  const visible = matching.slice(0, 30);
  return <section className={s.browser} aria-label="Repository source" data-code-source>
    <div className={s.header}><div><span className={s.eyebrow}>Pinned source</span><h3>Open the code</h3></div>
      <span className={s.badge}>{files.length} approved files</span></div>
    <p className={s.intro}>Pick a file or a graph node. Ask the voice guide about code and its matching lines appear here.</p>
    <label className={s.search}><span>Find a file</span><input type="search" aria-label="Find a repository file" placeholder="Search paths, e.g. lib/focus" value={filter} onChange={e => setFilter(e.target.value)} /></label>
    <div className={s.files} aria-label="Repository files">
      {loadingFiles ? <p role="status">Loading approved files…</p> : visible.length ? visible.map(file => <button type="button" key={file.path} title={file.path}
        aria-pressed={focus?.path === file.path} onClick={() => void open(file.path)}><span>{file.path}</span><small>{file.lineCount} lines</small></button>)
        : <p>{files.length ? "No file matches this search." : "No source files are available for this session."}</p>}
    </div>
    {matching.length > visible.length && <p className={s.note}>Showing {visible.length} of {matching.length} files. Refine the path to find another file.</p>}
    {error && <p className={s.error} role="alert">{error} <button type="button" onClick={() => void loadFiles()}>Retry</button></p>}
    {opening && <p className={s.note} role="status">Opening source…</p>}
    {focus ? <div className={s.source}>
      <div className={s.fileHeader}><div><strong>{focus.path}</strong><span>{focus.repository} @ {focus.sha.slice(0, 7)} · {focus.from === "call" ? "Voice reference" : "Source selection"}</span></div>
        <a href={focus.url} target="_blank" rel="noopener noreferrer">Open on GitHub ↗</a></div>
      <p className={s.highlightLabel} aria-live="polite">Highlighted {focus.highlights.map(h => h.start === h.end ? `line ${h.start}` : `lines ${h.start}–${h.end}`).join(", ")} · source reference, not proof of a completed task</p>
      <div ref={viewport} className={s.viewport} tabIndex={0} role="region" aria-label={`Source code for ${focus.path}`}>
        <div className={s.code}>{focus.lines.map(line => {
          const highlight = focus.highlights.find(h => line.n >= h.start && line.n <= h.end);
          return <div key={line.n} className={s.line} data-hot={Boolean(highlight)} data-line={line.n} title={highlight?.reason}>
            <span className={s.lineNumber} aria-hidden="true">{line.n}</span><code>{line.text || " "}</code>
          </div>;
        })}</div>
      </div>
      <div className={s.sourceFooter}><span>Lines {focus.lines[0]?.n}–{focus.lines.at(-1)?.n} of {focus.totalLines}</span><span>Commit {focus.sha.slice(0, 7)} · read only</span></div>
      <ul className={s.reasons}>{focus.highlights.map((h, i) => <li key={i}>L{h.start}{h.end !== h.start ? `–${h.end}` : ""} <span>{h.reason}</span></li>)}</ul>
    </div> : <div className={s.empty}>Your code opens here with line numbers and highlighted references. The graph and file list use only your approved repository snapshot.</div>}
  </section>;
}
