// Read Wispr through the connected, authenticated MCP client first. This command
// installs only the selected, approved passages; it never accesses OAuth secrets.
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { importWisprMeeting } from "../lib/adapters/wispr";
import type { EvidenceSnapshot } from "../lib/contracts";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
try {
  const source = arg("source"), snapshotPath = arg("snapshot"), approvedBy = arg("approved-by");
  if (!source || !snapshotPath || !approvedBy) throw Error("Usage: npm run meeting:import -- --source data/private/meeting.json --snapshot data/private/snapshot.json --approved-by <name> [--participants <id,id>] [--out data/private/snapshot.json]");
  const privateRoot = path.resolve("data/private") + path.sep;
  const out = path.resolve(arg("out") ?? snapshotPath);
  if (!out.startsWith(privateRoot)) throw Error("Output must stay in ignored data/private; never commit meeting content");
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as EvidenceSnapshot;
  const input = JSON.parse(readFileSync(source, "utf8"));
  const participants = (arg("participants") ?? "").split(",").map(x => x.trim()).filter(Boolean);
  const merged = importWisprMeeting(snapshot, input, approvedBy, participants);
  const encoded = JSON.stringify(merged, null, 2) + "\n";
  mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
  const temp = `${out}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const fd = openSync(temp, "wx", 0o600);
    try { writeFileSync(fd, encoded); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temp, out);
    if (readFileSync(out, "utf8") !== encoded) throw Error("Import read-back failed");
  } finally { try { unlinkSync(temp); } catch { /* renamed or never created */ } }
  console.log(`Wispr meeting import saved and read back: ${merged.meetings.length} meetings, ${merged.passages.length} passages. Restart the application against this private snapshot to load it.`);
} catch (e) {
  // Avoid printing source data, filesystem contents or a provider response.
  console.error(e instanceof SyntaxError ? "Invalid JSON input" : e instanceof Error ? e.message : "Import failed");
  process.exitCode = 1;
}
