import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime-instance";
import { runZoneAction, ZONE_ACTIONS, type ZoneAction } from "@/lib/zones/service";
import { readBody } from "@/lib/spatial/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Spatial zones API for the browser and the native AirPods companion.
// Auth: `Authorization: Session <device token>` issued by `npm run session:issue`.
// Role, repo access and leader step-up are decided server-side (lib/zones).
async function handle(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (!ZONE_ACTIONS.includes(action as ZoneAction)) return NextResponse.json({ ok: false, error: "unknown action" }, { status: 404 });
  if (req.method === "GET" && !["me", "deliveries", "leader_inbox", "focus-input"].includes(action))
    return NextResponse.json({ ok: false, error: "use POST for this action" }, { status: 405 });
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Session ") ? header.slice(8) : null;
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    const parsed = await readBody(req);
    if (!parsed) return NextResponse.json({ ok: false, error: "expected a bounded JSON object" }, { status: 400 });
    body = parsed;
  }
  const rt = await getRuntime();
  const res = await runZoneAction({ store: rt.store, snapshot: rt.snapshot }, action as ZoneAction, token, body);
  return NextResponse.json(res.body, { status: res.status });
}
export const GET = handle;
export const POST = handle;
