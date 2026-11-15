import { restoreConversations } from "../store/conversation";
import { checkServerKey, resolveCaller } from "../auth/call-session";
import { getRuntime } from "../runtime-instance";
import { SPACES, type PageState, type Space } from "./contracts";

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get("content-length")) > 16384) return null;
  // Stream with a bound; an absent/misleading content-length must not bypass it.
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export async function spatialAuth(req: Request, role: "browser" | "tool", token: unknown) {
  const expected = role === "browser" ? process.env.KKB_BOARD_KEY : process.env.KKB_TOOL_KEY;
  if (!checkServerKey(req.headers.get("authorization"), expected)) return { response: json({ ok: false, error: "unauthorized" }, 401) };
  // A local Next server may see localhost behind the authorized HTTPS tunnel.
  // Accept that explicitly configured public origin, never arbitrary forwarded hosts.
  const origins = new Set([new URL(req.url).origin]);
  try { if (process.env.KKB_PUBLIC_URL) origins.add(new URL(process.env.KKB_PUBLIC_URL).origin); } catch { /* invalid configuration grants no access */ }
  if (role === "browser" && req.headers.get("origin") && !origins.has(req.headers.get("origin")!)) {
    return { response: json({ ok: false, error: "origin not allowed" }, 403) };
  }
  const rt = await getRuntime();
  const auth = await resolveCaller(rt.store, rt.snapshot, token);
  if (!auth.ok) return { response: json({ ok: false, error: auth.reason }, auth.status) };
  await restoreConversations(rt);
  return { rt, caller: auth.caller };
}

export function parsePage(value: unknown): PageState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  if (!SPACES.includes(p.space as Space) || !(p.selectedEvidence === null || typeof p.selectedEvidence === "string" && p.selectedEvidence.length <= 300) ||
    !Array.isArray(p.visibleTargets) || p.visibleTargets.length > 100 || p.visibleTargets.some(id => typeof id !== "string" || id.length > 300)) return null;
  return { space: p.space as Space, selectedEvidence: p.selectedEvidence as string | null, visibleTargets: p.visibleTargets as string[] };
}
