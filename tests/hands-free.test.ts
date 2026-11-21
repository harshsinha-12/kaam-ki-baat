import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectWake, listen, normalizeWake, type Listener } from "../lib/core/wake-phrase";
import { isConfirmation, planCommand } from "../lib/core/voice-commands";
import { recallFrames, type RecallFrame } from "../lib/core/recall-frames";
import { zoneSetup } from "./helpers/zones";

describe("wake phrase", () => {
  it("hears the wake phrase through common mishearings and in Devanagari", () => {
    for (const said of ["Hey Wispr, code dikhao", "hey whisper code dikhao", "Hay wisper code dikhao", "हे विस्पर code dikhao", "hey kaam code dikhao", "okay kam code dikhao"]) {
      const w = detectWake(said);
      assert.equal(w.woke, true, said);
      if (w.woke) assert.equal(w.command, "code dikhao", said);
    }
  });
  it("does not wake on ordinary speech or a wake word inside another word", () => {
    for (const said of ["we whispered about the freeze", "the kaam was done", "heykaamwala", "whisper it to the lead"]) assert.equal(detectWake(said).woke, false, said);
  });
  it("keeps only what follows the last wake phrase", () => {
    const w = detectWake("hey kaam open the... no, hey kaam open tests/passkey.test.ts");
    assert.ok(w.woke && w.command === "open tests/passkey.test.ts");
  });
  it("normalises spacing and punctuation", () => assert.equal(normalizeWake("  Hey,   Whisper!  next "), "hey wispr! next"));
});

describe("listening state machine", () => {
  const run = (events: Parameters<typeof listen>[1][]) => {
    let cur: Listener = { state: "off" }; const commands: string[] = [];
    for (const e of events) { const st = listen(cur, e); cur = st.next; if (st.command) commands.push(st.command); }
    return { cur, commands };
  };
  it("ignores all speech until the person enables it and the browser grants it", () => {
    const r = run([{ type: "transcript", text: "hey wispr next", final: true, now: 0 }, { type: "enable" }, { type: "transcript", text: "hey wispr next", final: true, now: 1 }]);
    assert.deepEqual(r.commands, []);
    assert.equal(r.cur.state, "asking");
  });
  it("wakes, captures the command after the pause, then re-arms", () => {
    const r = run([{ type: "enable" }, { type: "granted" }, { type: "transcript", text: "hey wispr", final: false, now: 10 },
      { type: "transcript", text: "code freeze kab hai", final: false, now: 900 }, { type: "transcript", text: "code freeze kab hai", final: true, now: 1500 }]);
    assert.deepEqual(r.commands, ["code freeze kab hai"]);
    assert.equal(r.cur.state, "armed");
  });
  it("one final transcript with wake and command is one command", () => {
    const r = run([{ type: "enable" }, { type: "granted" }, { type: "transcript", text: "Hey Kaam, go right", final: true, now: 5 }]);
    assert.deepEqual(r.commands, ["go right"]);
  });
  it("falls back to armed when nothing follows within the window", () => {
    const r = run([{ type: "enable" }, { type: "granted" }, { type: "transcript", text: "hey wispr", final: false, now: 0 }, { type: "tick", now: 9000 }]);
    assert.equal(r.cur.state, "armed");
  });
  it("a refusal blocks without retrying, and disable always turns it off", () => {
    let r = run([{ type: "enable" }, { type: "denied", reason: "not-allowed" }, { type: "transcript", text: "hey wispr next", final: true, now: 1 }]);
    assert.equal(r.cur.state, "blocked"); assert.deepEqual(r.commands, []);
    r = run([{ type: "enable" }, { type: "granted" }, { type: "disable" }, { type: "transcript", text: "hey wispr next", final: true, now: 1 }]);
    assert.equal(r.cur.state, "off"); assert.deepEqual(r.commands, []);
  });
  it("text dictated by Wispr Flow into the command field works with or without the wake phrase, even while the mic is off", () => {
    assert.deepEqual(run([{ type: "typed", text: "Hey Wispr, next", now: 0 }]).commands, ["next"]);
    assert.deepEqual(run([{ type: "typed", text: "woh timeout wala code kahan hai?", now: 0 }]).commands, ["woh timeout wala code kahan hai?"]);
  });
});

describe("command planning", () => {
  const t = (s: string) => planCommand(s).command;
  it("switches agents in English and Hinglish", () => {
    assert.deepEqual(t("go left"), { type: "switch_zone", zone: "team_memory" });
    assert.deepEqual(t("right jao"), { type: "switch_zone", zone: "code_navigator" });
    assert.deepEqual(t("Code Navigator"), { type: "switch_zone", zone: "code_navigator" });
    const lead = planCommand("leader desk");
    assert.deepEqual(lead.command, { type: "switch_zone", zone: "leader_desk" });
    assert.match(lead.say, /passkey/);
  });
  it("opens a file at a line", () => {
    assert.deepEqual(t("open lib/core/persist-update.ts line 25"), { type: "open_file", path: "lib/core/persist-update.ts", line: 25 });
    assert.deepEqual(t("persist-update.ts kholo"), { type: "open_file", path: "persist-update.ts", line: undefined });
  });
  it("routes free questions with the existing intent rules, after cleaning fillers", () => {
    assert.deepEqual(t("umm woh timeout wala code kahan hai"), { type: "search_code", query: "woh timeout wala code kahan hai" });
    assert.equal(t("code freeze kab hai?").type, "ask_memory"); // a decision, not a code location
    assert.deepEqual(t("Hey Wispr, go right"), { type: "switch_zone", zone: "code_navigator" });
    assert.deepEqual(t("Hey Wispr, where do we read back before saying saved"), { type: "search_code", query: "where do we read back before saying saved" });
    assert.deepEqual(t("what did we agree about the freeze"), { type: "ask_memory", question: "what did we agree about the freeze" });
  });
  it("takes and recalls memory frames", () => {
    assert.deepEqual(t("remember this as the freeze rule"), { type: "capture_frame", note: "the freeze rule" });
    assert.deepEqual(t("yaad rakho"), { type: "capture_frame", note: undefined });
    assert.deepEqual(t("what was I looking at when we talked about passkey"), { type: "recall", query: "we talked about passkey" });
    assert.deepEqual(t("kya dekh raha tha kal"), { type: "recall", query: "kal" });
  });
  it("steps through results and stops", () => {
    assert.deepEqual(t("agla"), { type: "step_result", direction: 1 });
    assert.deepEqual(t("previous result"), { type: "step_result", direction: -1 });
    assert.deepEqual(t("bas karo"), { type: "stop_listening" });
  });
  it("needs a yes before reaching the lead, and never changes task status", () => {
    const p = planCommand("Charan se puchho freeze kab hai");
    assert.equal(p.command.type, "ask_lead"); assert.equal(p.needsConfirm, true); assert.equal(p.risk, "write");
    assert.equal(t("mark it done").type, "not_allowed");
    assert.ok(isConfirmation("haan")); assert.ok(isConfirmation("Yes.")); assert.ok(!isConfirmation("yes but later"));
  });
});

describe("recall frames", () => {
  const now = new Date("2026-11-22T10:00:00Z");
  const frame = (id: string, at: string, extra: Partial<RecallFrame>): RecallFrame => ({ id, participantId: "dev", at, zone: "code_navigator", repository: "team/repo", sha: "abc", tags: [], ...extra });
  const frames = [
    frame("a", "2026-11-22T09:00:00Z", { query: "where do we read back before saying saved", source: { repository: "team/repo", sha: "abc", path: "lib/core/persist-update.ts", start: 3, end: 9 } }),
    frame("b", "2026-11-21T15:00:00Z", { zone: "team_memory", query: "code freeze kab hai", answer: "Only proposed, not confirmed." }),
    frame("c", "2026-11-10T15:00:00Z", { query: "passkey signature counter", sha: "old" }),
  ];
  it("finds a frame by what was asked or answered, and flags older commits", () => {
    assert.equal(recallFrames(frames, { pinnedSha: "abc" }, "freeze").hits[0].frame.id, "b");
    const p = recallFrames(frames, { pinnedSha: "abc" }, "passkey").hits[0];
    assert.equal(p.frame.id, "c"); assert.equal(p.freshness, "older_commit");
  });
  it("understands today / yesterday (kal) and returns latest frames for an empty question", () => {
    assert.deepEqual(recallFrames(frames, { pinnedSha: "abc" }, "kal").hits.map((h) => h.frame.id), ["b"]);
    assert.deepEqual(recallFrames(frames, { pinnedSha: "abc" }, "today", now).hits.map((h) => h.frame.id), ["a"]);
    assert.deepEqual(recallFrames(frames, { pinnedSha: "abc" }, "", now).hits.map((h) => h.frame.id), ["a", "b", "c"]);
  });
  it("returns nothing rather than a random frame when nothing matches", () => assert.equal(recallFrames(frames, { pinnedSha: "abc" }, "xylophone").hits.length, 0));
});

describe("hands-free zone actions", () => {
  it("captures a frame, reads it back, and recalls it only for its owner", async () => {
    const z = await zoneSetup();
    const cap = await z.act(z.dev, "recall_capture", { zone: "code_navigator", query: "read back before saved", source: { path: "lib/core/persist-update.ts", start: 3, end: 8 } });
    assert.equal(cap.status, 200); assert.equal(cap.body.readBack, true);
    const mine = await z.act(z.dev, "recall_search", { question: "read back" });
    assert.equal((mine.body.hits as unknown[]).length, 1);
    const theirs = await z.act(z.mate, "recall_search", { question: "read back" });
    assert.equal((theirs.body.hits as unknown[]).length, 0);
  });
  it("refuses source outside the snapshot, a frame with nothing in it, and source for people without repository access", async () => {
    const z = await zoneSetup();
    assert.equal((await z.act(z.dev, "recall_capture", { zone: "code_navigator", source: { path: ".env", start: 1, end: 1 } })).status, 400);
    assert.equal((await z.act(z.dev, "recall_capture", { zone: "team_memory" })).status, 400);
    assert.equal((await z.act(z.dev, "recall_capture", { zone: "code_navigator", source: { path: "lib/core/persist-update.ts", start: 5, end: 999 } })).status, 400);
    assert.equal((await z.act(z.outsider, "recall_capture", { zone: "code_navigator", source: { path: "lib/core/persist-update.ts", start: 1, end: 2 } })).status, 403);
    assert.equal((await z.act(z.dev, "recall_capture", { zone: "leader_desk", note: "x" })).status, 403);
  });
  it("plans commands without side effects", async () => {
    const z = await zoneSetup();
    const before = (await z.store.all()).length;
    const p = await z.act(z.dev, "command_plan", { text: "hey wispr open lib/core/persist-update.ts line 3" });
    assert.equal(p.status, 200);
    assert.equal((await z.store.all()).length, before);
  });
});
