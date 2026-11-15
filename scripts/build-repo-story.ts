// Builds data/demo/repo-story.json: every pull request merged into main, in
// order, with git facts (merge time, merge SHA, authors, files changed) plus a
// short plain-language note per PR that a voice agent can read aloud.
//
//   npm run story            # rebuild from the local git history
//
// Facts come from git. The one-line "what" text and the area tags are curated
// below; a PR merged after this file was last edited still appears, with its
// branch name as the title, so nothing is silently dropped.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import type { RepoStory, StoryArea, StoryChapter, StoryPR } from "../lib/story/trail";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();

const AREAS: StoryArea[] = [
  { id: "plan", label: "Plan & team rules", color: "#c9c4b6", plain: "the shared plan and the rules every agent and teammate follows.", keywords: ["plan", "rules", "agents", "architecture", "decision", "docs", "handoff", "process"] },
  { id: "memory", label: "Team Memory", color: "#7cc4ff", plain: "what the team said in the meeting, imported from Wispr Flow and kept with exact quotes.", keywords: ["meeting", "memory", "wispr", "decided", "decision", "brief", "transcript", "team memory", "said", "left", "freeze"] },
  { id: "leader", label: "Leader Desk", color: "#f5c451", plain: "the leader-only desk where open questions are escalated and approved.", keywords: ["leader", "approve", "approval", "escalate", "escalation", "clarify", "passkey", "desk", "private", "charan", "center"] },
  { id: "code", label: "Code Navigator", color: "#ff8a65", plain: "finding the exact file, function, line and test behind a decision.", keywords: ["code", "navigator", "file", "function", "line", "graph", "search", "where", "saved", "graphify", "right", "repo", "codebase"] },
  { id: "evidence", label: "PR & CI checks", color: "#6fdc8c", plain: "reading pull requests and test results from GitHub, pinned to a commit.", keywords: ["github", "ci", "check", "checks", "pull", "test passed", "verify", "evidence", "sha", "commit", "merged"] },
  { id: "voice", label: "Voice calls", color: "#b48cff", plain: "the Bolna voice agent: phone and browser calls, listening and speaking.", keywords: ["voice", "call", "calls", "bolna", "phone", "speak", "listen", "microphone", "mic", "audio"] },
  { id: "focus", label: "Head turn & input", color: "#5ee3d1", plain: "choosing an agent by turning your head, with the webcam, AirPods or keyboard.", keywords: ["head", "turn", "look", "webcam", "camera", "airpods", "focus", "keyboard", "tracking", "spatial", "zone", "zones"] },
  { id: "site", label: "Website & demo", color: "#ff6bb5", plain: "the landing page, workspace screens, code graph pages and deployment.", keywords: ["website", "site", "landing", "page", "ui", "screen", "deploy", "vercel", "demo", "board", "workspace"] },
  { id: "quality", label: "Tests & call reviews", color: "#d6e36b", plain: "automated tests and the review of each real call.", keywords: ["test", "tests", "evaluation", "eval", "review", "quality", "bug", "fix", "acceptance"] },
];

const CHAPTERS: StoryChapter[] = [
  { id: "idea", title: "1 · The idea, written down", plain: "The plan, the rules for working in parallel, and one agreed architecture." },
  { id: "core", title: "2 · The evidence core", plain: "The brain: decisions tied to code, safe task updates and GitHub evidence." },
  { id: "zones", title: "3 · Three zones come alive", plain: "Left, center and right agents in the browser, plus the leader's escalation desk." },
  { id: "explain", title: "4 · Making it understandable", plain: "A landing page, a code graph and private access for the leader's device." },
  { id: "senses", title: "5 · Hearing and seeing the team", plain: "The first real phone call, webcam head tracking and AirPods motion." },
  { id: "demo", title: "6 · Demo-ready", plain: "Call reviews, deployment, voice that follows your head, and the graph explorer." },
];

// Curated, plain-language note for each merged PR (what changed, for a listener).
const NOTES: Record<number, { title: string; what: string; chapter: string; areas: string[] }> = {
  1: { title: "Project plan", what: "Harsh wrote the first plan: which tools to connect and how each call will be judged.", chapter: "idea", areas: ["plan"] },
  3: { title: "Agent ground rules", what: "Shared start-up and hand-off rules, so Claude, Codex and the team can work side by side.", chapter: "idea", areas: ["plan"] },
  4: { title: "One architecture", what: "The design was settled in one place: three agents, one evidence core, one source of truth.", chapter: "idea", areas: ["plan"] },
  2: { title: "Evidence core", what: "The heart of the product: a decision is linked to its code, its pull request and its test, with left, center and right specialists.", chapter: "core", areas: ["code", "evidence", "quality"] },
  5: { title: "Safe task updates", what: "Saving a task update became one-at-a-time and only for the accepted owner, so nothing is overwritten.", chapter: "core", areas: ["evidence", "quality"] },
  7: { title: "Sturdier GitHub reading", what: "GitHub evidence now reads every page of results and says plainly when GitHub limits requests.", chapter: "core", areas: ["evidence"] },
  8: { title: "Demo readiness", what: "Call reviews were recovered and Bolna was given the web addresses it calls back to.", chapter: "core", areas: ["voice", "quality"] },
  9: { title: "Spatial design", what: "Charan specified how looking left, straight or right picks an agent, and how questions escalate to the leader.", chapter: "zones", areas: ["focus", "leader", "plan"] },
  10: { title: "Browser workspace", what: "The three zones appeared in the browser and the Bolna agent could act on the page.", chapter: "zones", areas: ["focus", "voice", "site"] },
  11: { title: "Leader escalation", what: "When the team asks something nobody decided, it goes to the leader; the answer is verified and replayed to whoever asked.", chapter: "zones", areas: ["leader", "memory"] },
  14: { title: "Call review notes", what: "A short design for reviewing each real call after it ends.", chapter: "zones", areas: ["quality"] },
  12: { title: "Live meeting import", what: "A real, approved meeting was imported with exact quotes, and calls were held until the participant confirmed consent.", chapter: "zones", areas: ["memory", "voice"] },
  13: { title: "Landing page", what: "A story-driven landing page with an interactive stage of the three zones.", chapter: "explain", areas: ["site"] },
  15: { title: "Code context retrieval", what: "The Code Navigator learned to pull the right functions and their neighbours from a code graph.", chapter: "explain", areas: ["code"] },
  16: { title: "Code graph & leader device", what: "Phone answers from the code graph, a passkey so only the leader's device opens the Leader Desk, and demo meeting notes.", chapter: "explain", areas: ["code", "leader", "memory", "site"] },
  18: { title: "Access follow-up", what: "Tightened who can see which evidence, and kept call routing safe.", chapter: "explain", areas: ["leader", "code"] },
  19: { title: "First phone call", what: "The first real Bolna phone call ran 48 seconds, and the task it talked about now carries over correctly.", chapter: "senses", areas: ["voice", "quality"] },
  20: { title: "Input arbitration", what: "Webcam head tracking was added, and only one input at a time can choose the active agent.", chapter: "senses", areas: ["focus"] },
  21: { title: "First-principles answers", what: "Code answers are explained from first principles inside the browser, with keyboard shortcuts and a test plan.", chapter: "senses", areas: ["code", "site", "focus"] },
  22: { title: "Webcam controls", what: "The webcam controls were placed into the workspace and styled to match.", chapter: "senses", areas: ["focus", "site"] },
  24: { title: "AirPods companion", what: "A small Mac app reads AirPods head motion so turning your head picks the agent.", chapter: "senses", areas: ["focus"] },
  23: { title: "Better listening", what: "The voice agent listens better and guides a teammate through the repository on a call.", chapter: "senses", areas: ["voice", "code"] },
  26: { title: "Call review ledger", what: "Each real call gets a small private review and an acceptance record.", chapter: "demo", areas: ["quality"] },
  25: { title: "Listener avatar & deploy", what: "An expressive listening avatar on the site, and automatic deployment to Vercel on every merge.", chapter: "demo", areas: ["site"] },
  27: { title: "Final integration", what: "The prepared browser demo connects without copying any secret tokens.", chapter: "demo", areas: ["voice", "site"] },
  28: { title: "Repository guide", what: "The team workspace follows the camera, and the Bolna agent got a guide to this repository.", chapter: "demo", areas: ["focus", "code", "voice"] },
  29: { title: "Live demo graph", what: "A live code graph on the site, voice waveforms, and clear 'asking' and 'answering' moments.", chapter: "demo", areas: ["site", "code", "voice"] },
  30: { title: "Voice follows your head", what: "Continuous voice chat now talks to whichever agent your head is pointing at.", chapter: "demo", areas: ["voice", "focus"] },
  31: { title: "Code graph explorer", what: "A searchable code graph page that shows exactly how the Code Navigator found its answer.", chapter: "demo", areas: ["code", "site"] },
  32: { title: "Visible voice start", what: "The voice start button and microphone state stay visible while head tracking is on.", chapter: "demo", areas: ["voice", "focus"] },
};

// For a PR without a curated note: tag areas from the paths it touched.
const PATH_AREAS: [RegExp, string][] = [
  [/^lib\/zones|leader|passkey/, "leader"], [/^lib\/(focus|spatial)|^native\/|webcam/, "focus"], [/bolna|voice|call/, "voice"],
  [/^lib\/(specialists|codegraph|evidence)|graph/, "code"], [/^lib\/adapters|^lib\/core\/reconcile/, "evidence"], [/meeting|wispr/, "memory"],
  [/^app\/|^\.github\/workflows\/deploy/, "site"], [/^tests\/|^lib\/eval/, "quality"], [/^docs\/|AGENTS\.md|README/, "plan"],
];
function areasFromFiles(files: string[]): string[] {
  const hits = new Map<string, number>();
  for (const f of files) for (const [re, id] of PATH_AREAS) if (re.test(f)) { hits.set(id, (hits.get(id) ?? 0) + 1); break; }
  const ranked = [...hits.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 3);
  return ranked.length ? ranked : ["plan"];
}

const repository = "harshsinha-12/kaam-ki-baat";
const head = git("rev-parse", "HEAD");
const [firstSha, firstAt, firstAuthor, ...firstSubject] = git("log", "--reverse", "--format=%h%x09%aI%x09%an%x09%s", "main").split("\n")[0].split("\t");
const totalCommits = Number(git("rev-list", "--count", "main"));

const merges = git("log", "--merges", "--first-parent", "main", "--reverse", "--format=%H%x09%cI%x09%s").split("\n").filter(Boolean);
const prs: StoryPR[] = [];
for (const line of merges) {
  const [sha, at, subject] = line.split("\t");
  const m = /Merge pull request #(\d+) from [^/]+\/(\S+)/.exec(subject);
  if (!m) continue;
  const number = Number(m[1]);
  const branch = m[2];
  const files = git("diff", "--name-only", `${sha}^1`, sha).split("\n").filter(Boolean);
  const folders = new Map<string, number>();
  for (const f of files) { const d = f.includes("/") ? f.split("/").slice(0, 2).join("/").replace(/\/[^/]*\.[a-z]+$/, "") : "root"; folders.set(d, (folders.get(d) ?? 0) + 1); }
  const authors = [...new Set(git("log", "--no-merges", "--format=%an", `${sha}^1..${sha}^2`).split("\n").filter(Boolean))];
  const note = NOTES[number] ?? { title: branch, what: `Merged branch ${branch}.`, chapter: CHAPTERS[CHAPTERS.length - 1].id, areas: areasFromFiles(files) };
  prs.push({
    number, branch, title: note.title, what: note.what, chapter: note.chapter, areas: note.areas,
    authors, mergedAt: new Date(at).toISOString(), mergeSha: sha.slice(0, 7), filesChanged: files.length,
    topFolders: [...folders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d),
  });
}

const story: RepoStory = {
  repository, generatedFromSha: head.slice(0, 7),
  firstCommit: { sha: firstSha, at: new Date(firstAt).toISOString(), author: firstAuthor, subject: firstSubject.join("\t") },
  totalCommits, areas: AREAS, chapters: CHAPTERS, prs,
};
const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "data/demo/repo-story.json";
writeFileSync(out, `${JSON.stringify(story, null, 2)}\n`);
console.log(`repo story: ${prs.length} merged PRs, ${totalCommits} commits, from ${story.firstCommit.sha} to ${story.generatedFromSha} → ${out}`);
