import type { ActivationMethod, FocusProvider, Zone } from "../zones/contracts";
import type { FocusSnapshot } from "./input-contracts";

export type FocusTransport = (action: string, body?: Record<string, unknown>) => Promise<Record<string, unknown>>;

/** One serialized writer per browser. The epoch also fences the native writer
 * server-side; a local lease suppresses callbacks already queued by React. */
export class BrowserFocusController {
  private chain: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private current: FocusSnapshot | null = null;
  private disposed = false;

  constructor(private readonly request: FocusTransport, private readonly changed: (snapshot: FocusSnapshot) => void) {}
  get lease() { return this.generation; }
  get snapshot() { return this.current; }
  dispose() { this.disposed = true; this.generation++; }

  private queue<T>(run: () => Promise<T>): Promise<T> {
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private accept(value: Record<string, unknown>, lease: number) {
    if (this.disposed || lease !== this.generation) return;
    const next = value as unknown as FocusSnapshot;
    if (!next.ok || !next.input || !next.focus || !Number.isSafeInteger(next.input.epoch) || !Number.isSafeInteger(next.focus.seq))
      throw new Error("Invalid focus state returned by the server.");
    if (this.current && next.focus.seq < this.current.focus.seq) return;
    if (this.current && (next.input.epoch !== this.current.input.epoch || next.input.provider !== this.current.input.provider)) this.generation++;
    this.current = next;
    this.changed(next);
  }

  refresh() {
    const lease = this.generation;
    return this.queue(async () => {
      if (this.disposed || lease !== this.generation) return;
      this.accept(await this.request("focus-input"), lease);
    });
  }

  switchInput(provider: FocusProvider) {
    const lease = ++this.generation; // invalidate immediately, before the HTTP switch
    return this.queue(async () => {
      if (this.disposed || lease !== this.generation) return;
      this.accept(await this.request("focus-input", { provider }), lease);
    });
  }

  select(zone: Zone, lease = this.generation) {
    return this.queue(async () => {
      if (this.disposed || lease !== this.generation || !this.current || this.current.input.provider === "airpods") return;
      const { input, focus } = this.current;
      try {
        await this.request("focus", { zone, provider: input.provider, seq: focus.seq + 1, inputEpoch: input.epoch });
      } catch (error) {
        // A competing browser or native event may have won. Refresh, but never
        // replay an old head turn into a new input's epoch.
        this.accept(await this.request("focus-input"), lease);
        throw error;
      }
      this.accept(await this.request("focus-input"), lease);
    });
  }

  activate(method: ActivationMethod = "click") {
    const lease = this.generation;
    return this.queue(async () => {
      if (this.disposed || lease !== this.generation || !this.current?.focus.zone || this.current.focus.inputEpoch !== this.current.input.epoch || this.current.focus.provider !== this.current.input.provider) return;
      const { input, focus } = this.current;
      await this.request("activate", { zone: focus.zone, method, expectedSeq: focus.seq, inputEpoch: input.epoch });
      this.accept(await this.request("focus-input"), lease);
    });
  }
}
