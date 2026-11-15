# Call evaluation page

Open **Call evals** from the home page, or visit `/evals`. The operator's prepared link carries `#b=<board capability>`; the page consumes it into memory and removes it from the URL. Calls are restricted by `KKB_BOARD_KEY`, sent in an Authorization header. Anonymous visitors receive the page shell only. Private transcripts, source passages and credentials never enter Git or public prerendered HTML.

The page shows all attempts, including failures and short calls, with duration, termination, agent version, transcript delivery flags, actual function arguments/results, call-time context/settings, latency, pipeline logs and authored reviews. Configured tools and preflight requests are separate from actual provider function counts. Deterministic checks do not establish speech quality, organizer eligibility or independently verified saved actions.

The initial 2026-11-15 MCP/API reconciliation found **seven attempts**: three phone calls (48s, 94s, 50s), three completed browser calls (158.5s, 102.1s, 11.3s), and one abandoned browser attempt (0s). Three phone calls pass the duration gate; the 94s call ended with a voice-provider error. No saved task update was demonstrated. Seven private authored reviews retain the findings and replay gaps. Browser context follow-ups and the stop-call request need focused regression review.

## Refresh and storage

The open page polls every 30 seconds; server sync is limited to once per minute and coalesces concurrent requests. API failures retain the previous snapshot with a visible stale warning. The sync uses seven-day date windows and pagination, preserves older calls, and retries unavailable debug sections. Initial backfill starts on this project's first call date, 2026-11-15; override `KKB_EVAL_SINCE` for a different authorized start date.

```bash
node --env-file=.env.local --import tsx scripts/eval-sync.ts
```

Requires existing server-only `BOLNA_API_KEY`, `BOLNA_AGENT_ID` and the correct `KKB_EVENTS_FILE`. Optional `KKB_EVAL_DIR` selects a private persistent directory; the default is ignored `data/private/call-evals`. Do not put it under a public or tracked path. Content-addressed immutable runs and an atomically replaced `latest.json` are verified by persisted read-back. Credentials, phone numbers and recording URLs are removed before storage; raw LLM requests are excluded from the dashboard. Optional private `reviews.json` maps execution UUIDs to review text or a list of appended reviews.

A T3 recurring task refreshes the isolated evaluation store every 15 minutes, starting 2026-11-15 17:06 IST, and reviews new calls without changing agents or placing calls. It depends on this Mac, T3 scheduling and its private credentials remaining available. The open-page refresh also depends on a running application server. Neither mechanism places calls or changes agent configuration.

## Sources

- [Bolna execution history API](https://www.bolna.ai/docs/api-reference/executions/get_executions)
- [Bolna execution debug API](https://www.bolna.ai/docs/api-reference/executions/get_execution_debug)
- [Evaluation pipeline and evidence rules](../evaluation-pipeline.md)
