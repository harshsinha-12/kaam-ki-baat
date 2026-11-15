// Synthetic only: wraps the actual backend dispatcher in isolated localhost HTTP.
// No private snapshot, environment, live call runtime or provider is read.
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const backend = resolve(process.argv[2] ?? "../../../");
  const configPath = process.argv[3];
  if (!configPath) throw new Error("Usage: tsx Tests/fixture-server.ts <backend-root> <private-config-path>");
  const load = (path: string) => import(pathToFileURL(join(backend, path)).href);
  const [{ EventStore }, { issueDeviceSession }, { runZoneAction, ZONE_ACTIONS }] = await Promise.all([
    load("lib/store/event-store.ts"), load("lib/zones/identity.ts"), load("lib/zones/service.ts"),
  ]);
  if (!ZONE_ACTIONS.includes("focus-input")) throw new Error("Backend needs Tab 4 focus-input API (36443a2 or later)");
  const snapshot = JSON.parse(await readFile(join(backend, "data/demo/snapshot.fixture.json"), "utf8"));
  const participantId = "p_airpods_synthetic";
  snapshot.participants = [{ id: participantId, name: "Synthetic AirPods tester", meetingIds: [], role: "member", repoAccess: true }];
  const temporary = await mkdtemp(join(tmpdir(), "kkb-airpods-http-"));
  const store = new EventStore(join(temporary, "events.jsonl"));
  const { token } = await issueDeviceSession(store, snapshot, { participantId, deviceLabel: "Synthetic HTTP test only" });
  const rt = { store, snapshot };
  const initial = await runZoneAction(rt, "focus", token, { provider: "manual", zone: "team_memory", seq: 1_700_000_000_000 });
  if (initial.status !== 200) throw new Error("Fixture focus setup failed");
  const server = createServer(async (req, res) => {
    try {
      const action = new URL(req.url ?? "/", "http://localhost").pathname.split("/").pop();
      if (!ZONE_ACTIONS.includes(action)) { res.writeHead(404).end(); return; }
      let raw = "";
      for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 8192) throw new Error("bounded fixture body"); }
      const auth = req.headers.authorization ?? "";
      const result = await runZoneAction(rt, action, auth.startsWith("Session ") ? auth.slice(8) : null, raw ? JSON.parse(raw) : {});
      res.writeHead(result.status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(result.body));
    } catch { res.writeHead(500).end('{"ok":false,"error":"fixture failure"}'); }
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  await writeFile(configPath, JSON.stringify({ origin: `http://127.0.0.1:${port}`, token, fixture: true }), { mode: 0o600 });
  console.log("SYNTHETIC_FIXTURE_READY (private temporary session config written; no hardware)");
  const stop = () => server.close(() => { void Promise.all([rm(temporary, { recursive: true, force: true }), rm(configPath, { force: true })]).then(() => process.exit(0)); });
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
}
main().catch(e => { console.error(e.message); process.exit(1); });
