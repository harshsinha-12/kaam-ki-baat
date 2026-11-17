import type { EventBackend, StoredEvent } from "./event-store";

export interface RedisConfig { url: string; token: string; namespace: string }
export function redisConfig(env: Record<string, string | undefined> = process.env): RedisConfig | null {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "").trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "").trim();
  if (!url && !token) return null;
  if (!url || !token) throw new Error("Hosted storage requires both its REST URL and token.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/")
    throw new Error("Hosted storage must use a credential-free HTTPS origin.");
  const namespace = env.KKB_STORAGE_NAMESPACE?.trim() || "kaam-ki-baat";
  if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(namespace)) throw new Error("Invalid storage namespace.");
  return { url: parsed.origin, token, namespace };
}

/** REST credentials stay server-side. EVAL routes consistency-sensitive reads to the primary. */
export class RedisClient {
  private readonly cached = new Map<string, { digest: string; value: string | null; chain: Promise<void> }>();
  constructor(readonly config: RedisConfig, private readonly transport: typeof fetch = fetch) {}
  async command<T>(args: (string | number)[]): Promise<T> {
    const response = await this.transport(this.config.url, {
      method: "POST", headers: { Authorization: `Bearer ${this.config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args), cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Hosted storage unavailable (${response.status}).`);
    const body = await response.json() as { result?: T; error?: unknown };
    if (body.error || !("result" in body)) throw new Error("Hosted storage rejected the operation.");
    return body.result as T;
  }
  get(key: string): Promise<string | null> { return this.command(["EVAL", "return redis.call('GET', KEYS[1])", 1, key]); }
  /** Revalidate on the primary on every read; unchanged large values stay in process. */
  getCached(key: string): Promise<string | null> {
    let entry = this.cached.get(key);
    if (!entry) {
      entry = { digest: "", value: null, chain: Promise.resolve() };
      this.cached.set(key, entry);
    }
    const cache = entry;
    const result = cache.chain.then(async () => {
      const reply = await this.command<unknown>(["EVAL", READ_CACHED, 1, key, cache.digest]);
      if (!Array.isArray(reply)) throw new Error("Invalid hosted value response.");
      if (reply.length === 0) { cache.digest = ""; cache.value = null; return null; }
      if (typeof reply[0] !== "string" || !/^[a-f0-9]{40}$/.test(reply[0]) ||
          !(reply.length === 2 && typeof reply[1] === "string" || reply.length === 1 && reply[0] === cache.digest && cache.value !== null))
        throw new Error("Invalid hosted value response.");
      if (reply.length === 2) { cache.digest = reply[0]; cache.value = reply[1]; }
      return cache.value;
    });
    cache.chain = result.then(() => {}, () => {});
    return result;
  }
  setIfAbsent(key: string, value: string): Promise<string | null> { return this.command(["SET", key, value, "NX"]); }
}

const READ_CACHED = `
local value = redis.call('GET', KEYS[1])
if not value then return {} end
local digest = redis.sha1hex(value)
if digest == ARGV[1] then return {digest} end
return {digest, value}`;

// Event history is append-only. A shorter log discards the local prefix.
// LLEN and LRANGE execute atomically on the primary; no stale TTL reads.
const READ_EVENTS = `
local length = redis.call('LLEN', KEYS[1])
local offset = tonumber(ARGV[1])
if offset > length then offset = 0 end
return {offset, redis.call('LRANGE', KEYS[1], offset, -1)}`;

const COMPARE_APPEND = `
if redis.call('LLEN', KEYS[1]) ~= tonumber(ARGV[1]) then return 0 end
for i = 2, #ARGV do redis.call('RPUSH', KEYS[1], ARGV[i]) end
return 1`;

export class RedisEventBackend implements EventBackend {
  readonly key: string;
  private values: string[] = [];
  private readChain: Promise<void> = Promise.resolve();
  constructor(private readonly redis: RedisClient) { this.key = `${redis.config.namespace}:events`; }
  read(): Promise<StoredEvent[]> {
    const result = this.readChain.then(async () => {
      const reply = await this.redis.command<unknown>(["EVAL", READ_EVENTS, 1, this.key, this.values.length]);
      if (!Array.isArray(reply) || reply.length !== 2 ||
          !(reply[0] === 0 || reply[0] === this.values.length) ||
          !Array.isArray(reply[1]) || !reply[1].every((value: unknown) => typeof value === "string"))
        throw new Error("Invalid hosted event log.");
      const values = reply[0] === 0 ? reply[1] as string[] : this.values.concat(reply[1]);
      // Parse before advancing the cursor; bad data must fail again on retry.
      // Fresh objects keep callers from mutating the cached prefix.
      const events = values.map(value => JSON.parse(value) as StoredEvent);
      this.values = values;
      return events;
    });
    this.readChain = result.then(() => {}, () => {});
    return result;
  }
  async append(events: StoredEvent[]): Promise<void> {
    if (events.length) await this.redis.command(["RPUSH", this.key, ...events.map(e => JSON.stringify(e))]);
  }
  async compareAppend(length: number, events: StoredEvent[]): Promise<boolean> {
    return await this.redis.command<number>(["EVAL", COMPARE_APPEND, 1, this.key, length, ...events.map(e => JSON.stringify(e))]) === 1;
  }
}
