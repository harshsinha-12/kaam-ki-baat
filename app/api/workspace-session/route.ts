import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime-instance";
import { issueDeviceSession, resolveDeviceActor } from "@/lib/zones/identity";
import { openRepositoryWorkspace, repositoryRuntimeForDevice } from "@/lib/project/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

// The user chose an open demo workspace. Each browser gets its own device
// session in the existing member scope; this does not verify visitor identity.
export async function POST(req: Request) {
  try {
    const base = await getRuntime();
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Session ") ? authorization.slice(8) : "";
    const rt = await repositoryRuntimeForDevice(base, token);
    const existing = await resolveDeviceActor(rt.store, rt.snapshot, token);
    if (existing.ok) return NextResponse.json({ ok: true, token }, { headers });

    const member = rt.snapshot.participants.find(p => p.role !== "leader");
    if (!member) return NextResponse.json({ ok: false, error: "No member workspace is configured." }, { status: 503, headers });
    if (rt.snapshot !== base.snapshot) {
      const opened = await openRepositoryWorkspace(base, rt.snapshot, "renewed-public-session");
      return NextResponse.json({ ok: true, token: opened.token }, { headers });
    }
    const issued = await issueDeviceSession(rt.store, rt.snapshot, { participantId: member.id, deviceLabel: "Open browser workspace" });
    const verified = await resolveDeviceActor(rt.store, rt.snapshot, issued.token);
    if (!verified.ok || verified.actor.participant.id !== member.id) throw new Error("Session read-back failed");
    return NextResponse.json({ ok: true, token: issued.token }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "The workspace could not connect. Please retry." }, { status: 503, headers });
  }
}
