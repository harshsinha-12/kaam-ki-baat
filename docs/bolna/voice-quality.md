# Voice quality and replay

The [repository call review](../evals/4518451f-0deb-4f8d-a73f-9f1a0dc44609.md) records the 94-second call, user feedback and the observed Sarvam idle-WebSocket failure. The user then explicitly requested better listening, less repetition and useful answers to project and general questions. The latest prompt/engine patch has passed persisted provider read-back. Its effect on speech has not been tested yet.

## Prepare a repeatable patch

Save a fresh existing-agent GET response privately, then run from the project root:

```sh
node --import tsx scripts/prepare-voice-quality.ts --input data/private/agent-readback.json
```

This creates `data/private/voice-quality-update.json` exclusively, mode `0600`. It contains existing callback credentials: never print or commit it. The command only prepares a narrow update. Apply the authorized update through Bolna and read the agent back; an update response alone is insufficient. Preserve the dynamic welcome, callback URLs/authentication, completion webhook, caller scope and voice/model. If using a full v2 update, retain current top-level agent settings too. Backups and provider results remain private.

The managed policy in [voice-quality.ts](../../lib/adapters/voice-quality.ts) replaces its own previous block on subsequent runs. It asks for one or two short sentences, one task proposal with a starting file/acceptance criterion, and no repeated introductions/task lists. It handles brief acknowledgements in conversation, invites a caller to finish a clipped sentence, and permits general questions without pretending to have fresh web/account access. Prompt instructions are desired behaviour, not deterministic guarantees or durable memory across calls.

Engine settings are threshold `0`, linear delay `500` ms, presence check after `12` seconds, silence hangup after `30` seconds, total duration cap `600` seconds, and at most `220` response tokens. Bolna's public interruption predicate drops `word_count <= threshold` during playback; setting zero permits a one-word acknowledgement through that predicate, with greater sensitivity to background speech. Actual hosted behaviour needs a replay. Existing speech detection/transcriber settings remain unchanged.

Sarvam retains the same voice/model but uses `stream: false`. Bolna's public synthesizer routes that mode through per-response HTTP, avoiding the idle persistent socket. This mitigation can increase time to first audio; provider acceptance/read-back is not proof of clean runtime audio. We cannot install keepalive/reconnection fixes inside Bolna's hosted service. Retain the failure evidence if HTTP mode also fails; compare another supported transport/provider only with a measured scenario.

Sources checked 2026-11-15: [Bolna engine settings](https://www.bolna.ai/docs/agent-setup/engine-tab), [interruption predicate](https://github.com/bolna-ai/bolna/blob/master/bolna/agent_manager/interruption_manager.py), [synthesis transport routing](https://github.com/bolna-ai/bolna/blob/master/bolna/synthesizer/stream_synthesizer.py), [Sarvam HTTP implementation](https://github.com/bolna-ai/bolna/blob/master/bolna/synthesizer/sarvam_synthesizer.py), [Sarvam socket keepalive/disconnect guidance](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/streaming-api/web-socket).

## Next requested call

Use the same permitted repository context and preserve its SHA. Prepare a new private session/attempt and consent reference, verify source scope and provider read-back, and submit once. Do not automatically redial an accepted/uncertain request. This procedure does not itself authorize another call.

1. Ask what the project does. Expect a brief explanation, then room to speak.
2. Describe a concrete difficulty in two parts, with a natural pause. Expect the agent to hear the complete problem or ask one necessary clarification.
3. Ask for a task. Expect one open/unclaimed proposal with a starting file and a measurable acceptance criterion, never a suggestion to rebuild existing tools or an assertion that an assignment was saved.
4. Say only “haan”; interrupt the next answer with “ruko”. Confirm these reach the model and speech stops/resumes without restarting the overview or listing the same tasks.
5. Ask a stable general question, then return to the previous project issue. Expect a useful answer and retained in-call context, without forced redirection to a task list.
6. Take a 20-second thinking pause, continue naturally past two minutes, then ask to end. Check the presence prompt, continued audio, response latency and final termination reason.

Preserve provider progression and audio observations with timestamps. Score each expectation as observed, failed or unverified. Exclude setup preflight events from voice-tool counts; only claim a saved update after authorized persistence/read-back. Compare the same prompts and source SHA with the prior version; the earlier meeting call is a different scenario.
