# Wispr meeting access in Team Memory

Team Memory reads the approved Wispr passages installed in the selected private evidence snapshot. It lists the meetings a participant may access, supports a meeting filter, and retrieves relevant passages for both typed questions and Bolna tool answers. Meeting excerpts do not automatically become confirmed decisions, task assignments or code matches.

## Import a selected meeting

Use the connected Wispr MCP client to read a meeting the user has selected. For a meeting ID, use `get_meeting`; for an actual `https://notes.wisprflow.ai/shared/…` link, use `resolve_share_link`. Request transcript pages explicitly and follow their continuation offsets. Account-wide OAuth access does not authorize importing every meeting. Shared-note transcript restrictions still apply. See the [official Wispr connection and access guide](https://docs.wisprflow.ai/articles/9551372685-connect-an-mcp-client-to-wispr-flow-remote-mcp-server).

Save only the approved exact passages in an ignored JSON file, using the existing meeting-import contract:

```json
{
  "meeting": {
    "id": "provider-meeting-id",
    "title": "Selected meeting title",
    "source": "LIVE",
    "approvedBy": "approver",
    "sourceVersion": "provider-modification-time-or-source-hash",
    "fetchedAt": "2026-11-15T09:00:00Z"
  },
  "passages": [{
    "kind": "meeting",
    "id": "provider-meeting-id#passage-1",
    "meetingId": "provider-meeting-id",
    "speaker": "Speaker 2",
    "charStart": 0,
    "charEnd": 16,
    "text": "Exact quotation.",
    "visibility": "team"
  }]
}
```

This is a schema example, not a real meeting. Spans use JavaScript string offsets in the normalized source text. Include `shareLink` only when Wispr actually returned it; include `transcriptHash` only for a transcript whose complete text was read and hashed. A summary is not a verbatim transcript; preserve its identity in `sourceVersion` and do not infer speaker attribution or ownership from it. A `LIVE` value is an operator claim that must be supported by the actual MCP read; the importer cannot independently authenticate a JSON export.

Merge that selected source into an existing snapshot:

```bash
npm run meeting:import -- \
  --source data/private/meeting.json \
  --snapshot data/private/snapshot.json \
  --approved-by 'Approver name' \
  --participants participant-id
```

`--participants` is an explicit, comma-separated grant of meeting access to existing participant IDs. Omit it to keep all participant permissions unchanged. `team` passages are visible to those authorized for that meeting. `participant` passages additionally require an authorized task referencing the passage. Importing a meeting never adds tasks, accepted owners or repository access.

The command validates provenance, spans, visibility and hashes, rejects unknown participants or removal of task-referenced passages, and atomically saves a mode-0600 file under ignored `data/private/`. It verifies persisted bytes before reporting success. Repeating the same import is idempotent. It retains the repository SHA, GitHub evidence, task states and overall LIVE/FIXTURE label. Optional `--out data/private/another-snapshot.json` prepares a separate snapshot for review.

Restart the application against that snapshot (`KKB_SNAPSHOT`) to load it. This is a local operator import, not a hosted OAuth picker, automatic refresh, deployment or provider write. Building a new snapshot with the older single-meeting `snapshot` command replaces the source set; reapply selected imports afterwards.

## Read and verify

- On `/team`, connect a participant session and inspect **Wispr meeting sources**. Select one meeting or search all permitted meetings.
- Authenticated `GET` or `POST /api/zones/memory_sources` lists permitted meeting metadata, source labels, freshness, actual share links and visible passage counts. `POST /api/zones/memory_ask` accepts `question` and optional `meeting_id`. An ID can narrow access, never grant it.
- Bolna's existing Team Memory routes (`get_project_context` with Team Memory selected, or `get_task_evidence` with memory focus) use the same passage access and retrieval rules. No provider configuration change is needed.
- Citations retain meeting ID/title, speaker, normalized source range, source version, read time and passage hash. Retrieval bounds excerpts and marks truncation; `excerptCharEnd` describes the returned text, while the original source range and hash remain intact.
- Missing approval, denied meeting scope, participant-only passages without a task grant and absent sources produce no meeting-text disclosure. Source text is evidence, never instructions. Clarifications retain the selected meeting and cannot be replayed into another meeting.

Tests in [wispr-memory.test.ts](../tests/wispr-memory.test.ts) use synthetic data; they do not establish a new live Wispr connection, browser audio session or deployed behavior.
