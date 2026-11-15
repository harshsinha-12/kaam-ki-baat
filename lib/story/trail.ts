// The repository's story: every merged pull request on main, in order, told in
// plain words and tied to the parts of the product it shaped. Built from git by
// scripts/build-repo-story.ts into data/demo/repo-story.json.
//
// traceTrail() answers "where does this come from?" with a short, ordered list
// of sentences a voice agent can read out as-is: where it started, what changed
// it, and the latest change to look at first.

export interface StoryArea { id: string; label: string; plain: string; color: string; keywords: string[] }
export interface StoryChapter { id: string; title: string; plain: string }
export interface StoryPR {
  number: number;
  branch: string;
  title: string;
  what: string;
  chapter: string;
  areas: string[];
  authors: string[];
  mergedAt: string; // ISO
  mergeSha: string;
  filesChanged: number;
  topFolders: string[];
}
export interface RepoStory {
  repository: string;
  generatedFromSha: string;
  firstCommit: { sha: string; at: string; author: string; subject: string };
  totalCommits: number;
  areas: StoryArea[];
  chapters: StoryChapter[];
  prs: StoryPR[];
}

export interface Trail {
  question: string;
  areas: StoryArea[];
  prs: StoryPR[];
  sentences: string[];
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9#\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 || /^#?\d+$/.test(w));

export function clock(iso: string): string {
  const d = new Date(iso);
  // Story times are shown in IST, where the team built it.
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

/** Areas whose label or keywords appear in the question, best first. */
export function matchAreas(story: RepoStory, question: string): StoryArea[] {
  const q = ` ${question.toLowerCase()} `;
  const qw = new Set(words(question));
  const scored = story.areas.map((a) => {
    let score = 0;
    if (q.includes(a.label.toLowerCase())) score += 5;
    for (const k of a.keywords) {
      if (k.includes(" ") ? q.includes(k) : qw.has(k)) score += k.includes(" ") ? 3 : 2;
    }
    return { a, score };
  });
  return scored.filter((s) => s.score > 0).sort((x, y) => y.score - x.score).map((s) => s.a);
}

/** Answer "where does this come from?" with an ordered trail of PRs. */
export function traceTrail(story: RepoStory, question: string, max = 6): Trail {
  const explicit = [...question.matchAll(/(?:#|pr\s*|pull request\s*)(\d{1,4})/gi)].map((m) => Number(m[1]));
  const byNumber = new Map(story.prs.map((p) => [p.number, p]));
  if (explicit.length) {
    const prs = explicit.map((n) => byNumber.get(n)).filter((p): p is StoryPR => Boolean(p));
    const areas = story.areas.filter((a) => prs.some((p) => p.areas.includes(a.id)));
    const sentences = prs.length
      ? prs.map((p) => `Pull request ${p.number}, merged at ${clock(p.mergedAt)}: ${p.what} It touched ${p.filesChanged} files, mostly in ${p.topFolders.slice(0, 2).join(" and ")}.`)
      : [`I can't find pull request ${explicit.join(", ")} on main.`];
    return { question, areas, prs, sentences };
  }

  const areas = matchAreas(story, question);
  if (!areas.length) {
    return { question, areas: [], prs: [], sentences: [`I couldn't tie that to one part of the product. Try asking about ${story.areas.slice(0, 4).map((a) => a.label).join(", ")}.`] };
  }
  const main = areas[0];
  const all = story.prs.filter((p) => p.areas.includes(main.id));
  // Keep the first (where it started), the latest (where to look first) and the biggest in between.
  let prs = all;
  if (all.length > max) {
    const middle = all.slice(1, -1).sort((a, b) => b.filesChanged - a.filesChanged).slice(0, max - 2);
    prs = [all[0], ...middle, all[all.length - 1]].sort((a, b) => a.mergedAt.localeCompare(b.mergedAt));
  }
  const first = prs[0], last = prs[prs.length - 1];
  const sentences = [
    `${main.label}: ${main.plain} ${all.length} pull request${all.length === 1 ? "" : "s"} shaped it.`,
    `It started with pull request ${first.number} at ${clock(first.mergedAt)}: ${first.what}`,
    ...prs.slice(1, -1).map((p) => `Then pull request ${p.number}: ${p.what}`),
    ...(last !== first ? [`The latest change is pull request ${last.number} at ${clock(last.mergedAt)}: ${last.what} If something looks wrong here, start there.`] : [`That is the only change to it so far, so start there.`]),
  ];
  return { question, areas, prs, sentences };
}
