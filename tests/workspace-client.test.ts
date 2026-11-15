import test from "node:test";
import assert from "node:assert/strict";
import { connectWorkspaceSession, saveSessionToken, sessionToken, zone } from "../app/zones/client";

test("automatic connection coalesces starts and replaces expired tokens even without browser storage", async () => {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
  const storage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const expired = "expired_".repeat(4), renewed = "renewed_".repeat(4);
  try {
    globalThis.window = {} as Window & typeof globalThis;
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw new Error("Storage unavailable"); } });
    saveSessionToken(expired);
    let complete!: (response: Response) => void;
    let requests = 0;
    globalThis.fetch = async (_url, init) => {
      requests++;
      assert.equal(new Headers(init?.headers).get("Authorization"), `Session ${expired}`);
      return new Promise(resolve => { complete = resolve; });
    };
    const first = connectWorkspaceSession(), second = connectWorkspaceSession();
    assert.equal(first, second);
    assert.equal(requests, 1);
    complete(Response.json({ ok: true, token: renewed }));
    await first;
    assert.equal(sessionToken(), renewed);
    globalThis.fetch = async (_url, init) => {
      assert.equal(new Headers(init?.headers).get("Authorization"), `Session ${renewed}`);
      return Response.json({ ok: true });
    };
    assert.equal((await zone("me")).status, 200);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldWindow) globalThis.window = oldWindow; else Reflect.deleteProperty(globalThis, "window");
    if (storage) Object.defineProperty(globalThis, "sessionStorage", storage); else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
