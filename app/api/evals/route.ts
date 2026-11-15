import { NextResponse } from "next/server";
import { readDashboard, syncDashboard } from "@/lib/eval/dashboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function GET() {
  try { return NextResponse.json({ ok: true, ...await syncDashboard(), stale: false }, { headers }); }
  catch {
    const saved = await readDashboard().catch(() => null);
    if (saved && saved.agentId === process.env.BOLNA_AGENT_ID) return NextResponse.json({ ok: true, ...saved, stale: true, warnings: [...saved.warnings, "Bolna refresh failed. Showing the last persisted evaluation; retry shortly."] }, { headers });
    return NextResponse.json({ error: "Evaluation refresh unavailable. Check server Bolna configuration and retry." }, { status: 503, headers });
  }
}
