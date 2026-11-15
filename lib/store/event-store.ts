import { promises as fs } from "node:fs";
import path from "node:path";
import type { SavedUpdate, UpdateRepository } from "../core/persist-update";

// Append-only event log (D-011). One JSON object per line. Old values are never
// overwritten. Pass file=null for an in-memory store (tests).

export type StoredEvent =
  | { type: "task_update"; at: string; record: SavedUpdate }
  | { type: "call_session"; at: string; session: CallSession }
  | { type: "web_call_consent"; at: string; callId: string; participantId: string; recording: true; snapshotSha: string }
  | { type: "call_execution"; at: string; callId: string; executionId: string; agentId: string; channel: "web" | "phone" }
  | { type: "tool_call"; at: string; callId: string; tool: string; ok: boolean; summary: string; evidenceIds: string[] }
  | { type: "communicated"; at: string; callId: string; factId: string; fact: string; acknowledged: boolean }
  // Spatial zones / escalation / live context (lib/zones). Typed payloads live there.
  | { type: "zone"; at: string; kind: string; key: string; data: Record<string, unknown> };

export type ZoneEvent = Extract<StoredEvent, { type: "zone" }>;

export interface CallSession {
  callId: string;
  tokenHash: string; // sha256 of the per-call token; the raw token is never stored
  participantId: string;
  meetingIds: string[];
  repository: string;
  consentRecordedBy: string; // who recorded consent, and how (free text, no phone numbers)
  scenario: string;
  expiresAt: string;
}

// A copied .env.example leaves optional keys blank. Blank is unset, not "the current directory".
export function eventsLogPath(envValue = process.env.KKB_EVENTS_FILE): string {
  const chosen = envValue?.trim() || "data/runtime/events.jsonl";
  return path.resolve(chosen);
}

export class EventStore implements UpdateRepository {
  private events: StoredEvent[] = [];
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string | null) {}

  private async readEvents(): Promise<StoredEvent[]> {
    if (!this.file) return this.events;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      return raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as StoredEvent);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      return [];
    }
  }

  // One runtime writer per process. Serialize the idempotency lookup together
  // with its append, and keep reads from racing an unfinished local append.
  private serialize<T>(run: () => Promise<T>): Promise<T> {
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  all(): Promise<StoredEvent[]> {
    return this.serialize(async () => [...await this.readEvents()]);
  }

  private async appendEvent(event: StoredEvent): Promise<void> {
    if (this.file) {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const fh = await fs.open(this.file, "a");
      try {
        await fh.writeFile(JSON.stringify(event) + "\n");
        await fh.sync();
      } finally {
        await fh.close();
      }
    } else {
      this.events.push(event);
    }
  }

  /**
   * Atomic check-then-append (compare-and-set) under the same serialization as
   * every other write. `decide` sees the persisted log and returns the event to
   * append, or a rejection. Used for idempotency keys, version checks and dedupe.
   */
  appendGuarded<T>(decide: (events: StoredEvent[]) => { append: StoredEvent | StoredEvent[]; result: T } | { reject: T }): Promise<T> {
    return this.serialize(async () => {
      const d = decide(await this.readEvents());
      if ("reject" in d) return d.reject;
      for (const e of Array.isArray(d.append) ? d.append : [d.append]) await this.appendEvent(e);
      return d.result;
    });
  }

  /** Serialized, durable append. Resolves only after the line is fsynced. */
  append(event: StoredEvent): Promise<void> {
    return this.serialize(() => this.appendEvent(event));
  }

  // ---- UpdateRepository (idempotent) ----
  writeOnce(record: SavedUpdate): Promise<{ id: string; replayed: boolean }> {
    return this.serialize(async () => {
      const existing = (await this.readEvents()).find(
        (e) => e.type === "task_update" && e.record.idempotencyKey === record.idempotencyKey,
      );
      if (existing && existing.type === "task_update") return { id: existing.record.id, replayed: true };
      await this.appendEvent({ type: "task_update", at: record.at, record });
      return { id: record.id, replayed: false };
    });
  }

  async read(id: string): Promise<SavedUpdate | null> {
    const hit = (await this.all()).find((e) => e.type === "task_update" && e.record.id === id);
    return hit && hit.type === "task_update" ? hit.record : null;
  }

  async latestUpdate(taskId: string): Promise<SavedUpdate | null> {
    const ups = (await this.all()).filter((e) => e.type === "task_update" && e.record.taskId === taskId);
    const last = ups[ups.length - 1];
    return last && last.type === "task_update" ? last.record : null;
  }

  async findCallByTokenHash(tokenHash: string): Promise<CallSession | null> {
    const hit = (await this.all()).find((e) => e.type === "call_session" && e.session.tokenHash === tokenHash);
    return hit && hit.type === "call_session" ? hit.session : null;
  }

  async since(iso: string): Promise<StoredEvent[]> {
    return (await this.all()).filter((e) => e.at > iso);
  }
}
