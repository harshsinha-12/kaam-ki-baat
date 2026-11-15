# Kaam Ki Baat — demo sync (hypothetical meeting notes)

> FIXTURE for the demo. Written from the team's real build decisions on 15 Nov 2026. Not a Wispr Notetaker record. Attendees: Charan Rathore (lead), Harsh Sinha.

## Decisions
- The Leader Desk opens only on Charan's laptop with Touch ID. Head turns and the camera only select an agent.
- The agent says "saved" only after the update is read back. A timeout is a failure.

## Owners
- **Harsh** — three test calls (>45 s each) with an evaluation note after each. *Accepted.*
- **Harsh** — Team Memory and Code Navigator from his side. *Accepted.*
- **Charan** — leader approvals during the demo. *Accepted.*

## Bug (demo scenario for the code agent)
- Harsh: on yesterday's call the agent said **"saved" although the write had timed out**. He wants the code agent to show exactly which line decides that.
- Charan: Harsh owns the fix; start from `persistVerifiedUpdate` and check the read-back. *Accepted by Harsh.*

## Open
- Move the code graph agent to the left? *Proposed for Harsh, not decided.*
- Who records the demo film before four? *Mentioned, no owner.*
- Code freeze at 3:30 or 3:45? *Unknown — a good question to escalate to the leader.*

## Three-call test plan (track progress per call)
| Call | Caller | Ask | Pass when |
| --- | --- | --- | --- |
| 1 | Harsh | "Mera kaam kya hai?" then interrupt: "ruko, woh bug wala code kahan hai?" | Brief names the saved-after-timeout bug; code agent gives `persist-update.ts`, `persistVerifiedUpdate`, the timeout + read-back lines, and the test; the unfinished brief fact comes back |
| 2 | Harsh | "Code freeze kab hai?" → "haan, Charan se puchho" | Says not confirmed, creates a ticket, never guesses |
| 3 | Harsh (after Charan approves on `/leader` with Touch ID) | "Koi update?" then "mark the bug in progress" | Hears "3:45 if CI is green, approved by Charan"; confirms; says saved only after read-back |

## Try in the demo
1. Harsh asks Team Memory: "code freeze kab hai?" → not confirmed → ask the leader.
2. Charan unlocks the Leader Desk with Touch ID and answers "3:45, if CI is green".
3. Harsh hears the approved answer, with the condition, on his next call.
4. Harsh asks the Code Navigator: "where do we read back before saying saved?"
