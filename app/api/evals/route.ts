import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readDashboard, syncDashboard } from "@/lib/eval/dashboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function GET(req: Request) {
  const expected = process.env.KKB_BOARD_KEY ?? "";
  const supplied = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return NextResponse.json({ error: "Open your private operator evaluation link to view calls." }, { status: 401, headers });
  try { return NextResponse.json({ ok: true, ...await syncDashboard(), stale: false }, { headers }); }
  catch {
    const saved = await readDashboard().catch(() => null);
    if (saved && saved.agentId === process.env.BOLNA_AGENT_ID) return NextResponse.json({ ok: true, ...saved, stale: true, warnings: [...saved.warnings, "Bolna refresh failed. Showing the last persisted evaluation; retry shortly."] }, { headers });
    return NextResponse.json({ error: "Evaluation refresh unavailable. Check server Bolna configuration and retry." }, { status: 503, headers });
  }
}
