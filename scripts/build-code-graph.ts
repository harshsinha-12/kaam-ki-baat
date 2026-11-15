// Local opt-in build. Stage only the snapshot's authorized code, at its exact
// Git SHA. Never scan the working tree, private meeting files, or runtime logs.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { EvidenceSnapshot } from "../lib/contracts";
import { importGraphify } from "../lib/adapters/graphify";
import { safeSourcePath } from "../lib/evidence/code-graph";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const value = process.argv[i + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing --${name} value`);
  return value;
};

function main() {
  const snapshot = JSON.parse(readFileSync(arg("snapshot") ?? "data/private/snapshot.json", "utf8")) as EvidenceSnapshot;
  const out = path.resolve(arg("out") ?? "data/private/code-graph.json");
  if (!/^[a-f0-9]{7,40}$/i.test(snapshot.pinnedSha)) throw new Error("Snapshot needs a Git commit SHA");
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const fullSha = git("rev-parse", "--verify", `${snapshot.pinnedSha}^{commit}`).trim();
  const files = snapshot.files.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(f.path));
  if (!files.length) throw new Error("Snapshot contains no supported code files");
  // Check every byte before invoking a third-party tool. No credentials or
  // private source data are passed through process arguments or log messages.
  for (const file of files) {
    if (!safeSourcePath(file.path)) throw new Error("Unsafe snapshot file path");
    if (git("show", `${fullSha}:${file.path}`) !== file.content) throw new Error("Snapshot content does not match the pinned Git commit; rebuild the snapshot");
  }
  const binary = process.env.GRAPHIFY_BIN || "graphify";
  const run = (args: string[], cwd: string) => execFileSync(binary, args, { cwd, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const root = mkdtempSync(path.join(tmpdir(), "kkb-graphify-"));
  try {
    const version = run(["--version"], root).trim();
    for (const file of files) {
      const target = path.join(root, file.path);
      mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, file.content, { mode: 0o600 });
    }
    run(["extract", ".", "--code-only", "--no-cluster", "--max-workers", "1"], root);
    const raw = JSON.parse(readFileSync(path.join(root, "graphify-out/graph.json"), "utf8"));
    const graph = importGraphify(raw, { ...snapshot, files }, root, version);
    mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
    const temporary = `${out}.${process.pid}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(graph, null, 2), { mode: 0o600, flag: "wx" });
      // Verify serialization before atomically replacing a previous valid graph.
      if (JSON.parse(readFileSync(temporary, "utf8")).nodes.length !== graph.nodes.length) throw new Error("Graph read-back failed");
      renameSync(temporary, out);
    } finally { rmSync(temporary, { force: true }); }
    console.log(`Graphify context: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${Object.keys(graph.fileHashes).length} files @ ${snapshot.pinnedSha.slice(0, 7)} → ${out}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

try { main(); } catch (e) {
  // Do not print captured third-party stderr, which may contain source text.
  console.error(e && typeof e === "object" && "status" in e ? "Graphify command failed. Install graphifyy with Python 3.10+ and check GRAPHIFY_BIN; previous graph preserved." : (e as Error).message);
  process.exitCode = 1;
}
