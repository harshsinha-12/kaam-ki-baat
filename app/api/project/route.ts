import { acquireLease } from "@/lib/store/lease";
import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime-instance";
import { resolveDeviceActor } from "@/lib/zones/identity";
import { issueCallSession } from "@/lib/auth/call-session";
import { readBody } from "@/lib/spatial/http";
import { getCodeGraph } from "@/lib/codegraph/load";
import { ev, focusState } from "@/lib/zones/state";
import { projectContext, repositoryName } from "@/lib/project/context";
import { importPublicRepository, RepositoryImportError } from "@/lib/project/import";
import { openRepositoryWorkspace, repositoryRuntimeForDevice } from "@/lib/project/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: Request) {
  const base = await getRuntime();
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Session ") ? header.slice(8) : null;
  const rt = await repositoryRuntimeForDevice(base, token);
  const auth = await resolveDeviceActor(rt.store, rt.snapshot, token);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status });
  if (!auth.actor.repoAccess) return NextResponse.json({ ok: false, error: "Repository access is not permitted for this session." }, { status: 403 });
  const body = await readBody(req);
  const repository = repositoryName(body?.repositoryUrl);
  if (!body || !repository) return NextResponse.json({ ok: false, error: "Enter a public GitHub repository URL, such as https://github.com/pingdotgg/t3code." }, { status: 400 });
  if (repository.toLowerCase() !== rt.snapshot.repository.toLowerCase()) {
    if (body.action === "voice") return NextResponse.json({ ok: false, error: "Connect the new public repository before starting voice." }, { status: 400 });
    const release = await acquireLease(rt.store, `public-import:${auth.actor.sessionId}`, 60000);
    if (!release) return NextResponse.json({ ok: false, error: "A repository import is already in progress. Please wait." }, { status: 409 });
    try {
      const snapshot = await importPublicRepository(body.repositoryUrl);
      const opened = await openRepositoryWorkspace(base, snapshot, auth.actor.sessionId);
      return NextResponse.json({ ok: true, ...projectContext(snapshot), graph: getCodeGraph(snapshot), sessionToken: opened.token }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof RepositoryImportError ? error.message : "Repository import could not be saved. The existing workspace was preserved." }, { status: error instanceof RepositoryImportError ? error.status : 503 });
    } finally { await release(); }
  }
  if (body.action !== "voice") return NextResponse.json({ ok: true, ...projectContext(rt.snapshot, typeof body.question === "string" ? body.question.slice(0, 2000) : undefined), graph: getCodeGraph(rt.snapshot) });
  if (body.consented !== true) return NextResponse.json({ ok: false, error: "Consent to the voice call and recording is required." }, { status: 400 });
  if (process.env.KKB_ENABLE_WEB_CALLS !== "true" || !process.env.BOLNA_API_KEY || !process.env.BOLNA_AGENT_ID) return NextResponse.json({ ok: false, error: "The Bolna agent is not configured." }, { status: 503 });
  const release = await acquireLease(rt.store, `project-voice:${auth.actor.sessionId}`, 120000);
  if (!release) return NextResponse.json({ ok: false, error: "A voice session is already being created." }, { status: 409 });
  try {
    const { token, session } = await issueCallSession(rt.store, { participantId: auth.actor.participant.id, meetingIds: auth.actor.meetingIds, repository: rt.snapshot.repository, consentRecordedBy: "Browser user explicitly started a project-guide call and consented to recording; workspace access does not verify personal identity", scenario: "repository-project-guide", ttlMinutes: 30 });
    await rt.store.append(ev("project_voice_binding", session.callId, { deviceSessionId: auth.actor.sessionId, participantId: auth.actor.participant.id }));
    const selectedZone = focusState(await rt.store.all(), auth.actor.sessionId).zone ?? "code_navigator";
    await rt.store.append({ type: "web_call_consent", at: new Date().toISOString(), callId: session.callId, participantId: auth.actor.participant.id, recording: true, snapshotSha: rt.snapshot.pinnedSha });
    const response = await fetch("https://api.bolna.ai/web-call/freeswitch-session", { method: "POST", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${process.env.BOLNA_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ agent_id: process.env.BOLNA_AGENT_ID, user_data: { call_token: token, current_task_id: "", opening_brief: `Hi ${auth.actor.participant.name}. I'm your AI repository guide. I've got ${rt.snapshot.repository} and its selected source files. What would you like to understand?`, repository_context: JSON.stringify({ mode: "project_guide", selectedZone, ...projectContext(rt.snapshot) }) } }) });
    if (!response.ok) return NextResponse.json({ ok: false, error: "Bolna could not start this browser call. No automatic retry was made." }, { status: 502 });
    const result = await response.json();
    if (result.agent_id !== process.env.BOLNA_AGENT_ID || typeof result.run_id !== "string") return NextResponse.json({ ok: false, error: "Unverified provider session." }, { status: 502 });
    await rt.store.append({ type: "call_execution", at: new Date().toISOString(), callId: session.callId, executionId: result.run_id, agentId: result.agent_id, channel: "web" });
    return NextResponse.json(result);
  } catch { return NextResponse.json({ ok: false, error: "Voice connection failed. Check microphone access and try again explicitly." }, { status: 502 }); }
  finally { await release(); }
}
