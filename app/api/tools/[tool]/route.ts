import { NextResponse } from "next/server";
import { checkServerKey } from "@/lib/auth/call-session";
import { getRuntime } from "@/lib/runtime-instance";
import { runTool, TOOL_NAMES, type ToolName } from "@/lib/tools/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bolna custom function endpoint: POST /api/tools/{get_my_brief|get_task_evidence|get_changes|record_task_update}
// Headers: Authorization: Bearer $KKB_TOOL_KEY. Body must include call_token (from Bolna user_data).
export async function POST(req: Request, ctx: { params: Promise<{ tool: string }> }) {
  const { tool } = await ctx.params;
  if (!TOOL_NAMES.includes(tool as ToolName)) return NextResponse.json({ ok: false, error: "unknown tool" }, { status: 404 });
  if (!checkServerKey(req.headers.get("authorization"), process.env.KKB_TOOL_KEY)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* empty body */ }
  const res = await runTool(await getRuntime(), tool as ToolName, body);
  return NextResponse.json(res.body, { status: res.status });
}
