import { acquireLease } from "@/lib/store/lease";
import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime-instance";
import { resolveDeviceActor } from "@/lib/zones/identity";
import { issueCallSession } from "@/lib/auth/call-session";
import { readBody } from "@/lib/spatial/http";
import { getCodeGraph } from "@/lib/codegraph/load";
import { ev, focusState } from "@/lib/zones/state";
import { projectContext, repositoryName } from "@/lib/project/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const rt = await getRuntime();
  const header = req.headers.get("authorization") ?? "";
  const auth = await resolveDeviceActor(rt.store, rt.snapshot, header.startsWith("Session ") ? header.slice(8) : null);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status });
  if (!auth.actor.repoAccess) return NextResponse.json({ ok: false, error: "Repository access is not permitted for this session." }, { status: 403 });
  const body = await readBody(req);
  if (!body || repositoryName(body.repositoryUrl) !== rt.snapshot.repository) return NextResponse.json({ ok: false, error: "Use the approved repository URL for this workspace. A different repository requires its own approved source import." }, { status: 400 });
  if (body.action !== "voice") return NextResponse.json({ ok: true, ...projectContext(rt.snapshot, typeof body.question === "string" ? body.question.slice(0, 2000) : undefined), graph: getCodeGraph(rt.snapshot) });
  if (body.consented !== true) return NextResponse.json({ ok: false, error: "Consent to the voice call and recording is required." }, { status: 400 });
  if (process.env.KKB_ENABLE_WEB_CALLS !== "true" || !process.env.BOLNA_API_KEY || !process.env.BOLNA_AGENT_ID) return NextResponse.json({ ok: false, error: "The Bolna agent is not configured." }, { status: 503 });
  const release = await acquireLease(rt.store, `project-voice:${auth.actor.sessionId}`, 120000);
  if (!release) return NextResponse.json({ ok: false, error: "A voice session is already being created." }, { status: 409 });
  try {
    const { token, session } = await issueCallSession(rt.store, { participantId: auth.actor.participant.id, meetingIds: auth.actor.meetingIds, repository: rt.snapshot.repository, consentRecordedBy: "Named participant explicitly started a browser project-guide call and consented to recording", scenario: "repository-project-guide", ttlMinutes: 30 });
    await rt.store.append(ev("project_voice_binding", session.callId, { deviceSessionId: auth.actor.sessionId, participantId: auth.actor.participant.id }));
    const selectedZone = focusState(await rt.store.all(), auth.actor.sessionId).zone ?? "code_navigator";
    await rt.store.append({ type: "web_call_consent", at: new Date().toISOString(), callId: session.callId, participantId: auth.actor.participant.id, recording: true, snapshotSha: rt.snapshot.pinnedSha });
    const response = await fetch("https://api.bolna.ai/web-call/freeswitch-session", { method: "POST", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${process.env.BOLNA_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ agent_id: process.env.BOLNA_AGENT_ID, user_data: { call_token: token, current_task_id: "", opening_brief: `Hi ${auth.actor.participant.name}. I'm the AI project guide for Charan's team. I've got the Kaam Ki Baat repository and its documentation. What would you like to understand?`, repository_context: JSON.stringify({ mode: "project_guide", selectedZone, ...projectContext(rt.snapshot) }) } }) });
    if (!response.ok) return NextResponse.json({ ok: false, error: "Bolna could not start this browser call. No automatic retry was made." }, { status: 502 });
    const result = await response.json();
    if (result.agent_id !== process.env.BOLNA_AGENT_ID || typeof result.run_id !== "string") return NextResponse.json({ ok: false, error: "Unverified provider session." }, { status: 502 });
    await rt.store.append({ type: "call_execution", at: new Date().toISOString(), callId: session.callId, executionId: result.run_id, agentId: result.agent_id, channel: "web" });
    return NextResponse.json(result);
  } catch { return NextResponse.json({ ok: false, error: "Voice connection failed. Check microphone access and try again explicitly." }, { status: 502 }); }
  finally { await release(); }
}
