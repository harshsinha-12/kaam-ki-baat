import { createHash, createPublicKey, randomBytes, verify as cryptoVerify, type JsonWebKey as NodeJwk } from "node:crypto";
import type { EventStore } from "../store/event-store";
import type { Actor } from "./identity";
import { ev, zoneEvents } from "./state";

// Device-bound leader step-up with a WebAuthn passkey (Touch ID / Face ID /
// Windows Hello). The private key never leaves the leader's device; we store
// only the public key. Dependency-free: minimal CBOR + COSE(ES256) + node:crypto.
//
// Once a leader has enrolled a passkey, the Leader Desk accepts ONLY a passkey
// assertion from that device (the demo one-time code stops working).

export interface PasskeyConfig { rpId: string; origin: string }
export const passkeyConfig = (): PasskeyConfig => ({
  rpId: process.env.KKB_RP_ID ?? "localhost",
  origin: process.env.KKB_ORIGIN ?? "http://localhost:3000",
});

export interface StoredCredential { participantId: string; credentialId: string; jwk: JsonWebKey; signCount: number; createdAt: string }

const b64u = (b: Buffer) => b.toString("base64url");
const fromB64u = (s: unknown) => Buffer.from(String(s ?? ""), "base64url");
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest();

export function credentials(events: Parameters<typeof zoneEvents>[0], participantId?: string): StoredCredential[] {
  // latest record per credential id (sign counter updates are appended)
  const m = new Map<string, StoredCredential>();
  for (const e of zoneEvents(events, "passkey")) {
    const c = e.data as unknown as StoredCredential;
    if (!participantId || c.participantId === participantId) m.set(c.credentialId, c);
  }
  return [...m.values()];
}

/** Issue a single-use challenge bound to this device session. */
export async function issueChallenge(store: EventStore, actor: Actor, purpose: "register" | "assert") {
  const challenge = b64u(randomBytes(32));
  await store.append(ev("webauthn_challenge", actor.sessionId, { challenge, purpose, expiresAt: new Date(Date.now() + 120_000).toISOString() }));
  const cfg = passkeyConfig();
  const creds = credentials(await store.all(), actor.participant.id);
  return {
    challenge,
    rpId: cfg.rpId,
    user: { id: b64u(Buffer.from(actor.participant.id)), name: actor.participant.name },
    allowCredentials: creds.map((c) => c.credentialId),
  };
}

async function consumeChallenge(store: EventStore, sessionId: string, purpose: string, presented: string): Promise<boolean> {
  return store.appendGuarded<boolean>((log) => {
    const cs = zoneEvents(log, "webauthn_challenge").filter((e) => e.key === sessionId);
    const used = new Set(zoneEvents(log, "webauthn_used").map((e) => e.key));
    const hit = cs.reverse().find((e) => (e.data as { challenge: string }).challenge === presented);
    const d = hit?.data as { challenge: string; purpose: string; expiresAt: string } | undefined;
    if (!d || d.purpose !== purpose || used.has(d.challenge) || new Date(d.expiresAt) < new Date()) return { reject: false };
    return { append: ev("webauthn_used", d.challenge, { at: new Date().toISOString() }), result: true };
  });
}

function checkClientData(raw: Buffer, type: string, cfg: PasskeyConfig): { ok: true; challenge: string } | { ok: false; reason: string } {
  let cd: { type?: string; challenge?: string; origin?: string };
  try { cd = JSON.parse(raw.toString("utf8")); } catch { return { ok: false, reason: "bad clientDataJSON" }; }
  if (cd.type !== type) return { ok: false, reason: "wrong ceremony type" };
  if (cd.origin !== cfg.origin) return { ok: false, reason: "origin mismatch" };
  if (!cd.challenge) return { ok: false, reason: "missing challenge" };
  return { ok: true, challenge: cd.challenge };
}

interface AuthData { rpIdHash: Buffer; flags: number; signCount: number; credentialId?: Buffer; cose?: Map<number, unknown> }
export function parseAuthData(b: Buffer): AuthData {
  const out: AuthData = { rpIdHash: b.subarray(0, 32), flags: b[32], signCount: b.readUInt32BE(33) };
  if (out.flags & 0x40) {
    const len = b.readUInt16BE(53);
    out.credentialId = b.subarray(55, 55 + len);
    out.cose = decodeCbor(b.subarray(55 + len)).value as Map<number, unknown>;
  }
  return out;
}

function checkAuthData(ad: AuthData, cfg: PasskeyConfig): string | null {
  if (!ad.rpIdHash.equals(sha256(cfg.rpId))) return "rpId mismatch";
  if (!(ad.flags & 0x01)) return "user not present";
  if (!(ad.flags & 0x04)) return "user not verified (biometric/PIN required)";
  return null;
}

export function coseToJwk(cose: Map<number, unknown>): JsonWebKey {
  // kty 2 (EC2), alg -7 (ES256), crv 1 (P-256)
  if (cose.get(1) !== 2 || cose.get(3) !== -7 || cose.get(-1) !== 1) throw new Error("only ES256/P-256 passkeys are supported");
  return { kty: "EC", crv: "P-256", x: b64u(cose.get(-2) as Buffer), y: b64u(cose.get(-3) as Buffer) };
}

export async function registerPasskey(store: EventStore, actor: Actor, body: Record<string, unknown>, cfg = passkeyConfig()) {
  if (actor.role !== "leader" || actor.channel !== "device") return { ok: false as const, reason: "only the leader can enrol a passkey" };
  const existing = credentials(await store.all(), actor.participant.id);
  // First enrolment needs a fresh step-up (demo code); later enrolments need a fresh PASSKEY step-up.
  if (!actor.stepUpFresh) return { ok: false as const, reason: existing.length ? "unlock with your existing passkey first" : "verify with the one-time leader code first" };
  const clientData = fromB64u(body.clientDataJSON);
  const cd = checkClientData(clientData, "webauthn.create", cfg);
  if (!cd.ok) return { ok: false as const, reason: cd.reason };
  if (!(await consumeChallenge(store, actor.sessionId, "register", cd.challenge))) return { ok: false as const, reason: "challenge invalid, expired or reused" };
  let att: Map<string, unknown>;
  try { att = decodeCbor(fromB64u(body.attestationObject)).value as Map<string, unknown>; } catch { return { ok: false as const, reason: "bad attestationObject" }; }
  const ad = parseAuthData(att.get("authData") as Buffer);
  const err = checkAuthData(ad, cfg);
  if (err) return { ok: false as const, reason: err };
  if (!ad.credentialId || !ad.cose) return { ok: false as const, reason: "no credential in attestation" };
  let jwk: JsonWebKey;
  try { jwk = coseToJwk(ad.cose); } catch (e) { return { ok: false as const, reason: (e as Error).message }; }
  const cred: StoredCredential = { participantId: actor.participant.id, credentialId: b64u(ad.credentialId), jwk, signCount: ad.signCount, createdAt: new Date().toISOString() };
  await store.append(ev("passkey", cred.credentialId, cred));
  return { ok: true as const, credentialId: cred.credentialId };
}

export async function assertPasskey(store: EventStore, actor: Actor, body: Record<string, unknown>, cfg = passkeyConfig()) {
  if (actor.role !== "leader" || actor.channel !== "device") return { ok: false as const, reason: "only the leader can unlock the Leader Desk" };
  const cred = credentials(await store.all(), actor.participant.id).find((c) => c.credentialId === String(body.credentialId ?? ""));
  if (!cred) return { ok: false as const, reason: "this device's passkey is not enrolled for the leader" };
  const clientData = fromB64u(body.clientDataJSON);
  const cd = checkClientData(clientData, "webauthn.get", cfg);
  if (!cd.ok) return { ok: false as const, reason: cd.reason };
  if (!(await consumeChallenge(store, actor.sessionId, "assert", cd.challenge))) return { ok: false as const, reason: "challenge invalid, expired or reused" };
  const authData = fromB64u(body.authenticatorData);
  const ad = parseAuthData(authData);
  const err = checkAuthData(ad, cfg);
  if (err) return { ok: false as const, reason: err };
  const signed = Buffer.concat([authData, sha256(clientData)]);
  const key = createPublicKey({ key: cred.jwk as NodeJwk, format: "jwk" });
  if (!cryptoVerify("sha256", signed, { key, dsaEncoding: "der" }, fromB64u(body.signature))) return { ok: false as const, reason: "signature invalid" };
  if (ad.signCount !== 0 && ad.signCount <= cred.signCount) return { ok: false as const, reason: "sign counter did not increase (possible cloned key)" };
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await store.append(ev("passkey", cred.credentialId, { ...cred, signCount: ad.signCount }));
  await store.append(ev("step_up", actor.sessionId, { method: "passkey", expiresAt }));
  return { ok: true as const, expiresAt };
}

// ---------------------------------------------------------------- minimal CBOR (decode)
export function decodeCbor(buf: Buffer, pos = 0): { value: unknown; end: number } {
  const ib = buf[pos++];
  const major = ib >> 5;
  let info = ib & 0x1f;
  let len: number;
  if (info < 24) len = info;
  else if (info === 24) len = buf[pos++];
  else if (info === 25) { len = buf.readUInt16BE(pos); pos += 2; }
  else if (info === 26) { len = buf.readUInt32BE(pos); pos += 4; }
  else throw new Error("unsupported CBOR length");
  switch (major) {
    case 0: return { value: len, end: pos };
    case 1: return { value: -1 - len, end: pos };
    case 2: return { value: buf.subarray(pos, pos + len), end: pos + len };
    case 3: return { value: buf.subarray(pos, pos + len).toString("utf8"), end: pos + len };
    case 4: { const a: unknown[] = []; for (let i = 0; i < len; i++) { const r = decodeCbor(buf, pos); a.push(r.value); pos = r.end; } return { value: a, end: pos }; }
    case 5: { const m = new Map<unknown, unknown>(); for (let i = 0; i < len; i++) { const k = decodeCbor(buf, pos); const v = decodeCbor(buf, k.end); m.set(k.value, v.value); pos = v.end; } return { value: m, end: pos }; }
    case 7: info = len; return { value: info === 20 ? false : info === 21 ? true : null, end: pos };
    default: throw new Error("unsupported CBOR type");
  }
}
