import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime-instance";
import { runZoneAction, ZONE_ACTIONS, type ZoneAction } from "@/lib/zones/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Spatial zones API for the browser and the native AirPods companion.
// Auth: `Authorization: Session <device token>` issued by `npm run session:issue`.
// Role, repo access and leader step-up are decided server-side (lib/zones).
async function handle(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (!ZONE_ACTIONS.includes(action as ZoneAction)) return NextResponse.json({ ok: false, error: "unknown action" }, { status: 404 });
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Session ") ? header.slice(8) : null;
  let body: Record<string, unknown> = {};
  if (req.method === "POST") { try { body = (await req.json()) as Record<string, unknown>; } catch { /* empty */ } }
  const rt = getRuntime();
  const res = await runZoneAction({ store: rt.store, snapshot: rt.snapshot }, action as ZoneAction, token, body);
  return NextResponse.json(res.body, { status: res.status });
}
export const GET = handle;
export const POST = handle;
