// Read-only network checks. Never issues a call token, starts Bolna, or writes
// task status. Only the redacted readiness report is saved locally.
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadSnapshot } from "../lib/evidence/load";
import { agentChecks, readinessReport, sourceChecks, type ReadinessCheck } from "../lib/eval/readiness";
import { buildBolnaTools } from "../lib/adapters/bolna";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const root = path.resolve(arg("root") ?? process.cwd());
  process.chdir(root);
  try { process.loadEnvFile(path.join(root, ".env.local")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const base = process.env.KKB_PUBLIC_URL ?? "";
  const key = process.env.KKB_TOOL_KEY ?? "";
  buildBolnaTools(base, key); // Reuse strict HTTPS-origin and server-key checks.
  const snapshot = loadSnapshot(root);
  const checks: ReadinessCheck[] = sourceChecks(snapshot);
  checks.push({ name: "board_key", state: (process.env.KKB_BOARD_KEY?.length ?? 0) >= 32 && process.env.KKB_BOARD_KEY !== key ? "pass" : "fail", detail: "Board and tool keys must be distinct random server credentials." });
  let raw: unknown;
  try { raw = JSON.parse(await readFile(arg("agent-file") ?? "data/private/bolna-agent-readback.json", "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  checks.push(...agentChecks(raw, base, key, !process.argv.includes("--phone-only")));

  async function probe(name: string, endpoint: string, expected: number, options: RequestInit = {}) {
    try {
      const response = await fetch(`${base}${endpoint}`, { ...options, redirect: "error", signal: AbortSignal.timeout(10_000) });
      const statusOK = response.status === expected;
      if (name === "public_snapshot" || name === "authenticated_board") {
        const body = await response.json() as any;
        const serviceOK = name === "public_snapshot" ? body.service === "kaam-ki-baat" && body.snapshot?.loaded === true && body.toolKeyConfigured === true : body.ok === true;
        checks.push({ name, state: statusOK && serviceOK && body.snapshot?.label === "LIVE" && body.snapshot?.pinnedSha === snapshot.pinnedSha && body.snapshot?.repository === snapshot.repository && body.snapshot?.fetchedAt === snapshot.fetchedAt ? "pass" : "fail", detail: "Public server must authenticate the configured credentials and run the same LIVE snapshot, including its fetch timestamp." });
      } else if (name === "invalid_caller") {
        const body = await response.json() as any;
        checks.push({ name, state: statusOK && body.ok === false && body.error === "unknown call token" ? "pass" : "fail", detail: "The server must accept the tool key, then reject the unknown caller token." });
      } else {
        checks.push({ name, state: statusOK ? "pass" : "fail", detail: `Expected HTTP ${expected}; received HTTP ${response.status}.` });
      }
    } catch {
      checks.push({ name, state: "fail", detail: "Endpoint unavailable or invalid response; no server credentials or provider error bodies are exported." });
    }
  }
  // Keep probes sequential to make failures easy to trace and avoid concurrent
  // warm-up requests against a single demo server.
  await probe("public_snapshot", "/api/health", 200);
  await probe("unauthenticated_tools", "/api/tools/get_my_brief", 401, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  await probe("invalid_caller", "/api/tools/get_my_brief", 401, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ call_token: "preflight-invalid-token" }) });
  await probe("unauthenticated_board", "/api/board", 401);
  await probe("authenticated_board", `/api/board?key=${encodeURIComponent(process.env.KKB_BOARD_KEY ?? "")}`, 200);
  const report = readinessReport(checks);
  await mkdir("data/private", { recursive: true });
  await writeFile("data/private/demo-readiness.json", JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  for (const check of checks) console.log(`${check.state.toUpperCase()} ${check.name}: ${check.detail}`);
  console.log(`Setup ready: ${report.setupReady}. Calls held. Report: data/private/demo-readiness.json`);
  if (!report.setupReady) process.exitCode = 1;
}

main().catch(() => { console.error("Preflight failed: check the private snapshot, environment, saved agent read-back and server. No call started."); process.exitCode = 1; });
