import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime-instance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reports what is CONFIGURED, not what is proven. Proof lives in docs/plan.md.
export async function GET() {
  let snapshot: Record<string, unknown> = { loaded: false };
  try {
    const rt = await getRuntime();
    await rt.store.all();
    const s = rt.snapshot;
    snapshot = { loaded: true, label: s.label, repository: s.repository, pinnedSha: s.pinnedSha, fetchedAt: s.fetchedAt };
  } catch (e) {
    snapshot = { loaded: false, error: "Runtime storage or evidence snapshot is not configured or unavailable." };
  }
  return NextResponse.json({
    service: "kaam-ki-baat",
    snapshot,
    toolKeyConfigured: Boolean(process.env.KKB_TOOL_KEY),
    persistence: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL ? "hosted-redis" : "append-only jsonl",
  }, { status: snapshot.loaded ? 200 : 503 });
}
