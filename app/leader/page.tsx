"use client";
import { useCallback, useEffect, useState } from "react";
import { b64u, fromB64u, zone } from "../zones/client";
import s from "../zones/zones.module.css";
import { BrandMark } from "../components/BrandMark";

// CENTER · Leader Desk. Opens only for the server-verified leader after a
// credential-bound passkey check (Touch ID / Face ID / Windows Hello). The first
// enrolment is gated by the one-time leader code; after that, only the passkey works.

type Me = { participant?: { name: string }; role?: string; stepUpFresh?: boolean; error?: string; snapshot?: { label: string } };
type Pending = { id: string; question: string; requesterName?: string; contextRefs: { label: string }[]; decision: { version: number; statement: string; state: string } | null };

export default function Leader() {
  const [me, setMe] = useState<Me | null>(null);
  const [msg, setMsg] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState<Record<string, { statement: string; conditions: string; confirm: boolean }>>({});
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { const m = await zone<Me>("me"); setMe(m.data);
      if (m.data.stepUpFresh) { const r = await zone<{ pending: Pending[] }>("leader_inbox"); if (r.status === 200 && r.data.pending) setPending(r.data.pending); else setPending([]); }
      else setPending([]);
    } catch { setMe(null); setPending([]); setMsg("Cannot connect. Retrying…"); }
  }, []);
  useEffect(() => {
    let inFlight = false;
    const poll = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try { await refresh(); } finally { inFlight = false; }
    };
    void poll(); const id = setInterval(poll, 4000); return () => clearInterval(id);
  }, [refresh]);

  const enrol = async () => {
    setBusy(true); setMsg("");
    try {
      if (!me?.stepUpFresh) { const r = await zone("leader_step_up", { code }); if (r.status !== 200) throw new Error(r.data.error); }
      const o = await zone<{ challenge: string; rpId: string; user: { id: string; name: string } }>("passkey_options", { purpose: "register" });
      if (o.status !== 200) throw new Error(o.data.error);
      const cred = (await navigator.credentials.create({ publicKey: {
        challenge: fromB64u(o.data.challenge), rp: { id: o.data.rpId, name: "Kaam Ki Baat" },
        user: { id: fromB64u(o.data.user.id), name: o.data.user.name, displayName: o.data.user.name },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" }, timeout: 60000,
      } })) as PublicKeyCredential;
      const res = cred.response as AuthenticatorAttestationResponse;
      const r = await zone("passkey_register", { clientDataJSON: b64u(res.clientDataJSON), attestationObject: b64u(res.attestationObject) });
      setMsg(r.status === 200 ? "Passkey enrolled. Unlock with it to open this session." : `Not enrolled: ${r.data.error}`);
    } catch (e) { setMsg(`Not enrolled: ${(e as Error).message}`); }
    setBusy(false); refresh();
  };

  const unlock = async () => {
    setBusy(true); setMsg("");
    try {
      const o = await zone<{ challenge: string; rpId: string; allowCredentials: string[] }>("passkey_options", {});
      if (o.status !== 200) throw new Error(o.data.error);
      const a = (await navigator.credentials.get({ publicKey: {
        challenge: fromB64u(o.data.challenge), rpId: o.data.rpId, userVerification: "required", timeout: 60000,
        allowCredentials: o.data.allowCredentials.map((id) => ({ type: "public-key" as const, id: fromB64u(id) })),
      } })) as PublicKeyCredential;
      const res = a.response as AuthenticatorAssertionResponse;
      const r = await zone("passkey_assert", { credentialId: b64u(a.rawId), clientDataJSON: b64u(res.clientDataJSON), authenticatorData: b64u(res.authenticatorData), signature: b64u(res.signature) });
      setMsg(r.status === 200 ? "Unlocked for 10 minutes." : `Locked: ${r.data.error}`);
    } catch (e) { setMsg(`Locked: ${(e as Error).message}`); }
    setBusy(false); refresh();
  };

  const resolve = async (p: Pending) => {
    try {
    const d = draft[p.id];
    const r = await zone<{ contextVersion: number; decision: { version: number } }>("leader_resolve", { ticket_id: p.id, statement: d?.statement, conditions: d?.conditions || undefined, confirmed: d?.confirm === true, expected_version: p.decision?.version ?? 0 });
    setMsg(r.status === 200 ? `Saved and read back: decision v${r.data.decision.version}, context v${r.data.contextVersion}. The teammate will see it with your name on it.` : `Not saved: ${r.data.error}`);
    refresh();
    } catch { setMsg("Not saved: connection failed. Refresh before retrying."); }
  };

  if (me?.error) return <main className={s.page}><p>Open this page from your leader session link. {me.error}</p></main>;
  if (me && me.role !== "leader") return <main className={s.page}><h1 className={s.title}>Leader Desk is locked</h1><p className={s.meta}>Only the verified team leader can open it. Facing this zone or visiting this URL doesn't change that.</p></main>;

  return (
    <main className={s.page}>
      <div className={s.top}>
        <h1 className={s.title}><a href="/" aria-label="Kaam Ki Baat home" style={{ display: "inline-flex" }}><BrandMark size={26} /></a>Leader Desk · {me?.participant?.name ?? "…"}</h1>
        <span className={s.badge} style={{ borderColor: me?.stepUpFresh ? "var(--ok)" : "var(--center)" }}>{me?.stepUpFresh ? "session unlocked" : "locked"}</span>
      </div>
      {!me?.stepUpFresh && (
        <section className={`${s.card} ${s.activeC}`} style={{ maxWidth: 620 }}>
          <div className={s.label}>Verify it's you, on this device</div>
          <div className={s.h}>Unlock with your passkey</div>
          <div className={s.row}><button className={`${s.btn} ${s.primary}`} disabled={busy} onClick={unlock}>Unlock with Touch ID / passkey</button></div>
          <details style={{ marginTop: 14 }}><summary className={s.meta}>First time on this device? Enrol it.</summary>
            <div className={s.row} style={{ marginTop: 10 }}>
              <input className={s.input} placeholder="one-time leader code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
              <button className={s.btn} disabled={busy} onClick={enrol}>Enrol this device</button>
            </div>
          </details>
          {msg && <p className={s.meta} style={{ marginTop: 12 }}>{msg}</p>}
        </section>
      )}
      {me?.stepUpFresh && (
        <section className={`${s.card} ${s.activeC}`}>
          <div className={s.label}>Open questions from the team</div>
          {msg && <p className={s.meta}>{msg}</p>}
          {pending.length === 0 && <p className={s.meta}>Nothing pending. Questions your team escalates appear here.</p>}
          <div className={s.list}>
            {pending.map((p) => (
              <div key={p.id} className={s.item}>
                <div className={s.meta}>{p.requesterName} asks · {p.id}{p.decision ? ` · current: ${p.decision.state} v${p.decision.version}` : ""}</div>
                <div style={{ fontSize: 16, margin: "6px 0 8px" }}>{p.question}</div>
                {p.contextRefs.map((c, i) => <div key={i} className={s.meta}>source · {c.label}</div>)}
                <div className={s.row} style={{ marginTop: 10, flexWrap: "wrap" }}>
                  <input className={s.input} placeholder="Your answer (becomes the approved decision)" onChange={(e) => setDraft((d) => ({ ...d, [p.id]: { ...d[p.id], statement: e.target.value } }))} />
                  <input className={s.input} placeholder="Conditions (optional)" onChange={(e) => setDraft((d) => ({ ...d, [p.id]: { ...d[p.id], conditions: e.target.value } }))} />
                </div>
                <label className={s.meta} style={{ display: "flex", gap: 8, marginTop: 10 }}><input type="checkbox" onChange={(e) => setDraft((d) => ({ ...d, [p.id]: { ...d[p.id], confirm: e.target.checked } }))} /> I confirm this answer</label>
                <button className={`${s.btn} ${s.primary}`} style={{ marginTop: 10 }} onClick={() => resolve(p)}>Approve and send</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
