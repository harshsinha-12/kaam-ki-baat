# Launch PR review: docs, evals, glance-and-latch (2026-11-16)

Scope: PR #49 (`claude/launch-docs-evals` → `main`), which supersedes #48. Reviewed by re-running the evals, probing Team Memory with adversarial questions, reading the head-turn selector and keyboard controls, and checking every README number and citation against its source. Nothing was changed in code during this review. Fixes are for the next pass.

## Summary

| Severity | Count | Headline |
| :--- | ---: | :--- |
| High | 3 | README links to an unverified live site; the README's reproduce command does not reproduce the published eval numbers; a one-word Team Memory query confirms an unrelated decision |
| Medium | 5 | Keyboard controls don't work with webcam input; test claims unverifiable here; citation gaps (no ICML papers); "dev" numbers presented without saying they were tuned on; selector has no hardware test |
| Low | 3 | Graph counts are from an older commit; baseline 64% not re-measured; stat URLs not re-checked against source |

## Verified correct

- The six runtime tool names in `docs/architecture.md` match `app/api/tools` and `lib/tools`: `get_my_brief`, `get_task_evidence`, `get_changes`, `record_task_update`, `request_clarification`, `get_project_context`.
- Team Memory headline numbers match `docs/evals/team-memory.json`: 35 questions, 86% kind, 81% decision, 0 false confirmations, 0 scope leaks; reworded dev 75%, blind 33%.
- Code-search numbers reproduce exactly when run at the pinned commit `652c30b`: test set Acc@5 77%, MRR 0.45, nDCG@10 0.55; dev 100% Acc@5 and held-out 42% Acc@5 also match.
- Call durations (48 s, 94 s, 50 s; four browser attempts; the 94 s call ended with a voice-provider error) match `docs/evals/dashboard.md`.
- All internal links in `README.md` and `docs/architecture.md` resolve.
- The MemoryAgentBench OpenReview link is the real ICLR 2026 paper.
- The head-turn selector (`lib/focus/selector.ts`) has no logic defect found on reading. The centre hold only applies after a side is selected, and a lost camera freezes state rather than inferring a selection.

## High

### H1. README links to a live site the repo says is unverified
- Where: `README.md` line 7 (`Live site`, `Workspace`), line 74 (`/evals`).
- Evidence: `docs/deployment-verification.md` says the Vercel project `kaam-ki-baat` is linked to `charan-rathore/kaam-ki-baat`, a different GitHub origin, and that the public site for this repo is "not yet verified". The top of the main README says the live-demo link should only be added after that check.
- Impact: visitors are sent to a deployment that may not run this code.
- Fix: remove the live links until production commit and origin are verified, or verify and link the correct deployment.

### H2. Reproduce command does not reproduce the published numbers
- Where: `README.md` "Reproduce the evals" block; `scripts/eval-retrieval.ts` line 38 uses `codeRefArg()`.
- Evidence: `npx tsx scripts/eval-retrieval.ts --code-ref HEAD` skips 3 of 28 dev, 2 of 12 held-out and 13 of 22 test questions ("answer not at this commit"). Running with `--code-ref 652c30b` reproduces every published number.
- Fix: change the command to the pinned SHA and state that the question sets are tied to it. Consider storing the SHA in the eval case files.

### H3. One-word Team Memory query confirms an unrelated decision
- Repro: the probe `askTeamMemory(snapshot, [], member, "saved")` returns `kind: confirmed` for `dec:t_readback` ("only say saved after the update is read back from the store").
- Cause: the acceptance rule in `lib/zones/memory.ts` is `matched >= Math.min(2, Math.max(1, qLen)) || (...)`. A one-word question needs only one matched term, and "saved" is a common word.
- Impact: the agent confidently answers a question about a different subject. No status is invented, but this is a wrong-topic confirmation, the failure the eval exists to prevent. The eval has no one-word cases, so it misses this.
- Fix: require a non-generic term match for short questions, add one-word and generic-word cases to `MEMORY_CASES`, and add a regression test in `tests/memory-safety.test.ts`.

## Medium

### M1. Arrow keys do not drive the selector with webcam input
- Where: `app/components/FocusInputControls.tsx` line ~97 returns early unless `snapshot.input.provider === "manual"`. The keys call `select()` directly, bypassing dwell and latch.
- README claims: "Webcam, native AirPods motion and the arrow keys all drive the same selector", and "pressing ↑ returns to the Leader Desk".
- Fix: either route keys through the selector and remove the manual-only gate, or correct the README. Test the keyboard path in the browser.

### M2. Test-count claims cannot be verified here
- README says "148 to 223 passing tests across the hackathon day … now 230+" with "zero failures".
- Local run: 233 tests, 227 pass, 6 fail. All six are environmental (`tsx`, `next`, `@mediapipe/tasks-vision` or other packages not installed in this sandbox). CI check on `a2557b7` succeeded.
- Fix: replace with the CI result and the actual count.

### M3. Citations do not match "latest ICML papers"
- The request asked for evals grounded in the latest ICML papers on semantic code search and team memory. The README cites no ICML 2026 paper.
- CoREB (arXiv 2605.04615, May 2026) is a real code retrieval benchmark with graded relevance. The README's phrase "the graded nDCG@10 protocol of CoREB" is loosely accurate, but CoREB is not an ICML paper and the link is missing.
- MemoryAgentBench (ICLR 2026) is real, but its four competencies are accurate retrieval, test-time learning, long-range understanding and selective forgetting. We label the conflict category "conflict"; it should say "selective forgetting".
- CoIR (arXiv 2407.02883) and LongMemEval (arXiv 2410.10813) were not re-verified in this pass.
- Fix: find the ICML 2026 papers the user meant, cite them with links, and correct the MemoryAgentBench wording.

### M4. Dev numbers are presented without saying they were tuned on
- README: "reach 75% on the dev set and 33% on a blind set". The dev reworded questions were used to add `MEMORY_WORDS` entries (video/film, freeze, helper→agent, side→left/right), so 75% is tuned-on. Only the 33% blind result is clean.
- Fix: label dev as "used for tuning" in both README and `docs/evals/team-memory.md`.

### M5. Selector and head-turn behaviour has no hardware or browser test
- The 30–40° glance, 300 ms dwell and 4 s centre hold are tested only with synthetic samples. The Swift `MotionSelector` was not compiled here.
- Fix: run `native/airpods` tests on a Mac, and do a live webcam session with a checklist.

## Low

### L1. Graph counts are from an older commit
- "454 nodes, 1,277 edges" comes from `docs/codegraph/GRAPH_REPORT.md`, built at `317a348`, not at the current commit. The README says "at the indexed commit", which is ambiguous.

### L2. The 64% → 77% improvement was not re-measured here
- The 64% baseline comes from an earlier run before the feedback and synonym changes. Reproducing it needs the search code from `2789d33^`.

### L3. External statistic URLs not re-checked
- Microsoft Work Trend Index and Stack Overflow 2024 links appear in the landing-page code, which was sourced earlier. The 68%, 57%, 55% and 61% figures were not re-read from the sources in this pass.

## Process notes

- PR #48 shows `merged: true` but its commit `a2557b7` never reached `main`. Its base branch `claude/ui-redesign` was deleted after PR #47 merged. Use PR #49 for the review.
- The test set `TEST_2026_11` was viewed once after the first change. This is disclosed in the PR body and should stay disclosed.

## Suggested order for the fix pass

1. H1, H2 and H3 (blocking).
2. M1 and M4 (wording and behaviour the README promises).
3. M2 and M3 (claims and citations).
4. M5 (hardware checklist, run by the user).
5. L1–L3.
