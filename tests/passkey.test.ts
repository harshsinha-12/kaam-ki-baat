import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { leaderCode } from "../lib/zones/identity";
import { SECRET, zoneSetup } from "./helpers/zones";

// A simulated platform authenticator with a REAL P-256 key pair and real
// signatures. It stands in for Touch ID; the server code path is the real one.
const ORIGIN = "http://localhost:3000";
process.env.KKB_RP_ID = "localhost";
process.env.KKB_ORIGIN = ORIGIN;

function cborEnc(v: unknown): Buffer {
  const head = (major: number, n: number) => n < 24 ? Buffer.from([(major << 5) | n]) : n < 256 ? Buffer.from([(major << 5) | 24, n]) : Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === "string") { const b = Buffer.from(v); return Buffer.concat([head(3, b.length), b]); }
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cborEnc(k), cborEnc(x)])]);
  throw new Error("unsupported");
}
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest();

function authenticator(rpId = "localhost") {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const credId = Buffer.from("cred-on-leaders-laptop");
  let count = 0;
  const authData = (attested: boolean, flags = 0x05) => {
    const cnt = Buffer.alloc(4); cnt.writeUInt32BE(++count);
    const parts = [sha(rpId), Buffer.from([flags | (attested ? 0x40 : 0)]), cnt];
    if (attested) {
      const cose = new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, "base64url")], [-3, Buffer.from(jwk.y!, "base64url")]]);
      const len = Buffer.alloc(2); len.writeUInt16BE(credId.length);
      parts.push(Buffer.alloc(16), len, credId, cborEnc(cose));
    }
    return Buffer.concat(parts);
  };
  const cd = (type: string, challenge: string, origin = ORIGIN) => Buffer.from(JSON.stringify({ type, challenge, origin }));
  return {
    credentialId: credId.toString("base64url"),
    create(challenge: string) {
      const att = cborEnc(new Map<string, unknown>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData(true)]]));
      return { clientDataJSON: cd("webauthn.create", challenge).toString("base64url"), attestationObject: att.toString("base64url") };
    },
    get(challenge: string, opts: { origin?: string; flags?: number } = {}) {
      const ad = authData(false, opts.flags);
      const c = cd("webauthn.get", challenge, opts.origin);
      const signature = sign("sha256", Buffer.concat([ad, sha(c)]), { key: privateKey, dsaEncoding: "der" });
      return { credentialId: credId.toString("base64url"), clientDataJSON: c.toString("base64url"), authenticatorData: ad.toString("base64url"), signature: signature.toString("base64url") };
    },
  };
}

async function enrolled() {
  const z = await zoneSetup();
  const device = authenticator();
  await z.unlockLeader(); // first enrolment is gated by the one-time leader code
  const opt = await z.act(z.lead, "passkey_options", { purpose: "register" });
  const reg = await z.act(z.lead, "passkey_register", device.create(String(opt.body.challenge)));
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  return { z, device };
}

describe("leader passkey (device-bound step-up)", () => {
  it("enrolled passkey unlocks the Leader Desk; the one-time code no longer does", async () => {
    const { z, device } = await enrolled();
    // A fresh session on the same participant: OTP is now refused.
    const { issueDeviceSession } = await import("../lib/zones/identity");
    const s2 = await issueDeviceSession(z.store, z.snapshot, { participantId: "lead", deviceLabel: "lead laptop" });
    const otp = await z.act(s2, "leader_step_up", { code: leaderCode(SECRET, s2.session.sessionId) });
    assert.equal(otp.status, 403);
    assert.equal((await z.act(s2, "leader_inbox")).status, 403);
    const opt = await z.act(s2, "passkey_options", {});
    const ok = await z.act(s2, "passkey_assert", device.get(String(opt.body.challenge)));
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await z.act(s2, "leader_inbox")).status, 200);
  });
  it("rejects replayed challenges, wrong origin, missing user verification, and another device's key", async () => {
    const { z, device } = await enrolled();
    const o1 = await z.act(z.lead, "passkey_options", {});
    const a1 = device.get(String(o1.body.challenge));
    assert.equal((await z.act(z.lead, "passkey_assert", a1)).status, 200);
    assert.equal((await z.act(z.lead, "passkey_assert", a1)).status, 403); // replay
    const o2 = await z.act(z.lead, "passkey_options", {});
    assert.equal((await z.act(z.lead, "passkey_assert", device.get(String(o2.body.challenge), { origin: "https://evil.example" }))).status, 403);
    const o3 = await z.act(z.lead, "passkey_options", {});
    assert.equal((await z.act(z.lead, "passkey_assert", device.get(String(o3.body.challenge), { flags: 0x01 }))).status, 403); // no UV
    const other = authenticator();
    const o4 = await z.act(z.lead, "passkey_options", {});
    const forged = { ...other.get(String(o4.body.challenge)), credentialId: device.credentialId };
    assert.equal((await z.act(z.lead, "passkey_assert", forged)).status, 403); // signature from a different key
  });
  it("a teammate cannot enrol or use a passkey for the Leader Desk", async () => {
    const z = await zoneSetup();
    assert.equal((await z.act(z.dev, "passkey_options", { purpose: "register" })).status, 403);
    assert.equal((await z.act(z.dev, "passkey_register", authenticator().create("x"))).status, 403);
  });
});
