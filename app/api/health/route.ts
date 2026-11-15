import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime-instance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reports what is CONFIGURED, not what is proven. Proof lives in docs/plan.md.
export async function GET() {
  let snapshot: Record<string, unknown> = { loaded: false };
  try {
    const s = getRuntime().snapshot;
    snapshot = { loaded: true, label: s.label, repository: s.repository, pinnedSha: s.pinnedSha, fetchedAt: s.fetchedAt };
  } catch (e) {
    snapshot = { loaded: false, error: (e as Error).message };
  }
  return NextResponse.json({
    service: "kaam-ki-baat",
    snapshot,
    toolKeyConfigured: Boolean(process.env.KKB_TOOL_KEY),
    persistence: "append-only jsonl",
  });
}
