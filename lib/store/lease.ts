import { randomUUID } from "node:crypto";
import type { EventStore, ZoneEvent } from "./event-store";

/** Cross-instance exclusion; expiry recovers a request killed by the host. */
export async function acquireLease(store: EventStore, key: string, ttlMs = 60000): Promise<null | (() => Promise<void>)> {
  const owner = randomUUID();
  const acquired = await store.appendGuarded<boolean>(events => {
    const latest = events.filter((e): e is ZoneEvent => e.type === "zone" && e.kind === "runtime_lease" && e.key === key).at(-1);
    if (latest && Number(latest.data.expiresAt) > Date.now()) return { reject: false };
    return { append: { type: "zone", kind: "runtime_lease", key, at: new Date().toISOString(), data: { owner, expiresAt: Date.now() + ttlMs } }, result: true };
  });
  if (!acquired) return null;
  return async () => {
    await store.appendGuarded<boolean>(events => {
      const latest = events.filter((e): e is ZoneEvent => e.type === "zone" && e.kind === "runtime_lease" && e.key === key).at(-1);
      if (latest?.data.owner !== owner) return { reject: false };
      return { append: { type: "zone", kind: "runtime_lease", key, at: new Date().toISOString(), data: { owner, expiresAt: 0 } }, result: true };
    });
  };
}
