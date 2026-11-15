import { NextResponse } from "next/server";
import storyData from "@/data/demo/repo-story.json";
import { clock, traceTrail, type RepoStory } from "@/lib/story/trail";

export const runtime = "nodejs";

const story = storyData as unknown as RepoStory;

// Read-only, plain-language history of this repository for the voice agent.
//   GET /api/story              → chapters and the list of merged PRs
//   GET /api/story?q=<question> → the trail of PRs behind that part of the product,
//                                 as sentences ready to be spoken
// Public data only: built from the public git history; no meeting content.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (q) {
    const t = traceTrail(story, q.slice(0, 300));
    return NextResponse.json({
      question: t.question,
      area: t.areas[0]?.label ?? null,
      say: t.sentences,
      prs: t.prs.map((p) => ({ number: p.number, title: p.title, mergedAt: p.mergedAt, url: `https://github.com/${story.repository}/pull/${p.number}` })),
    });
  }
  return NextResponse.json({
    repository: story.repository,
    builtFrom: story.generatedFromSha,
    summary: `${story.prs.length} pull requests merged into main between ${clock(story.firstCommit.at)} and ${clock(story.prs[story.prs.length - 1].mergedAt)}, across ${story.totalCommits} commits.`,
    chapters: story.chapters.map((c) => ({ title: c.title, plain: c.plain, prs: story.prs.filter((p) => p.chapter === c.id).map((p) => `#${p.number} ${p.title}`) })),
    areas: story.areas.map((a) => ({ label: a.label, plain: a.plain })),
  });
}
