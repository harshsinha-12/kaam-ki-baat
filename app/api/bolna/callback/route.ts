import { NextResponse } from "next/server";
import { checkServerKey } from "@/lib/auth/call-session";
import { getRuntime } from "@/lib/runtime-instance";
import { recordExecutionCallback } from "@/lib/zones/bolna-webhook";
import { readBody } from "@/lib/spatial/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bolna execution callback. Idempotent; late/duplicate/out-of-order callbacks are
// recorded once or ignored. Authenticated with KKB_CALLBACK_KEY (Bearer) because
// Bolna's signature scheme is not yet confirmed (docs/integration-design.md).
export async function POST(req: Request) {
  if (!checkServerKey(req.headers.get("authorization"), process.env.KKB_CALLBACK_KEY)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await readBody(req);
  if (!body) return NextResponse.json({ ok: false, error: "expected a bounded JSON object" }, { status: 400 });
  const res = await recordExecutionCallback(getRuntime().store, body);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
