import { EventStore, eventsLogPath } from "./store/event-store";
import { loadSnapshot } from "./evidence/load";
import type { Runtime } from "./tools/runtime";

// One process-wide runtime for the Next.js server. Conversations live in memory
// (single process); every write and tool call is persisted in the event log.
const g = globalThis as unknown as { __kkbRuntime?: Runtime };

export function getRuntime(): Runtime {
  if (!g.__kkbRuntime) {
    g.__kkbRuntime = {
      store: new EventStore(eventsLogPath()),
      snapshot: loadSnapshot(),
      conversations: new Map(),
    };
  }
  return g.__kkbRuntime;
}
