import { promises as fs } from "node:fs";
import path from "node:path";
import type { SavedUpdate, UpdateRepository } from "../core/persist-update";

// Append-only event log (D-011). One JSON object per line. Old values are never
// overwritten. Pass file=null for an in-memory store (tests).

export type StoredEvent =
  | { type: "task_update"; at: string; record: SavedUpdate }
  | { type: "call_session"; at: string; session: CallSession }
  | { type: "tool_call"; at: string; callId: string; tool: string; ok: boolean; summary: string; evidenceIds: string[] }
  | { type: "communicated"; at: string; callId: string; factId: string; fact: string; acknowledged: boolean };

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

export class EventStore implements UpdateRepository {
  private events: StoredEvent[] | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string | null) {}

  async all(): Promise<StoredEvent[]> {
    if (this.events) return this.events;
    if (!this.file) return (this.events = []);
    try {
      const raw = await fs.readFile(this.file, "utf8");
      this.events = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as StoredEvent);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      this.events = [];
    }
    return this.events;
  }

  /** Serialized, durable append. Resolves only after the line is fsynced. */
  append(event: StoredEvent): Promise<void> {
    const run = async () => {
      const events = await this.all();
      if (this.file) {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        const fh = await fs.open(this.file, "a");
        try {
          await fh.write(JSON.stringify(event) + "\n");
          await fh.sync();
        } finally {
          await fh.close();
        }
      }
      events.push(event);
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  // ---- UpdateRepository (idempotent) ----
  async writeOnce(record: SavedUpdate): Promise<{ id: string; replayed: boolean }> {
    const existing = (await this.all()).find(
      (e) => e.type === "task_update" && e.record.idempotencyKey === record.idempotencyKey,
    );
    if (existing && existing.type === "task_update") return { id: existing.record.id, replayed: true };
    await this.append({ type: "task_update", at: record.at, record });
    return { id: record.id, replayed: false };
  }

  async read(id: string): Promise<SavedUpdate | null> {
    if (this.file) this.events = null; // force a fresh read from disk for read-back
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
