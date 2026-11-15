import { EventStore, eventsLogPath } from "./event-store";
import { RedisClient, RedisEventBackend, redisConfig } from "./redis";

export function runtimeStore(): EventStore {
  const configured = redisConfig();
  if (configured) return new EventStore(null, new RedisEventBackend(new RedisClient(configured)));
  if (process.env.VERCEL) throw new Error("Hosted persistent storage is not configured.");
  return new EventStore(eventsLogPath());
}
