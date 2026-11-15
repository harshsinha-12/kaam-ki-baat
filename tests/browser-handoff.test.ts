import { it } from "node:test";
import assert from "node:assert/strict";
import { browserHandoff, parseBrowserHandoff } from "../lib/auth/browser-handoff";

it("keeps device/call capabilities distinct and preserves existing board links", () => {
  const device = "d".repeat(32), call = "c".repeat(32);
  assert.deepEqual(parseBrowserHandoff(`#t=${device}&c=${call}&b=board-secret`, ""), { deviceToken: device, callToken: call, boardKey: "board-secret" });
  assert.equal(parseBrowserHandoff("#t=short&c=forged!", "?key=existing").boardKey, "existing");
  assert.equal(parseBrowserHandoff("#t=short&c=forged!", "").callToken, "");
  assert.equal(parseBrowserHandoff("#b=line%0Abreak", "").boardKey, "");
});

it("consumes a prepared link once so sibling effects retain both sessions without storing call credentials", () => {
  const previous = globalThis.window;
  const device = "d".repeat(32), call = "c".repeat(32);
  const calls: string[] = [];
  const fake = { location: { pathname: "/board", search: "?callId=demo", hash: `#t=${device}&c=${call}&b=board-secret` },
    history: { replaceState: (_state: unknown, _title: string, url: string) => { calls.push(url); fake.location.hash = ""; } } };
  try {
    globalThis.window = fake as unknown as Window & typeof globalThis;
    assert.equal(browserHandoff().deviceToken, device);
    assert.equal(browserHandoff().callToken, call);
    assert.equal(browserHandoff().boardKey, "board-secret");
    assert.deepEqual(calls, ["/board?callId=demo"]);
    assert.ok(!("sessionStorage" in fake) && !("localStorage" in fake));
  } finally { if (previous) globalThis.window = previous; else Reflect.deleteProperty(globalThis, "window"); }
});
