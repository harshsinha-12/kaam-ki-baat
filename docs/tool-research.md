# Tools for Kaam Ki Baat

Research date: 2026-11-15. Live authenticated discovery returned 121 Bolna tools and 16 Wispr tools. The recommendations below use the actual discovered schemas alongside official documentation; they are not a claim that every tool has been executed.

## Bolna tools to prioritize

| Need | Tools | Why / order |
| --- | --- | --- |
| Account connectivity | `get_user_info` | Read-only key check; already passed. |
| Inspect the target agent | `list_agents`, `get_agent` | Discover the ID, then inspect prompts, speech settings, and function tools. Select the project agent before reading call history. |
| Find suitable voices | `list_tts_providers`, `list_voices` | Provider lookup requires `language`, such as `hi` or `en`; voice lookup also requires returned `provider_id` and `model_id`. |
| Check configured providers | `list_providers` | Availability check; no provider changes are needed during exploration. |
| Retrieve evaluation inputs | `list_agent_executions`, `get_execution` | Obtain authoritative call status, duration, transcript, termination reason, and extraction results. |
| Diagnose a specific failure | `get_execution_debug` | Compact per-turn/pipeline diagnostics; request selected sections with `include`. Missing sections are unavailable evidence, not zero latency. |
| Investigate deeper | `get_execution_raw_logs` | Use only when the compact debug bundle is insufficient. |
| Look up current contracts | `search_docs`, `get_doc` | Search first, then retrieve the exact custom-function, audio, or engine documentation. Public documentation tools were exercised successfully. |
| Inspect extraction rules | `list_extraction_categories`, `list_dispositions`, `get_disposition` | Understand existing post-call extraction. Extraction output alone cannot prove consent, assignment, or a saved backend update. |
| Later configure and test | `create_agent`, `update_agent`, `start_outbound_call` | Needed after application/agent work is authorized and testers are selected. These operations have not run. |

Graph tools such as `validate_graph_agent` are useful if explicit conversation states are needed; a graph agent is not automatically the best MVP. Start with a small prompt and application tools unless real failures justify more structure. Bulk campaigns, sub-account management, number purchases, and SIP provisioning do not help the initial three-call experiment.

## Wispr retrieval sequence

1. Use `search_meetings` with a specific project title/date and a bounded `limit`. The schema supports `query`, `field`, `since`, `until`, attendee filters, and an opaque pagination cursor.
2. Use the exact returned meeting ID with `get_meeting`; it returns summary, bounded notes, and attendees.
3. Pass `view_transcript={}` when source wording is needed. It supports `start_char` and `char_limit` (default 12,000; maximum 40,000); continue from the returned offset when truncated.
4. Read the selected source fully enough to support the claim. Meeting search does not search transcript text. `get_meeting_participants_enriched` applies to owned meetings; it cannot establish participants in shared meetings.
5. Preserve meeting ID, speaker, source passage, and source version, subject to caller disclosure permissions.
6. Read calendar/recurring-meeting context only when a question requires it. Use scratchpad notes only if available and authorized.

Wispr Flow desktop dictation supports voice-only authoring. That capability is distinct from MCP meeting retrieval and does not provide a live speech stream to Bolna.

All 16 discovered Wispr tools:

| Area | Tools |
| --- | --- |
| Meeting evidence | `search_meetings`, `get_meeting`, `get_meeting_participants_enriched` |
| Contacts | `get_participant_contacts` |
| Shared notes | `resolve_share_link` |
| Scratchpad | `search_scratchpad_notes`, `get_scratchpad_note` |
| Calendar and recorded meetings | `search_calendar_events`, `resolve_calendar_link`, `get_calendar_event`, `get_meeting_by_calendar_id` |
| Recurrence and upcoming meetings | `list_meeting_series`, `list_upcoming_meetings`, `get_upcoming_meeting` |
| Folders | `list_folders`, `list_folder_meetings` |

For the MVP, start with meeting search and the selected transcript read. Use contact, folder, and calendar tools only when the specific question needs them; discovery does not authorize copying all account content into the project.

## Proposed tools inside the telephone agent

| Application tool | Result |
| --- | --- |
| `get_my_brief` | A short, participant-scoped opening brief and next action. |
| `get_task_evidence` | Authorized meeting, issue, PR, file, and exact-SHA check evidence with freshness. |
| `get_changes` | Attributed changes since a known snapshot/time. |
| `record_task_update` | A confirmed, authorized, idempotent mutation with persisted state read-back. |

These are proposed application endpoints, not existing Bolna MCP tools. Resolve caller identity on the server; do not trust a participant or actor ID supplied by the model. Return explicit `unknown`, `unverified`, or failure results rather than guessing or claiming a save.

## Voice quality selection

Bolna's documentation distinguishes mid-sentence Hindi/English code-mixing from a full language switch with `multilingual_config`. Research surfaced Soniox, Sarvam, AssemblyAI, and Gladia as code-mixing candidates; availability and quality on this account have not been tested. Use native-script prompts where appropriate and configure language switching through supported settings.

Compare candidate speech settings on the same short script: names and repository terms, a Hinglish sentence, interruption, a short answer, silence, an unavailable tool, and a corrected ownership claim. Store recognition mistakes, response delay, recovery, and task outcome. Choose from observed performance instead of claiming a provider is best from documentation alone.

Sources: [live Bolna server](https://mcp.bolna.ai/), [custom functions](https://www.bolna.ai/docs/tool-calling/custom-function-calls), [Hindi voice guide](https://www.bolna.ai/docs/customizations/hindi-voice-agent), [audio settings](https://www.bolna.ai/docs/agent-setup/audio-tab), [latency and interruptions](https://www.bolna.ai/docs/agent-setup/engine-tab), and the [Wispr access guide](https://docs.wisprflow.ai/articles/9551372685-connect-an-mcp-client-to-wispr-flow-remote-mcp-server).
