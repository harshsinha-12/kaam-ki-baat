"use client";
import { browserHandoff } from "@/lib/auth/browser-handoff";
// The workspace connects automatically. Existing prepared links also work;
// role and permissions remain server-owned. Memory supports private browsers
// where sessionStorage is unavailable, and overrides an expired link on renewal.
let currentToken: string | undefined;
export function saveSessionToken(token: string): void {
  currentToken = token;
  try { sessionStorage.setItem("kkb_session", token); } catch { /* memory only */ }
}
export function sessionToken(): string {
  if (typeof window === "undefined") return "";
  if (currentToken !== undefined) return currentToken;
  const token = browserHandoff().deviceToken;
  if (token) { saveSessionToken(token); return token; }
  try { return token || sessionStorage.getItem("kkb_session") || ""; } catch { return token; }
}
let connecting: Promise<void> | undefined;
export function connectWorkspaceSession(): Promise<void> {
  if (connecting) return connecting;
  connecting = (async () => {
    const response = await fetch("/api/workspace-session", { method: "POST", cache: "no-store", headers: { Authorization: `Session ${sessionToken()}` }, signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok || typeof data.token !== "string" || !/^[A-Za-z0-9_-]{16,256}$/.test(data.token)) throw new Error(data.error || "The workspace could not connect. Please retry.");
    saveSessionToken(data.token);
  })().finally(() => { connecting = undefined; });
  return connecting;
}
export async function zone<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<{ status: number; data: T & { ok?: boolean; error?: string } }> {
  const res = await fetch(`/api/zones/${action}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Session ${sessionToken()}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  return { status: res.status, data: await res.json() };
}
export const b64u = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
export const key = () => (crypto.randomUUID?.() ?? String(Math.random()).slice(2)).replace(/-/g, "");
