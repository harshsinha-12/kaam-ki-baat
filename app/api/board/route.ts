import { restoreConversations } from "@/lib/store/conversation";
import { NextResponse } from "next/server";
import { getRuntime } from "@/lib/runtime-instance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read model for the three-card board (UI polls this). Guarded by KKB_BOARD_KEY.
// Returns specialist cards only — never raw transcripts.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.KKB_BOARD_KEY || url.searchParams.get("key") !== process.env.KKB_BOARD_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const rt = await getRuntime();
  await restoreConversations(rt);
  const convs = [...rt.conversations.values()];
  const conv = url.searchParams.get("callId") ? rt.conversations.get(url.searchParams.get("callId")!) : convs[convs.length - 1];
  return NextResponse.json({
    ok: true,
    snapshot: { label: rt.snapshot.label, repository: rt.snapshot.repository, pinnedSha: rt.snapshot.pinnedSha, fetchedAt: rt.snapshot.fetchedAt },
    conversation: conv ? { callId: conv.callId, focus: conv.focus, cards: conv.cards, turns: conv.turns, outstanding: conv.ledger.items.filter((i) => !i.acknowledged) } : null,
  });
}
