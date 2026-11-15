"use client";
// Browser helper for /api/zones/*. The session token comes from the link the
// operator generates (`npm run session:issue`) as #t=<token>, then lives in
// sessionStorage. Role and permissions are decided by the server, never here.
export function sessionToken(): string {
  if (typeof window === "undefined") return "";
  const m = window.location.hash.match(/t=([A-Za-z0-9_-]+)/);
  if (m) { try { sessionStorage.setItem("kkb_session", m[1]); } catch { /* private mode */ } history.replaceState(null, "", window.location.pathname); }
  try { return m?.[1] ?? sessionStorage.getItem("kkb_session") ?? ""; } catch { return m?.[1] ?? ""; }
}
export async function zone<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<{ status: number; data: T & { ok?: boolean; error?: string } }> {
  const res = await fetch(`/api/zones/${action}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Session ${sessionToken()}` }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}
export const b64u = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
export const key = () => (crypto.randomUUID?.() ?? String(Math.random()).slice(2)).replace(/-/g, "");
