# Hands-free: "Hey Wispr", commands and memory frames

Status (2026-11-22, Claude, branch `claude/hey-wispr-recall-motion`): implemented and covered by synthetic tests. Real microphone, browser speech recognition and Wispr Flow dictation into the field were **not** tested in this session.

## What is and is not possible

Wispr Flow is a closed desktop dictation app. It has no public API for a third party to add a wake word to Flow itself or to drive Flow from our code; the Wispr MCP connected to this project reads meetings and notes only. So Kaam Ki Baat does two things instead:

1. **Its own wake phrase**, off by default: "Hey Wispr", "Hey Kaam" or "OK Kaam" (and common mishearings such as "hey whisper", "हे विस्पर"). One click asks the browser for the microphone; refusing leaves it off for good until clicked again. It pauses whenever the tab is hidden, and "bas", "stop" or the switch turns it off. In Chrome the browser's speech service may process audio on its provider's servers; the panel says so.
2. **Wispr Flow as the keyboard.** Flow types wherever the cursor is, so the command field in the workspace's Hands-free panel accepts dictated text with or without the wake phrase. A Flow user needs no second microphone.

## Flow

```
speech/Flow text ──► lib/core/wake-phrase.ts   (state machine: off → asking → armed → awake → armed)
                        │ command text only, after a wake or from the field
                        ▼
                 zone action "command_plan"   (server, no side effects)
                        │ lib/core/voice-commands.ts → { command, risk, needsConfirm, say }
                        ▼
                 app/team/page.tsx runPlan    (fixed allowlist, existing authorized actions)
```

Allowlisted commands: switch agent ("left jao", "code navigator"), search code, ask Team Memory, open a file at a line, next/previous result ("agla", "pichla"), remember this view, recall a view, ask the lead (needs "yes/haan"), stop. Task status changes are refused here; they keep their call-based read-back flow. The agent cannot press arbitrary buttons, type into other apps or touch the OS.

## Memory frames ("photographic memory")

`lib/core/recall-frames.ts`. A frame stores *what was on screen* as data: agent, question, answer, note, meeting id, and the file and line range at the pinned commit. No pixels and no source text. Frames are append-only zone events (`recall_frame`), scoped to one participant and one repository, validated against the snapshot (path must exist, range bounded) and read back before success. Recall ranks by words in the frame, an exact-path bonus and a 7-day half-life recency prior, understands "today/aaj", "yesterday/kal", "last week", "just now/abhi", and flags frames from an older commit. Reopening rebuilds the source view from current authorized bytes.

Zone actions: `command_plan`, `recall_capture`, `recall_search` (`lib/zones/service.ts`).

## Code search and highlights

- The workspace's Code Navigator now seeds its answer with semantic search (fallback: graph-v1) and returns up to five `alternatives`, which "agla/pichla" step through.
- `lib/codegraph/highlight.ts` boxes the signature plus the body lines that contain the question's words, instead of the three lines under the declaration.
- Search: a generic Hindi/Hinglish function-word stoplist and a name-coverage boost (weight 0.6 chosen on the development set only; 0, 0.3, 0.6 and 1.0 tried).

Results at `d814ee0` (`npm run eval:retrieval -- --code-ref HEAD`; full report in [evals/code-search.md](evals/code-search.md)):

| Set (semantic) | Fn Acc@1 before → after | Fn Acc@5 | MRR@10 |
| --- | --- | --- | --- |
| Development (28) | 50% → 61% | 96% → 100% | 0.71 → 0.76 |
| Held-out (12) | 8% → 8% | 42% → 42% | 0.20 → 0.21 |
| Stress, Hinglish (14) | 29% → 36% | 71% → 71% | 0.45 → 0.51 |
| Fresh test (22) | 18% → 27% | 73% → 86% | 0.42 → 0.49 |

Highlight quality on the 29 questions where the top answer is right: a box shows a line with the question's own words 48% → 97% of the time; 66% → 95% of highlighted lines are evidence; 3.0 → 3.4 lines to read. The held-out set is still weak (8% Acc@1): lexical search cannot bridge paraphrases that share no words with the code. These are team-written regression sets, not a public benchmark.
