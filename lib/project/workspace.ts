import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EvidenceSnapshot } from "../contracts";
import { validateHostedSnapshot } from "../evidence/hosted";
import { RedisClient, redisConfig } from "../store/redis";
import { hashToken } from "../auth/call-session";
import { issueDeviceSession, resolveDeviceActor } from "../zones/identity";
import { deviceSessionByHash, ev, zoneEvents } from "../zones/state";
import type { Runtime } from "../tools/runtime";
import { IMPORT_LIMITS } from "./import";
import { repositoryName } from "./context";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const snapshots = new Map<string, EvidenceSnapshot>();
const scope = () => digest(JSON.stringify(redisConfig() ?? { directory: directory() }));
const directory = () => path.resolve(process.env.KKB_PUBLIC_REPOSITORIES_DIR?.trim() || "data/private/public-repositories");

function validatePublicSnapshot(value: unknown): EvidenceSnapshot {
  const snapshot = validateHostedSnapshot(value);
  if (snapshot.label !== "LIVE" || repositoryName(`https://github.com/${snapshot.repository}`) !== snapshot.repository ||
      !/^[a-f0-9]{40}$/.test(snapshot.pinnedSha) || !Number.isFinite(Date.parse(snapshot.fetchedAt)) ||
      snapshot.meetings.length || snapshot.passages.length || snapshot.tasks.length || snapshot.pullRequests.length || snapshot.checks.length ||
      snapshot.participants.length !== 1 || !/^repo_[a-f0-9]{24}$/.test(snapshot.participants[0].id) ||
      snapshot.participants[0].role !== "member" || snapshot.participants[0].repoAccess !== true || snapshot.participants[0].meetingIds.length || snapshot.participants[0].taskIds.length ||
      !snapshot.files.length || snapshot.files.length > IMPORT_LIMITS.files || snapshot.codeGraph ||
      snapshot.files.some(file => Buffer.byteLength(file.content) > IMPORT_LIMITS.fileBytes) ||
      snapshot.files.reduce((bytes, file) => bytes + Buffer.byteLength(file.content), 0) > IMPORT_LIMITS.totalBytes)
    throw new Error("Invalid public repository workspace.");
  return snapshot;
}

function remember(key: string, snapshot: EvidenceSnapshot) {
  // Immutable SHA/digest-bound snapshots; keep cold-start transfer out of polling.
  if (snapshots.size >= 8) snapshots.delete(snapshots.keys().next().value!);
  snapshots.set(key, snapshot);
}

async function readStored(id: string): Promise<string | null> {
  const config = redisConfig();
  if (config) return new RedisClient(config).get(`${config.namespace}:public-repository:${id}`);
  if (process.env.VERCEL) throw new Error("Public repository storage is not configured.");
  try { return await readFile(path.join(directory(), `${id}.json`), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

async function save(snapshot: EvidenceSnapshot): Promise<string> {
  validatePublicSnapshot(snapshot);
  const text = JSON.stringify(snapshot), id = digest(text), config = redisConfig();
  if (config) await new RedisClient(config).setIfAbsent(`${config.namespace}:public-repository:${id}`, text);
  else {
    if (process.env.VERCEL) throw new Error("Public repository storage is not configured.");
    await mkdir(directory(), { recursive: true, mode: 0o700 });
    try { await writeFile(path.join(directory(), `${id}.json`), text, { mode: 0o600, flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  if (await readStored(id) !== text) throw new Error("Public repository read-back failed.");
  remember(`${scope()}:${id}`, snapshot);
  return id;
}

async function load(id: unknown): Promise<EvidenceSnapshot> {
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid repository reference.");
  const key = `${scope()}:${id}`;
  if (snapshots.has(key)) return snapshots.get(key)!;
  const raw = await readStored(id);
  if (!raw || raw.length > IMPORT_LIMITS.totalBytes * 4 || digest(raw) !== id) throw new Error("Repository snapshot is unavailable or changed.");
  const snapshot = validatePublicSnapshot(JSON.parse(raw));
  remember(key, snapshot);
  return snapshot;
}

/** Issuing a new, member-only identity isolates imported code from the old workspace. */
export async function openRepositoryWorkspace(base: Runtime, snapshot: EvidenceSnapshot, originSessionId: string) {
  const snapshotId = await save(snapshot);
  const issued = await issueDeviceSession(base.store, snapshot, { participantId: snapshot.participants[0].id, deviceLabel: "Public repository workspace" });
  await base.store.appendGuarded(events => {
    if (zoneEvents(events, "repository_workspace").some(event => event.key === issued.session.sessionId)) throw new Error("Repository session already bound.");
    return { append: [
      ev("repository_workspace", issued.session.sessionId, { snapshotId, originSessionId }),
      ev("focus_input", issued.session.sessionId, { provider: "manual", epoch: 1 }),
      ev("focus", issued.session.sessionId, { zone: "code_navigator", provider: "manual", seq: 1, inputEpoch: 1, confidence: 1 }),
    ], result: true };
  });
  const rt = await repositoryRuntimeForDevice(base, issued.token);
  const verified = await resolveDeviceActor(rt.store, rt.snapshot, issued.token);
  if (!verified.ok || digest(JSON.stringify(rt.snapshot)) !== snapshotId || verified.actor.role !== "member" || verified.actor.meetingIds.length)
    throw new Error("Repository workspace read-back failed.");
  return { rt, token: issued.token };
}

export async function repositoryRuntimeForDevice(base: Runtime, token: unknown): Promise<Runtime> {
  if (typeof token !== "string" || token.length < 16) return base;
  const events = await base.store.all(), device = deviceSessionByHash(events, hashToken(token));
  if (!device) return base;
  const binding = zoneEvents(events, "repository_workspace").find(event => event.key === device.sessionId);
  if (!binding) return base;
  const snapshot = await load(binding.data.snapshotId);
  if (snapshot.participants[0].id !== device.participantId) throw new Error("Repository session does not match its snapshot.");
  return { snapshot, store: base.store, conversations: new Map() };
}

export async function repositoryRuntimeForCall(base: Runtime, token: unknown): Promise<Runtime> {
  if (typeof token !== "string" || token.length < 16) return base;
  const session = await base.store.findCallByTokenHash(hashToken(token));
  if (!session) return base;
  const events = await base.store.all();
  const voice = zoneEvents(events, "project_voice_binding").find(event => event.key === session.callId && event.data.participantId === session.participantId);
  const binding = voice && zoneEvents(events, "repository_workspace").find(event => event.key === voice.data.deviceSessionId);
  if (!binding) return base;
  const snapshot = await load(binding.data.snapshotId);
  if (snapshot.repository !== session.repository || snapshot.participants[0].id !== session.participantId) throw new Error("Repository call does not match its snapshot.");
  return { snapshot, store: base.store, conversations: new Map() };
}
