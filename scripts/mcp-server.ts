// Kaam Ki Baat as an MCP server (stdio, JSON-RPC 2.0), so Claude Code, Codex or
// another team's agent can ask the same evidence engine the phone agent uses.
// Read-only and dependency-free. It answers from the SHA-pinned snapshot and the
// code graph; it never writes, approves or calls anyone.
// Set a private KKB_MCP_SESSION_TOKEN issued for the intended participant;
// tools use the same persisted identity, repository and source-access gates.
//
//   claude mcp add kaam-ki-baat -- npx tsx scripts/mcp-server.ts
//   codex:  [mcp_servers.kaam-ki-baat] command = "npx" args = ["tsx", "scripts/mcp-server.ts"]
import { createInterface } from "node:readline";
import { getCodeGraph } from "../lib/codegraph/load";
import { queryGraph } from "../lib/codegraph/graph";
import { evidenceVerifier } from "../lib/specialists/evidence-verifier";
import { loadSnapshot } from "../lib/evidence/load";
import { visibleDecisions } from "../lib/zones/memory";
import { resolveDeviceActor, type Actor } from "../lib/zones/identity";
import { EventStore, eventsLogPath } from "../lib/store/event-store";
import type { EvidenceSnapshot } from "../lib/contracts";

export interface McpRuntime { snapshot: EvidenceSnapshot; store: EventStore; token?: string }
const TOOLS = [
  { name: "kkb_code_location", description: "Find candidate code locations at the pinned commit, with static links to related files and tests. Requires repository access.",
    inputSchema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] } },
  { name: "kkb_decisions", description: "List the team's decisions from the approved meeting with their state (approved, proposed, conditional, disputed) and source passages. Proposed is not approved.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "optional filter" } } } },
  { name: "kkb_task_status", description: "Deterministic status of one task: ownership, PR open/merged, checks on the current SHA or stale. Never claims production correctness.",
    inputSchema: { type: "object", properties: { task_id: { type: "string" } }, required: ["task_id"] } },
  { name: "kkb_graph_report", description: "Most-connected code nodes and communities of the repo graph.", inputSchema: { type: "object", properties: {} } },
];

async function call(name: string, args: Record<string, unknown>, rt: McpRuntime, actor: Actor): Promise<unknown> {
  const { snapshot, store } = rt;
  const meta = { repository: snapshot.repository, sha: snapshot.pinnedSha, label: snapshot.label };
  if (name !== "kkb_decisions" && !actor.repoAccess) throw new Error("no repository access");
  switch (name) {
    case "kkb_code_location": {
      const g = getCodeGraph(snapshot);
      const a = queryGraph(g, String(args.question ?? ""), snapshot.files);
      return { ...meta, match: a.match, seed: a.seed, explanation: a.explanation, url: a.seed ? `https://github.com/${g.repository}/blob/${g.sha}/${a.seed.path}#L${a.seed.line}` : null };
    }
    case "kkb_decisions": {
      const q = String(args.query ?? "").toLowerCase();
      const ds = visibleDecisions(snapshot, await store.all(), actor).filter((d) => !q || d.statement.toLowerCase().includes(q));
      return { label: snapshot.label, decisions: ds.map((d) => ({ id: d.id, statement: d.statement, state: d.state, sources: d.sources.map((s) => s.label) })) };
    }
    case "kkb_task_status": {
      const t = snapshot.tasks.find((x) => x.id === args.task_id && actor.participant.taskIds.includes(x.id) && actor.meetingIds.includes(x.meetingId));
      if (!t) throw new Error("task not authorized");
      const v = evidenceVerifier(snapshot, t, await store.latestUpdate(t.id));
      return { ...meta, task: t.title, reconciled: v.reconciled, statements: v.statements };
    }
    case "kkb_graph_report": {
      const g = getCodeGraph(snapshot);
      const byId = new Map(g.nodes.map((n) => [n.id, n]));
      return { ...meta, nodes: g.nodes.length, edges: g.edges.length, godNodes: g.godNodes.map((id) => byId.get(id)), communities: g.communities };
    }
    default: throw Object.assign(new Error(`unknown tool ${name}`), { code: -32602 });
  }
}

export async function handle(msg: { id?: number | string; method: string; params?: Record<string, unknown> }, runtime?: McpRuntime) {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize": return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "kaam-ki-baat", version: "0.3.0" } });
    case "tools/list": return reply({ tools: TOOLS });
    case "tools/call": {
      try {
        const token = runtime?.token ?? process.env.KKB_MCP_SESSION_TOKEN;
        if (!token) throw new Error("MCP requires a private KKB_MCP_SESSION_TOKEN from session:issue");
        const rt = runtime ?? { snapshot: loadSnapshot(), store: new EventStore(eventsLogPath()), token };
        const auth = await resolveDeviceActor(rt.store, rt.snapshot, token);
        if (!auth.ok) throw new Error(auth.reason);
        const out = await call(String(msg.params?.name), (msg.params?.arguments ?? {}) as Record<string, unknown>, rt, auth.actor);
        return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        return reply({ content: [{ type: "text", text: (e as Error).message }], isError: true });
      }
    }
    case "ping": return reply({});
    default: return msg.id === undefined ? null : { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "method not found" } };
  }
}

if (process.argv[1]?.endsWith("mcp-server.ts")) {
  const rl = createInterface({ input: process.stdin });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let msg; try { msg = JSON.parse(line); } catch { return; }
    if (!msg || typeof msg !== "object" || typeof msg.method !== "string") return;
    const res = await handle(msg);
    if (res) process.stdout.write(JSON.stringify(res) + "\n");
  });
}
