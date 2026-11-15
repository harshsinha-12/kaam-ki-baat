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
  setIfAbsent(key: string, value: string): Promise<string | null> { return this.command(["SET", key, value, "NX"]); }
}

const COMPARE_APPEND = `
if redis.call('LLEN', KEYS[1]) ~= tonumber(ARGV[1]) then return 0 end
for i = 2, #ARGV do redis.call('RPUSH', KEYS[1], ARGV[i]) end
return 1`;

export class RedisEventBackend implements EventBackend {
  readonly key: string;
  constructor(private readonly redis: RedisClient) { this.key = `${redis.config.namespace}:events`; }
  async read(): Promise<StoredEvent[]> {
    const values = await this.redis.command<string[]>(["EVAL", "return redis.call('LRANGE', KEYS[1], 0, -1)", 1, this.key]);
    if (!Array.isArray(values)) throw new Error("Invalid hosted event log.");
    return values.map(value => JSON.parse(value) as StoredEvent);
  }
  async append(events: StoredEvent[]): Promise<void> {
    if (events.length) await this.redis.command(["RPUSH", this.key, ...events.map(e => JSON.stringify(e))]);
  }
  async compareAppend(length: number, events: StoredEvent[]): Promise<boolean> {
    return await this.redis.command<number>(["EVAL", COMPARE_APPEND, 1, this.key, length, ...events.map(e => JSON.stringify(e))]) === 1;
  }
}
