import { createHash, createPublicKey, randomBytes, verify as cryptoVerify, type JsonWebKey } from "node:crypto";
import type { EventStore } from "../store/event-store";
import type { Actor } from "./identity";
import { ev, latestStepUp, zoneEvents } from "./state";

// Credential-bound leader step-up with a WebAuthn passkey. Only public keys are
// stored. Synced passkeys are possible; this does not attest physical hardware.
//
// Once a leader has enrolled a passkey, the Leader Desk accepts ONLY a passkey
// assertion from an enrolled credential (the demo one-time code stops working).

export interface PasskeyConfig { rpId: string; origin: string }
export const passkeyConfig = (): PasskeyConfig => {
  const origin = process.env.KKB_ORIGIN?.trim() || process.env.KKB_PUBLIC_URL?.trim() || "http://localhost:3000";
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))))
    throw new Error("WebAuthn requires a configured HTTPS origin (localhost allowed for development)");
  const rpId = process.env.KKB_RP_ID?.trim() || url.hostname;
  if (url.hostname !== rpId && !url.hostname.endsWith(`.${rpId}`)) throw new Error("WebAuthn RP ID must match the configured host");
  return { rpId, origin };
};

export interface StoredCredential { participantId: string; credentialId: string; jwk: JsonWebKey; signCount: number; createdAt: string }

const b64u = (b: Buffer) => b.toString("base64url");
const fromB64u = (s: unknown) => Buffer.from(String(s ?? ""), "base64url");
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest();

export function credentials(events: Parameters<typeof zoneEvents>[0], participantId?: string): StoredCredential[] {
  // latest record per credential id (sign counter updates are appended)
  const m = new Map<string, StoredCredential>();
  for (const e of zoneEvents(events).filter(e => e.kind === "passkey" || e.kind === "passkey_verified")) {
    const c = (e.kind === "passkey_verified" ? e.data.credential : e.data) as StoredCredential;
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
  let cd: { type?: string; challenge?: string; origin?: string; crossOrigin?: boolean };
  try { cd = JSON.parse(raw.toString("utf8")); } catch { return { ok: false, reason: "bad clientDataJSON" }; }
  if (!cd || typeof cd !== "object" || cd.type !== type) return { ok: false, reason: "wrong ceremony type" };
  if (cd.origin !== cfg.origin) return { ok: false, reason: "origin mismatch" };
  if (cd.crossOrigin !== undefined && cd.crossOrigin !== false) return { ok: false, reason: "cross-origin ceremony refused" };
  if (typeof cd.challenge !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(cd.challenge)) return { ok: false, reason: "missing challenge" };
  return { ok: true, challenge: cd.challenge };
}

interface AuthData { rpIdHash: Buffer; flags: number; signCount: number; credentialId?: Buffer; cose?: Map<number, unknown> }
export function parseAuthData(b: Buffer): AuthData {
  if (!Buffer.isBuffer(b) || b.length < 37) throw new Error("truncated authenticator data");
  const out: AuthData = { rpIdHash: b.subarray(0, 32), flags: b[32], signCount: b.readUInt32BE(33) };
  if (out.flags & 0x40) {
    if (b.length < 56) throw new Error("truncated attested credential");
    const len = b.readUInt16BE(53);
    if (len < 1 || len > 1024 || b.length <= 55 + len) throw new Error("invalid credential length");
    out.credentialId = b.subarray(55, 55 + len);
    const cose = decodeCbor(b.subarray(55 + len)).value;
    if (!(cose instanceof Map)) throw new Error("invalid credential key");
    out.cose = cose;
  }
  return out;
}

function checkAuthData(ad: AuthData, cfg: PasskeyConfig): string | null {
  if (!ad.rpIdHash.equals(sha256(cfg.rpId))) return "rpId mismatch";
  if (!(ad.flags & 0x01)) return "user not present";
  if (!(ad.flags & 0x04)) return "user not verified (biometric/PIN required)";
  if ((ad.flags & 0x10) && !(ad.flags & 0x08)) return "invalid credential backup flags";
  return null;
}

export function coseToJwk(cose: Map<number, unknown>): JsonWebKey {
  // kty 2 (EC2), alg -7 (ES256), crv 1 (P-256)
  if (cose.get(1) !== 2 || cose.get(3) !== -7 || cose.get(-1) !== 1) throw new Error("only ES256/P-256 passkeys are supported");
  if (![cose.get(-2), cose.get(-3)].every(value => Buffer.isBuffer(value) && value.length === 32)) throw new Error("invalid P-256 coordinates");
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
  let ad: AuthData;
  try {
    const att = decodeCbor(fromB64u(body.attestationObject)).value;
    if (!(att instanceof Map) || att.get("fmt") !== "none" || !(att.get("attStmt") instanceof Map) || att.get("attStmt").size !== 0)
      throw new Error("unsupported attestation");
    ad = parseAuthData(att.get("authData"));
  } catch { return { ok: false as const, reason: "invalid or unsupported attestationObject" }; }
  const err = checkAuthData(ad, cfg);
  if (err) return { ok: false as const, reason: err };
  if (!ad.credentialId || !ad.cose) return { ok: false as const, reason: "no credential in attestation" };
  let jwk: JsonWebKey;
  try { jwk = coseToJwk(ad.cose); createPublicKey({ key: jwk, format: "jwk" }); } catch { return { ok: false as const, reason: "invalid credential key" }; }
  const cred: StoredCredential = { participantId: actor.participant.id, credentialId: b64u(ad.credentialId), jwk, signCount: ad.signCount, createdAt: new Date().toISOString() };
  type Registration = { ok: true; credentialId: string } | { ok: false; reason: string };
  const result = await store.appendGuarded<Registration>((events) => {
    const up = latestStepUp(events, actor.sessionId);
    const enrolled = credentials(events, actor.participant.id);
    if (!up || Date.parse(up.expiresAt) <= Date.now() || (enrolled.length > 0 && up.method !== "passkey"))
      return { reject: { ok: false, reason: "fresh verification with the enrolled passkey is required" } };
    if (credentials(events).some(c => c.credentialId === cred.credentialId))
      return { reject: { ok: false, reason: "credential is already enrolled" } };
    return { append: ev("passkey", cred.credentialId, cred), result: { ok: true, credentialId: cred.credentialId } };
  });
  if (!result.ok) return result;
  const stored = credentials(await store.all(), actor.participant.id).find(c => c.credentialId === cred.credentialId);
  return stored && stored.jwk.x === jwk.x && stored.jwk.y === jwk.y ? result : { ok: false as const, reason: "credential read-back failed" };
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
  let ad: AuthData;
  try { ad = parseAuthData(authData); } catch { return { ok: false as const, reason: "invalid authenticator data" }; }
  const err = checkAuthData(ad, cfg);
  if (err) return { ok: false as const, reason: err };
  const signed = Buffer.concat([authData, sha256(clientData)]);
  try {
    const key = createPublicKey({ key: cred.jwk, format: "jwk" });
    if (!cryptoVerify("sha256", signed, { key, dsaEncoding: "der" }, fromB64u(body.signature))) return { ok: false as const, reason: "signature invalid" };
  } catch { return { ok: false as const, reason: "signature invalid" }; }
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  type Assertion = { ok: true; expiresAt: string } | { ok: false; reason: string };
  const result = await store.appendGuarded<Assertion>((events) => {
    const latest = credentials(events, actor.participant.id).find(c => c.credentialId === cred.credentialId);
    if (!latest || ((ad.signCount > 0 || latest.signCount > 0) && ad.signCount <= latest.signCount))
      return { reject: { ok: false, reason: "sign counter did not increase (possible cloned key)" } };
    return { append: ev("passkey_verified", actor.sessionId, { credential: { ...latest, signCount: ad.signCount }, stepUp: { method: "passkey", expiresAt } }), result: { ok: true, expiresAt } };
  });
  if (!result.ok) return result;
  const up = latestStepUp(await store.all(), actor.sessionId);
  return up?.method === "passkey" && up.expiresAt === expiresAt ? result : { ok: false as const, reason: "passkey step-up read-back failed" };
}

// ---------------------------------------------------------------- minimal CBOR (decode)
export function decodeCbor(buf: Buffer, pos = 0, depth = 0): { value: unknown; end: number } {
  if (depth > 16 || pos >= buf.length) throw new Error("invalid CBOR nesting or length");
  const ib = buf[pos++];
  const major = ib >> 5;
  let info = ib & 0x1f;
  let len: number;
  if (info < 24) len = info;
  else if (info === 24) len = buf[pos++];
  else if (info === 25) { len = buf.readUInt16BE(pos); pos += 2; }
  else if (info === 26) { len = buf.readUInt32BE(pos); pos += 4; }
  else throw new Error("unsupported CBOR length");
  if (!Number.isSafeInteger(len) || len < 0 || len > 16384 || pos > buf.length) throw new Error("CBOR length exceeds input limit");
  if ((major === 2 || major === 3) && pos + len > buf.length) throw new Error("truncated CBOR bytes");
  switch (major) {
    case 0: return { value: len, end: pos };
    case 1: return { value: -1 - len, end: pos };
    case 2: return { value: buf.subarray(pos, pos + len), end: pos + len };
    case 3: return { value: buf.subarray(pos, pos + len).toString("utf8"), end: pos + len };
    case 4: { const a: unknown[] = []; for (let i = 0; i < len; i++) { const r = decodeCbor(buf, pos, depth + 1); a.push(r.value); pos = r.end; } return { value: a, end: pos }; }
    case 5: { const m = new Map<unknown, unknown>(); for (let i = 0; i < len; i++) { const k = decodeCbor(buf, pos, depth + 1); const v = decodeCbor(buf, k.end, depth + 1); if (m.has(k.value)) throw new Error("duplicate CBOR key"); m.set(k.value, v.value); pos = v.end; } return { value: m, end: pos }; }
    case 7: info = len; return { value: info === 20 ? false : info === 21 ? true : null, end: pos };
    default: throw new Error("unsupported CBOR type");
  }
}
