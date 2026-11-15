import { NextResponse } from "next/server";
import { checkServerKey } from "@/lib/auth/call-session";
import { getRuntime } from "@/lib/runtime-instance";
import { recordExecutionCallback } from "@/lib/zones/bolna-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bolna execution callback. Idempotent; late/duplicate/out-of-order callbacks are
// recorded once or ignored. Authenticated with KKB_CALLBACK_KEY (Bearer) because
// Bolna's signature scheme is not yet confirmed (docs/integration-design.md).
export async function POST(req: Request) {
  if (!checkServerKey(req.headers.get("authorization"), process.env.KKB_CALLBACK_KEY)) return NextResponse.json({ ok: false }, { status: 401 });
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* empty */ }
  const res = await recordExecutionCallback(getRuntime().store, body);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
