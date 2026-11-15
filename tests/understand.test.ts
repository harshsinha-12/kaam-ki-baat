import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { understand } from "../lib/core/understand";
import { runTool } from "../lib/tools/runtime";
import { zoneSetup } from "./helpers/zones";

describe("understanding what the caller meant", () => {
  it("cleans fillers and self-corrections and shows each edit", () => {
    const u = understand("umm, code freeze 3:30, nahi matlab, final time kab hai?");
    assert.equal(u.cleaned, "final time kab hai?");
    assert.ok(u.edits.some((e) => e.kind === "correction" && /3:30/.test(e.text)));
    assert.ok(u.edits.some((e) => e.kind === "filler"));
    assert.match(u.normalized, /when is/);
  });
  it("maps Hinglish to intent and resolves 'woh' to the task in focus", () => {
    const u = understand("woh code kahan hai", { focusTaskTitle: "fix the saved-after-timeout bug" });
    assert.equal(u.intent, "code");
    assert.ok(u.edits.some((e) => e.kind === "resolved"));
    assert.equal(understand("PR merge hua?").intent, "verify");
    assert.equal(understand("haan, Charan se puchho").intent, "escalate");
    assert.equal(understand("bug wala task in progress kar do").intent, "update");
    assert.equal(understand("the the code is where").cleaned, "the code is where");
  });
});

describe("first-principles code answer boxes the lines in the caller's own browser", () => {
  it("a call on the Code Navigator records a focus that only that person's browser sees", async () => {
    const z = await zoneSetup();
    await z.act(z.dev, "focus", { zone: "code_navigator", provider: "keyboard" === "keyboard" ? "manual" : "manual", seq: 1 });
    await z.act(z.dev, "activate", { zone: "code_navigator", method: "keyboard" });
    const r = await runTool({ store: z.store, snapshot: z.snapshot, conversations: new Map() }, "get_task_evidence", { call_token: z.devCall.token, question: "umm woh read-back code kahan hai" });
    assert.equal(r.body.specialist, "code_navigator");
    assert.match(String(r.body.speak), /supposed to do/);
    assert.match(String(r.body.speak), /boxed those lines/);
    const hl = r.body.highlights as { start: number; reason: string }[];
    assert.ok(hl.some((h) => /reads the record back/.test(h.reason)));
    const mine = await z.act(z.dev, "code_focus");
    assert.equal((mine.body.focus as { path: string }).path, "lib/core/persist-update.ts");
    const theirs = await z.act(z.mate, "code_focus");
    assert.equal(theirs.body.focus, null); // nobody else's screen moves
    assert.equal((await z.act(z.outsider, "code_focus")).status, 403);
  });
});
