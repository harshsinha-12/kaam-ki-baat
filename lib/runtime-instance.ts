import { runtimeStore } from "./store/runtime-store";
import { loadRuntimeSnapshot } from "./evidence/hosted";
import type { Runtime } from "./tools/runtime";

const g = globalThis as unknown as { __kkbRuntime?: Runtime; __kkbRuntimePromise?: Promise<Runtime> };

// The process cache is an optimization. Snapshot and event/session state are
// shared in hosted storage, so a new Vercel instance resolves the same identity.
export async function getRuntime(): Promise<Runtime> {
  if (g.__kkbRuntime) return g.__kkbRuntime;
  if (!g.__kkbRuntimePromise) {
    g.__kkbRuntimePromise = loadRuntimeSnapshot().then(snapshot => {
      const runtime: Runtime = { store: runtimeStore(), snapshot, conversations: new Map() };
      g.__kkbRuntime = runtime;
      return runtime;
    }).catch(error => { g.__kkbRuntimePromise = undefined; throw error; });
  }
  return g.__kkbRuntimePromise;
}
