import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// This endpoint deliberately discloses only public Git provenance, never secrets.
export function GET() {
  return NextResponse.json({
    project: "kaam-ki-baat",
    provider: "vercel",
    gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    gitRepoOwner: process.env.VERCEL_GIT_REPO_OWNER ?? null,
    gitRepo: process.env.VERCEL_GIT_REPO_SLUG ?? null,
    verification: "source-provenance-only",
  }, {headers:{"Cache-Control":"no-store"}});
}
