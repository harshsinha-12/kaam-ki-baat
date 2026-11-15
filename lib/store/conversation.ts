import type { Conversation } from "../specialists/orchestrator";
import type { Runtime } from "../tools/runtime";

/** Refresh the process cache from the shared audit, scoped to the current snapshot. */
export async function restoreConversations(rt: Runtime): Promise<void> {
  for (const event of await rt.store.all()) {
    if (event.type !== "zone" || event.kind !== "runtime_conversation" || event.data.repository !== rt.snapshot.repository || event.data.pinnedSha !== rt.snapshot.pinnedSha) continue;
    const conversation = event.data.conversation as Conversation | undefined;
    if (conversation?.callId === event.key && rt.snapshot.participants.some(p => p.id === conversation.participantId)) rt.conversations.set(event.key, conversation);
  }
}
export async function persistConversation(rt: Runtime, callId: string): Promise<void> {
  const conversation = rt.conversations.get(callId);
  if (!conversation) return;
  await rt.store.append({ type: "zone", kind: "runtime_conversation", key: callId, at: new Date().toISOString(), data: {
    repository: rt.snapshot.repository, pinnedSha: rt.snapshot.pinnedSha, conversation: structuredClone(conversation),
  } });
}
