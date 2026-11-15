import type { EvidenceSnapshot } from "../contracts";
import { buildBolnaTools } from "../adapters/bolna";
import { buildSpatialBolnaTools } from "../spatial/bolna-config";

export interface ReadinessCheck {
  name: string;
  state: "pass" | "fail" | "pending" | "warning";
  detail: string;
}

// Accept a saved get_agent result or its unwrapped response. Never include
// provider fields in the report: they can contain keys, prompts and source data.
export function unwrapAgent(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, any>;
  if (value.isError === true) return null;
  if (Array.isArray(value.tasks)) return value;
  if (Array.isArray(value.content)) {
    for (const item of value.content) {
      if (item?.type !== "text" || typeof item.text !== "string") continue;
      try {
        const parsed = JSON.parse(item.text);
        if (parsed && Array.isArray(parsed.tasks)) return parsed;
      } catch { /* A provider error is not an agent configuration. */ }
    }
  }
  return null;
}

export function sourceChecks(snapshot: EvidenceSnapshot, now = Date.now()): ReadinessCheck[] {
  const check = (name: string, pass: boolean, detail: string): ReadinessCheck => ({ name, state: pass ? "pass" : "fail", detail });
  const approved = snapshot.meetings.length === 1 && snapshot.meetings.every(m => m.source === "LIVE" && Boolean(m.approvedBy?.trim()));
  const scopedTasks = snapshot.tasks.length > 0 && snapshot.tasks.every(t => {
    const meeting = snapshot.meetings.find(m => m.id === t.meetingId);
    return meeting && t.passageIds.length > 0 && t.passageIds.every(id => snapshot.passages.some(p => p.id === id && p.meetingId === t.meetingId && p.text.trim() && p.charStart >= 0 && p.charEnd > p.charStart));
  });
  const authorized = snapshot.participants.length > 0 && snapshot.participants.every(p => p.taskIds.length > 0 && p.taskIds.every(id => {
    const task = snapshot.tasks.find(t => t.id === id);
    return task && p.meetingIds.includes(task.meetingId) && snapshot.meetings.some(m => m.id === task.meetingId);
  }));
  const hasAcceptedOwner = snapshot.tasks.some(t => t.assignment.state === "accepted" && snapshot.participants.some(p => p.id === t.assignment.ownerId && p.taskIds.includes(t.id) && p.meetingIds.includes(t.meetingId)));
  const fetched = Date.parse(snapshot.fetchedAt);
  const fresh = Number.isFinite(fetched) && fetched <= now + 60_000 && now - fetched < 2 * 60 * 60_000;
  const linked = snapshot.tasks.some(t => t.prNumber != null && snapshot.pullRequests.some(pr => pr.number === t.prNumber && pr.repository === snapshot.repository));
  return [
    check("live_source", snapshot.label === "LIVE" && approved, "Requires exactly one approved LIVE meeting; no transcript content is exported."),
    check("source_passages", scopedTasks, "Every task must reference a passage from its own approved meeting."),
    check("participant_scope", authorized, "Every participant task must be scoped to an authorized meeting."),
    check("accepted_owner", hasAcceptedOwner, "A saved-action demo requires an accepted owner in the selected source."),
    check("pinned_code", /^[a-f0-9]{40}$/i.test(snapshot.pinnedSha) && snapshot.files.length > 0, "Code must be present at a complete commit SHA."),
    { name: "snapshot_freshness", state: fresh ? "pass" : "warning", detail: "Snapshot should be refreshed within two hours; fetching it does not establish deployment." },
    { name: "meeting_code_link", state: linked ? "pass" : "warning", detail: linked ? "A task has a repository PR reference; its semantic relationship still needs evidence review." : "No verified task-to-PR link. Voice answers must state that the meeting's implementation is unconfirmed in this repository." },
  ];
}

export function agentChecks(raw: unknown, baseUrl: string, toolKey: string, spatial: boolean): ReadinessCheck[] {
  const agent = unwrapAgent(raw);
  if (!agent) return [{ name: "agent_readback", state: "pending", detail: "Save a fresh Bolna get_agent response privately before the final call confirmation." }];
  const expected = [...buildBolnaTools(baseUrl, toolKey), ...(spatial ? buildSpatialBolnaTools(baseUrl, toolKey) : [])];
  const config = agent.tasks?.find((task: any) => task.task_type === "conversation")?.tools_config?.api_tools;
  const actual: any[] = Array.isArray(config?.tools) ? config.tools : [];
  const namesMatch = actual.length === expected.length && expected.every(tool => actual.filter(item => item.name === tool.name).length === 1);
  const callbacksMatch = expected.every(tool => {
    const params = config?.tools_params?.[tool.name];
    if (!params || params.url !== tool.value.url || params.method !== "POST") return false;
    const header = params.headers?.Authorization;
    const token = params.api_token;
    const authorization = header ?? token;
    return authorization === `Bearer ${toolKey}` && (!header || header === authorization) && (!token || token === authorization) && params.headers?.["Content-Type"] === "application/json" &&
      Object.entries(tool.value.param).every(([key, value]) => params.param?.[key] === value);
  });
  const schemaMatch = expected.every(tool => {
    const definition = actual.find(item => item.name === tool.name);
    return definition?.key === "custom_task" && Array.isArray(definition.parameters?.required) &&
      definition.parameters.required.length === tool.parameters.required.length &&
      tool.parameters.required.every(key => definition.parameters.required.includes(key)) &&
      definition.parameters.additionalProperties === false &&
      Object.entries(tool.parameters.properties).every(([key, expected]) => {
        const actual = definition.parameters.properties?.[key];
        return actual?.type === expected.type && (!("enum" in expected) || JSON.stringify(actual.enum) === JSON.stringify(expected.enum));
      });
  });
  return [
    { name: "agent_functions", state: namesMatch && schemaMatch ? "pass" : "fail", detail: `Requires exactly ${expected.length} named functions with caller context and required parameters.` },
    { name: "agent_callbacks", state: callbacksMatch ? "pass" : "fail", detail: "Read-back callbacks must match the configured HTTPS origin, authentication and parameter templates. Live provider substitution remains unverified until a call." },
  ];
}

export function readinessReport(checks: ReadinessCheck[], now = new Date()) {
  return {
    checkedAt: now.toISOString(),
    setupReady: checks.length > 0 && checks.every(c => c.state === "pass" || c.state === "warning"),
    callAuthorization: "HELD — requires one explicit confirmation for the specific consenting participant",
    callsStarted: 0,
    checks,
    limits: "Preflight proves setup checks only. It does not prove microphone audio, provider token substitution, call duration, spoken claims or deployment.",
  };
}
