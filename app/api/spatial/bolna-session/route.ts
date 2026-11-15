import { json, spatialAuth } from "@/lib/spatial/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const minted = new Map<string, number>();

// Dormant until the user authorizes agent setup and enables web calls locally.
// Never accepts an agent ID, participant ID or arbitrary user_data from a model.
export async function POST(req: Request) {
  const token = req.headers.get("x-kkb-call-token");
  const auth = await spatialAuth(req, "browser", token);
  if (auth.response) return auth.response;
  if (process.env.KKB_ENABLE_WEB_CALLS !== "true" || !process.env.BOLNA_API_KEY || !process.env.BOLNA_AGENT_ID) {
    return json({ ok: false, error: "Browser calls are not enabled. Bolna agent setup and call authorization are still required." }, 503);
  }
  for (const [id, expiry] of minted) if (expiry <= Date.now()) minted.delete(id);
  const { callId, expiresAt } = auth.caller.session;
  if (minted.has(callId)) return json({ ok: false, error: "A browser call was already requested for this session. Issue a new participant token for another call." }, 409);
  minted.set(callId, Date.parse(expiresAt));
  try {
    const response = await fetch("https://api.bolna.ai/web-call/freeswitch-session", {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.BOLNA_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: process.env.BOLNA_AGENT_ID, user_data: { call_token: token } }),
    });
    if (!response.ok) return json({ ok: false, error: "Bolna could not create a browser session. Issue a new participant token before retrying." }, 502);
    return json(await response.json());
  } catch { return json({ ok: false, error: "Bolna session connection failed." }, 502); }
}
