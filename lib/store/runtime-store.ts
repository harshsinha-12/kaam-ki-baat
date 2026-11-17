import { EventStore, eventsLogPath } from "./event-store";
import { RedisClient, RedisEventBackend, redisConfig } from "./redis";

let hostedStore: { config: NonNullable<ReturnType<typeof redisConfig>>; transport: typeof fetch; store: EventStore } | undefined;

export function runtimeStore(): EventStore {
  const configured = redisConfig();
  if (configured) {
    const previous = hostedStore?.config;
    if (!previous || previous.url !== configured.url || previous.token !== configured.token || previous.namespace !== configured.namespace || hostedStore?.transport !== fetch)
      hostedStore = { config: configured, transport: fetch, store: new EventStore(null, new RedisEventBackend(new RedisClient(configured))) };
    return hostedStore!.store;
  }
  if (process.env.VERCEL) throw new Error("Hosted persistent storage is not configured.");
  return new EventStore(eventsLogPath());
}
