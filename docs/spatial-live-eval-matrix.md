# Spatial activation and live-context tests

**Status:** proposed test matrix, not claims of passing tests.

| ID | Scenario | Required result |
|---|---|---|
| S01 | Team member turns head to Center, or modifies client role | Cannot activate Leader Desk; server returns 403 |
| S02 | Leader looks toward center without passkey verification | Focus selection allowed, privileged tool blocked |
| S03 | Leader authenticates, enters Center, proposes assignment | Review-and-confirm action with persisted audit entry |
| S04 | Member looks left, asks who owns an item without approved owner | 'Unconfirmed'; evidence provided; escalation offered |
| S05 | Member explicitly asks to escalate, leader offline | Ticket pending, user notified, no outgoing call |
| S06 | Leader replies on authorized call and approves condition | Versioned decision + read-back; requester receives attributable source |
| S07 | Requester disconnected before clarification | No lost message; stored pending delivery until opt-in reconnect |
| S08 | Member looks right and asks for file | Exact SHA-pinned path/line and nearest test; no direct code mutation |
| S09 | Face tracking lost/dim light | No accidental agent activation; click/keyboard fallback |
| S10 | AirPods connected via browser Bluetooth only | Audio possible; do not claim AirPods head motion |
| S11 | No mic/meeting consent | No audio capture, STT requests, sharing or recording |
| S12 | User revokes mic in middle of call | Immediately stop app capture; future chunks absent; mark incomplete |
| S13 | Wispr meeting unavailable or delayed over MCP | `not_synced` or `unavailable`, not `live`; authorized previous evidence only |
| S14 | Member A meeting access denied, Member B content present | No cross-person disclosure, including in model context and logs |
| S15 | STT repeats a segment after reconnect or echo | One event per stable ID; dedupe/echo controls; never double approve |
| S16 | Leader changes decision; older source still in snapshot | Old state `superseded`, context version incremented; retrieval shows latest approved |
| S17 | GitHub check passed on old commit | Current SHA unverified; Code Navigator highlights only pinned revision |
| S18 | Caller interrupts a source explanation | Answer question and resume remaining important facts, not 'all heard' |
| S19 | Browser camera/BT absent | Full workflow via text/tap and normal audio where available |
| S20 | Simultaneous updates from two devices | Conflict and monotonic revision; no silent last-write-wins for decisions |

Do not use real private transcripts as public test fixtures. Use synthetic sessions, synthetic consent records and mocked providers. Separate integration tests from real consented-call evidence.