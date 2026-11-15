import { createHash } from "node:crypto";
import type { StoredEvent } from "../store/event-store";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Obj = Record<string, unknown>;
export const obj = (v: unknown): Obj => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const arr = (v: unknown): Obj[] => Array.isArray(v) ? v.map(obj) : [];
const str = (v: unknown) => typeof v === "string" ? v : "";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
export const terminal = new Set(["completed", "failed", "error", "busy", "no-answer", "canceled", "cancelled", "stopped", "balance-low"]);
export const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

// Provider debug embeds live callback credentials, including JSON inside strings.
// Collect them before projecting anything; never expose raw debug/LLM prompts.
export function redactor(input: unknown, extraSecrets: string[] = []) {
  const secrets = new Set(extraSecrets.filter(s => s.length >= 8));
  const sensitive = /token|secret|authorization|cookie|api.?key|password|credential|phone|(?:^|_)number$|headers|recording_url|reasoning/i;
  function collect(v: unknown, key = "") {
    if (typeof v === "string") {
      if (sensitive.test(key) && v.length >= 8) secrets.add(v);
      try { collect(JSON.parse(v)); } catch { /* ordinary text */ }
    } else if (Array.isArray(v)) v.forEach(x => collect(x));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => collect(x, k));
  }
  collect(input);
  const cleanText = (s: string): string => {
    for (const secret of [...secrets].sort((a, b) => b.length - a.length)) s = s.split(secret).join("[redacted]");
    return s.replace(/Bearer\s+[A-Za-z0-9_.\/-]+/gi, "Bearer [redacted]")
      .replace(/\+\d[\d ()-]{8,}\d/g, "[phone redacted]");
  };
  function clean(v: unknown): Json {
    if (typeof v === "string") { try { return clean(JSON.parse(v)); } catch { return cleanText(v); } }
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !sensitive.test(k)).map(([k, x]) => [k, clean(x)]));
    return typeof v === "boolean" || typeof v === "number" && Number.isFinite(v) || v === null ? v : null;
  }
  return { clean, text: cleanText };
}

export interface Finding { verdict: "pass" | "fail" | "inconclusive"; title: string; detail: string }
export interface CallEvaluation {
  id: string; createdAt: string; status: string; duration: number | null; channel: string; termination: string;
  version: string; inputHash: string; reviewedAt: string; transcript: Json; context: Json; settings: Json;
  tools: { name: string; status: string; code: number | null; latencyMs: number | null; at: string; request: Json; response: Json }[];
  logs: Json; latency: Json; findings: Finding[]; ignoredUtterances: number; userUtterances: number;
  consent: string; correlation: string; auditTools: Json; savedActions: number; review: string;
}
export interface EvaluationDashboard { schema: 1; agentId: string; syncedAt: string; calls: CallEvaluation[]; warnings: string[] }

export function evaluateCall(raw: Obj, debug: Obj, events: StoredEvent[] | null, review = "", extraSecrets: string[] = []): CallEvaluation {
  const redact = redactor({ raw, debug, events }, extraSecrets);
  const id = str(raw.id), status = str(raw.status) || "pending";
  const duration = terminal.has(status) ? num(raw.conversation_duration) : null;
  const progression = obj(debug.progression), transcript = arr(progression.transcript);
  const logs = arr(debug.logs), functions = transcript.filter(t => t.kind === "function_call");
  const requests = logs.filter(l => l.component === "function_call" && l.type === "request");
  const responses = logs.filter(l => l.component === "function_call" && l.type === "response");
  const queues = new Map<string, Obj[]>();
  for (const l of requests) { const name = str(l.tool_name); queues.set(name, [...queues.get(name) ?? [], l]); }
  const responseQueues = new Map<string, Obj[]>();
  for (const l of responses) { const name = str(l.tool_name); responseQueues.set(name, [...responseQueues.get(name) ?? [], l]); }
  const tools = functions.map(t => {
    const name = str(t.tool_name), request = queues.get(name)?.shift(), response = responseQueues.get(name)?.shift();
    return { name: name.replace(/^custom_task_/, ""), status: str(t.status), code: num(t.response_status_code), latencyMs: num(t.tool_latency_ms),
      at: str(t.ts), request: redact.clean(request?.data ?? null), response: redact.clean(response?.data ?? null) };
  });
  const links = (events ?? []).filter((e): e is Extract<StoredEvent, { type: "call_execution" }> => e.type === "call_execution" && e.executionId === id);
  const callIds = new Set(links.map(e => e.callId));
  const correlated = callIds.size === 1 && links.every(e => e.agentId === raw.agent_id);
  const local = correlated ? (events ?? []).filter(e => e.type === "call_session" ? callIds.has(e.session.callId)
    : e.type === "task_update" ? !!e.record.callId && callIds.has(e.record.callId)
    : "callId" in e && callIds.has(e.callId)) : [];
  const session = local.find(e => e.type === "call_session");
  const consent = session?.type === "call_session" && session.session.consentRecordedBy.trim() ? "Private session consent record present; call-specific eligibility needs review" : "Consent evidence unavailable in configured audit";
  const user = transcript.filter(t => t.kind === "message" && t.role === "user");
  const ignored = user.filter(t => t.not_sent_to_agent === true).length;
  const termination = str(raw.termination_reason), findings: Finding[] = [];
  findings.push({ verdict: duration === null ? "inconclusive" : duration > 45 ? "pass" : "fail", title: "Duration over 45 seconds", detail: duration === null ? "Final provider duration unavailable." : `${duration}s on the provider record. Duration alone does not establish eligibility.` });
  findings.push({ verdict: status === "completed" && termination === "user_hung_up" ? "pass" : terminal.has(status) ? "fail" : "inconclusive", title: "Call ending", detail: `${status} · ${termination || "termination unavailable"}. Completion is separate from conversation quality.` });
  findings.push({ verdict: functions.length ? tools.some(t => t.code !== null && t.code >= 400) ? "fail" : tools.every(t => t.code !== null && t.code >= 200 && t.code < 300) ? "pass" : "inconclusive" : "inconclusive", title: "Tool execution", detail: `${functions.length} provider-recorded calls. Setup/preflight requests are excluded. HTTP success does not establish answer correctness.` });
  findings.push({ verdict: user.length ? ignored ? "fail" : "pass" : "inconclusive", title: "Utterance delivery", detail: `${ignored} of ${user.length} transcript user segments marked not_sent_to_agent. Some may be buffered into later segments; this is a delivery flag, not an ASR accuracy score.` });
  const contextCalls = tools.filter(t => t.name === "get_project_context");
  if (contextCalls.length && user.length > contextCalls.length) findings.push({ verdict: "inconclusive", title: "Fresh context on follow-ups", detail: `Only ${contextCalls.length} project-context lookup(s) across ${user.length} user segments. Review follow-up answers and selected zones; segment count alone cannot prove a routing failure.` });
  const saved = local.filter(e => e.type === "task_update").length;
  findings.push({ verdict: "inconclusive", title: "Saved action", detail: saved ? `${saved} task-update audit record(s); independent persisted read-back and explicit confirmation still need review.` : correlated ? "No task-update event recorded for this call. A live saved action was not demonstrated." : "No unambiguous local execution mapping; saved actions cannot be established." });
  const capturedContext = obj(obj(raw.context_details).recipient_data);
  const usage = obj(obj(debug.execution).usage_breakdown);
  const settings = Object.fromEntries(["llmModel", "voice_id", "synthesizer_model", "synthesizer_provider", "transcriber_model", "transcriber_provider", "transcriber_language", "endpointing", "incremental_delay", "buffer_size", "hangup_after_silence", "trigger_user_online_message_after"].filter(k => k in usage).map(k => [k, usage[k]]));
  const configured = arr(usage.api_tools).map(t => str(t.name));
  return {
    id, createdAt: str(raw.created_at), status, duration, channel: str(raw.provider ?? obj(raw.telephony_data).provider), termination,
    version: str(raw.agent_version_id), inputHash: hash({ raw, debug, local, review }), reviewedAt: new Date().toISOString(),
    transcript: redact.clean(transcript.length ? transcript : raw.transcript ?? null), context: redact.clean(capturedContext),
    settings: redact.clean({ ...settings, configuredTools: configured }), tools,
    logs: redact.clean(logs.filter(l => ["function_call", "error", "transcriber", "synthesizer"].includes(str(l.component)))),
    latency: redact.clean(raw.latency_data ?? obj(debug.execution).latency_data ?? null), findings, ignoredUtterances: ignored, userUtterances: user.length,
    consent, correlation: correlated ? "Persisted local execution/agent mapping matches" : "Local mapping unavailable or conflicting",
    auditTools: redact.clean(local.filter(e => e.type === "tool_call").map(e => ({ at: e.at, tool: e.tool, ok: e.ok }))),
    savedActions: saved, review: redact.text(review),
  };
}
