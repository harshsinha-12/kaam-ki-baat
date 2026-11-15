// Build the evidence snapshot the runtime answers from.
//
//   npm run snapshot -- --project data/private/project.json        (live)
//   npm run snapshot -- --project data/demo/project.fixture.json   (fixture)
//
// Code files are read from the LOCAL git object store at an exact SHA (real,
// pinned evidence). PR + check state come from the GitHub REST API. The meeting
// comes from a JSON file written by an agent that read ONE approved meeting
// through the Wispr MCP (see docs/plan.md → "Wispr import").
// The snapshot is LIVE only if the meeting is LIVE and GitHub was read live.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CheckRecord, EvidenceSnapshot, MeetingPassage, MeetingRecord, Participant, PullRequestRecord, Task } from "../lib/contracts";
import { githubClient } from "../lib/adapters/github";

interface ProjectConfig {
  repository: string;
  sha?: string; // default: git rev-parse HEAD
  paths: string[];
  meetingFile: string;
  participants: Participant[];
  tasks: Task[];
  out: string;
  offlineGithubFile?: string; // fixture fallback ONLY; forces label FIXTURE
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const cfgPath = arg("project") ?? "data/private/project.json";
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8")) as ProjectConfig;
  const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const sha = (arg("sha") ?? cfg.sha ?? git("rev-parse", "HEAD")).trim();

  const files = git("ls-tree", "-r", "--name-only", sha, "--", ...cfg.paths)
    .split("\n")
    .filter((p) => /\.(ts|tsx|js|mjs|md)$/.test(p))
    .map((p) => ({ path: p, content: git("show", `${sha}:${p}`) }));

  const meetingDoc = JSON.parse(readFileSync(cfg.meetingFile, "utf8")) as { meeting: MeetingRecord; passages: MeetingPassage[] };

  let pullRequests: PullRequestRecord[] = [];
  let checks: CheckRecord[] = [];
  let githubLive = false;
  const prNumbers = [...new Set(cfg.tasks.map((t) => t.prNumber).filter((n): n is number => n != null))];
  try {
    const gh = githubClient(cfg.repository);
    pullRequests = await Promise.all(prNumbers.map((n) => gh.pullRequest(n)));
    const shas = [...new Set(pullRequests.flatMap((p) => [p.headSha, p.mergedSha].filter(Boolean) as string[]))];
    checks = (await Promise.all(shas.map((s) => gh.checksFor(s)))).flat();
    githubLive = true;
  } catch (e) {
    if (!cfg.offlineGithubFile) throw e;
    console.warn(`GitHub read failed (${(e as Error).message}); using offline file ${cfg.offlineGithubFile} — snapshot will be FIXTURE`);
    const off = JSON.parse(readFileSync(cfg.offlineGithubFile, "utf8"));
    pullRequests = off.pullRequests;
    checks = off.checks;
  }

  const label = meetingDoc.meeting.source === "LIVE" && githubLive ? "LIVE" : "FIXTURE";
  const snapshot: EvidenceSnapshot = {
    label,
    note: label === "FIXTURE" ? "FIXTURE: contains synthetic or offline data — not live evidence" : undefined,
    repository: cfg.repository,
    pinnedSha: sha,
    fetchedAt: new Date().toISOString(),
    meetings: [meetingDoc.meeting],
    passages: meetingDoc.passages,
    files,
    pullRequests,
    checks,
    tasks: cfg.tasks,
    participants: cfg.participants,
  };
  const out = arg("out") ?? cfg.out;
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot, null, 2));
  console.log(`${label} snapshot → ${out}: ${files.length} files @ ${sha.slice(0, 7)}, ${pullRequests.length} PRs, ${checks.length} checks, ${cfg.tasks.length} tasks`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
