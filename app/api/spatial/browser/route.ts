import { buildSpatialContext } from "@/lib/spatial/context";
import { getSpatialBridge } from "@/lib/spatial/bridge";
import { json, parsePage, readBody, spatialAuth } from "@/lib/spatial/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await spatialAuth(req, "browser", req.headers.get("x-kkb-call-token"));
  if (auth.response) return auth.response;
  const body = await readBody(req);
  const page = parsePage(body?.page);
  if (!body || !page) return json({ ok: false, error: "invalid page state" }, 400);
  const { rt, caller } = auth;
  let receipt: { id: string; result: { ok: boolean; message: string } } | undefined;
  if (body.receipt !== undefined) {
    const r = body.receipt as { id?: unknown; result?: { ok?: unknown; message?: unknown } } | null;
    if (!r || typeof r.id !== "string" || r.id.length > 100 || typeof r.result?.ok !== "boolean" || typeof r.result.message !== "string" || r.result.message.length > 500) {
      return json({ ok: false, error: "invalid receipt" }, 400);
    }
    receipt = { id: r.id, result: { ok: r.result.ok, message: r.result.message } };
  }
  const context = buildSpatialContext(rt, caller, page, true);
  const actions = getSpatialBridge().heartbeat(caller.session.callId, Date.parse(caller.session.expiresAt), context.page, receipt);
  return json({ ok: true, context, actions, webCallEnabled: process.env.KKB_ENABLE_WEB_CALLS === "true" && !!process.env.BOLNA_AGENT_ID && !!process.env.BOLNA_API_KEY });
}
