import { randomUUID } from "node:crypto";
import type { ActionReceipt, BrowserAction, PageState, PendingAction, SpatialContext } from "./contracts";
import { emptyPage } from "./context";

interface Channel {
  page: PageState;
  seenAt: number;
  expiresAt: number;
  pending: Map<string, { command: PendingAction; finish: (r: ActionReceipt) => void }>;
}

// Matches the existing single-process conversation runtime. Ephemeral browser
// state is not a task write, and is deliberately lost on restart.
export class SpatialBridge {
  private channels = new Map<string, Channel>();
  constructor(private timeoutMs = 4000) {}

  private channel(callId: string, expiresAt: number): Channel {
    for (const [id, c] of this.channels) {
      if (c.expiresAt <= Date.now()) {
        for (const p of c.pending.values()) p.finish({ ok: false, message: "Session expired." });
        this.channels.delete(id);
      }
    }
    let c = this.channels.get(callId);
    if (!c) {
      c = { page: emptyPage(), seenAt: 0, expiresAt, pending: new Map() };
      this.channels.set(callId, c);
    }
    return c;
  }

  read(callId: string, expiresAt: number) {
    const c = this.channel(callId, expiresAt);
    return { page: c.page, connected: Date.now() - c.seenAt < 5000 };
  }

  heartbeat(callId: string, expiresAt: number, page: PageState, receipt?: { id: string; result: ActionReceipt }) {
    const c = this.channel(callId, expiresAt);
    c.page = page;
    c.seenAt = Date.now();
    if (receipt) {
      const pending = c.pending.get(receipt.id);
      if (pending && pending.command.expiresAt > Date.now()) {
        const a = pending.command.action;
        const matches = a.type === "scroll_page" || (a.type === "focus_space" ? page.space === a.target :
          page.space === "code" && page.selectedEvidence === a.target);
        pending.finish(receipt.result.ok && !matches ? { ok: false, message: "The browser state did not match the requested action." } : receipt.result);
      }
    }
    return [...c.pending.values()].map(p => p.command).filter(p => p.expiresAt > Date.now());
  }

  async execute(callId: string, expiresAt: number, action: BrowserAction, context: SpatialContext): Promise<ActionReceipt> {
    const c = this.channel(callId, expiresAt);
    if (Date.now() - c.seenAt >= 5000) return { ok: false, message: "The browser is disconnected. Open and connect the workspace first." };
    if (action.type === "focus_evidence" && !context.cards.some(card => card.evidence.some(e => e.id === action.target))) {
      return { ok: false, message: "That evidence is not available to this session." };
    }
    if (c.pending.size) return { ok: false, message: "A browser action is already pending. Wait for its result." };
    return new Promise(resolve => {
      const id = randomUUID();
      const command = { id, action, expiresAt: Math.min(Date.now() + this.timeoutMs, expiresAt) };
      const timer = setTimeout(() => finish({ ok: false, message: "Browser confirmation timed out. The action is not confirmed." }), this.timeoutMs);
      const finish = (result: ActionReceipt) => {
        clearTimeout(timer);
        c.pending.delete(id);
        resolve(result);
      };
      c.pending.set(id, { command, finish });
    });
  }
}

const g = globalThis as unknown as { __kkbSpatial?: SpatialBridge };
export function getSpatialBridge() { return g.__kkbSpatial ??= new SpatialBridge(); }
