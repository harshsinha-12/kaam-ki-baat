# Code search eval — harshsinha-12/kaam-ki-baat @ 317a348 (code from git at 317a348)

Can you find the right function from a plain-language question? Four methods, same questions, same commit.

- **grep** — files ranked by raw word counts: what an agent does with no index.
- **bm25** — classic keyword ranking over every function, class and file.
- **graph-v1** — our first explainable seed finder (one answer).
- **semantic** — BM25 + concept expansion ("fingerprint" → passkey/webauthn) + one hop of graph propagation + kind/layer priors. Lexical, no embeddings: it runs offline in the browser.

## Development set — 28 questions

| Method | symbol hit@1 | symbol hit@3 | MRR@8 | file hit@1 |
| --- | --- | --- | --- | --- |
| grep | — | — | — | 7% |
| bm25 | 25% | 46% | 0.40 | 46% |
| graph-v1 | 39% | 39% | 0.39 | 46% |
| semantic | 64% | 93% | 0.80 | 75% |

## Held-out set — 12 questions written after tuning, never used to tune

| Method | symbol hit@1 | symbol hit@3 | MRR@8 | file hit@1 |
| --- | --- | --- | --- | --- |
| grep | — | — | — | 33% |
| bm25 | 0% | 17% | 0.09 | 8% |
| graph-v1 | 8% | 8% | 0.08 | 17% |
| semantic | 8% | 33% | 0.21 | 42% |

grep ranks files only (it can't name a function). graph-v1 returns one seed, so its hit@3 equals hit@1.

## Question by question (top result)

| Set | Question | grep (top file) | bm25 | semantic |
| --- | --- | --- | --- | --- |
| dev | where do we read back before saying saved | landing/Landing.tsx | FirstPrinciples (✓ at 5) | persistVerifiedUpdate ✓ |
| dev | leader step up verification | landing/Landing.tsx | stepUp ✓ | stepUp ✓ |
| dev | which code dedupes bolna callbacks | components/SpatialWorkspace.tsx | route.ts (✓ at 6) | POST (✓ at 2) |
| dev | kahan hai head turn dwell hysteresis | landing/Landing.tsx | selector.ts | selector.ts (✓ at 2) |
| dev | passkey signature counter cloned key | tests/passkey.test.ts | assertPasskey ✓ | assertPasskey ✓ |
| dev | live utterance consent revoked | zones/live.ts | visibleUtterances (✓ at 2) | visibleUtterances (✓ at 2) |
| dev | stale CI check older sha | eval/private.ts | evidenceVerifier (✓ at 4) | evidenceVerifier (✓ at 2) |
| dev | who can open the leader desk | landing/Landing.tsx | page.tsx (✓ at 2) | zoneAccess ✓ |
| dev | where do we check the record was really stored before saying saved | eval/private.ts | evidenceVerifier | evidenceVerifier (✓ at 5) |
| dev | how does the lead prove it's them with a fingerprint | tests/zones.test.ts | zoneSetup | assertPasskey ✓ |
| dev | what ignores late or repeated phone call status updates | tools/runtime.ts | POST (✓ at 4) | recordExecutionCallback ✓ |
| dev | how is a head turn turned into choosing an agent | landing/Landing.tsx | bolna-zones.test.ts | latestActivatedZone (✓ at 2) |
| dev | where do we stop recording when someone withdraws microphone permission | landing/Landing.tsx | withdraw (✓ at 2) | setConsent ✓ |
| dev | how do we tell if CI ran on an old commit | landing/Landing.tsx | Reconciled (✓ at 5) | evidenceVerifier (✓ at 2) |
| dev | who is allowed into the leader's inbox | tests/zones.test.ts | leaderInbox ✓ | leaderInbox ✓ |
| dev | where is the answer about team decisions built | landing/Landing.tsx | ClarificationTicket (✓ at 3) | askTeamMemory ✓ |
| dev | how are filler words and self corrections cleaned | landing/Landing.tsx | understand ✓ | understand ✓ |
| dev | where is the step by step explanation of code generated | landing/Landing.tsx | StepUpVerifier | explainFirstPrinciples ✓ |
| dev | smooth animation that does not depend on frame rate | focus/webcam.ts | damp ✓ | damp ✓ |
| dev | turn a list of points into a smooth curve | landing/Landing.tsx | curves.ts (✓ at 6) | damp (✓ at 2) |
| dev | find the relevant file for a task by keywords | tools/runtime.ts | code-scout.ts | codeScout ✓ |
| dev | check the call token and figure out who is calling | eval/private.ts | create-call.ts (✓ at 4) | issueCallSession (✓ at 2) |
| dev | create a single use token for a phone call | tests/spatial-browser.test.ts | start-phone-call.ts (✓ at 8) | issueCallSession ✓ |
| dev | which agent did the caller pick on their screen | tools/runtime.ts | latestActivatedZone ✓ | latestActivatedZone ✓ |
| dev | read pull request state and check runs from github | tests/github-adapter.test.ts | GitHubClient | evidenceVerifier (✓ at 4) |
| dev | send a question to the leader when the answer is unknown | zones/escalation.ts | createTicket ✓ | createTicket ✓ |
| dev | append only event log on disk | zones/state.ts | event-store.ts (✓ at 3) | EventStore ✓ |
| dev | decide whether a model may say a task is done | tools/runtime.ts | Participant (✓ at 3) | evidenceVerifier ✓ |
| held-out | where does a teammate raise a doubt for the lead | tests/zones.test.ts | page.tsx | page.tsx |
| held-out | take back a question I already sent to the lead | tests/zones.test.ts | Team (✓ at 4) | createTicket ✓ |
| held-out | decode the binary format inside a passkey registration | zones/webauthn.ts | registerPasskey (✓ at 3) | registerPasskey (✓ at 3) |
| held-out | convert the public key from the authenticator into a usable key | zones/webauthn.ts | Leader | assertPasskey |
| held-out | who decides which helper agent should answer | landing/Landing.tsx | sessionToken | sessionToken |
| held-out | find the function that contains a given line | landing/Landing.tsx | fixNavigator | fixNavigator |
| held-out | show the leader whether they are online | landing/Landing.tsx | VOICE_QUALITY_POLICY | zoneAccess |
| held-out | how long is a curve | landing/Landing.tsx | AgentGlyph.tsx | catmullRomToBezier (✓ at 4) |
| held-out | what decisions are currently in force | zones/memory.ts | loggedDecisions (✓ at 2) | baseDecisions (✓ at 3) |
| held-out | phone the lead when nobody answers the doubt | tests/zones.test.ts | zoneSetup | callActor (✓ at 7) |
| held-out | open a session for a laptop or phone | zones/identity.ts | zoneSetup | evaluationMarkdown |
| held-out | read the camera to estimate where someone is looking | focus/webcam.ts | WebcamEnvironment | loadSnapshot (✓ at 2) |

## Where semantic still misses (file hit@1)
- which code dedupes bolna callbacks
- live utterance consent revoked
- stale CI check older sha
- where do we check the record was really stored before saying saved
- how is a head turn turned into choosing an agent
- how do we tell if CI ran on an old commit
- read pull request state and check runs from github
- where does a teammate raise a doubt for the lead
- who decides which helper agent should answer
- find the function that contains a given line
- show the leader whether they are online
- phone the lead when nobody answers the doubt
- open a session for a laptop or phone
- read the camera to estimate where someone is looking

Written by the team that built the code, so treat these as a regression guard, not a public benchmark. Reproduce: `npm run graph:eval -- --code-ref HEAD`.
