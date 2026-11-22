# Scaler × Wispr Flow: "India Runs on Voice" (Build Out Loud)

Researched 2026-11-22 from public pages; check the official dashboard before relying on dates. Not an entry decision.

## How it operates

- Organisers: Scaler with Wispr Flow. Theme: voice-first tools for how Bharat speaks; build them by talking, not typing (Flow types wherever the cursor is, in any editor).
- Tracks (pick one): civic services, healthcare, education, small business, everyday access (older users, people with disabilities). Any Indian language; Flow detects language switches mid-sentence.
- Rounds: Round 1 online warm-up 5–26 Nov (Idea, Prompt, Impact activities; one month of Flow Pro). **Registration closes 27 Nov 2026, 11:59 pm IST.** Round 2 online build: one common problem statement released 27 Nov, submissions due 29 Nov, shortlist 2 Dec, with a Wispr master class. Round 3 finale on campus, 13 Dec, demo to Wispr leadership, founders and investors.
- Teams: solo or up to 3, India, 18+. Team locks after the first submission. Free.
- Prizes: ₹30 L total (₹7 L / ₹5 L / ₹3 L, ₹1.25 L for 4th–15th), Flow Pro for top teams, a Singapore trip, interview access at Wispr. Per-round submission rules and judging criteria are released when each round opens; top teams are chosen by total score.

Sources: [hackos.scaler.com/wispr](https://hackos.scaler.com/wispr/), [The Tribune (PTI)](https://www.tribuneindia.com/news/business/scaler-and-wispr-flow-launch-india-runs-on-voice-a-nationwide-hackathon-to-build-voice-first-solutions-for-bharat-2-2), [StartupGrants India listing](https://www.startupgrantsindia.com/scaler-wispr-flow-build-out-loud-hackathon).

## What transfers from Kaam Ki Baat

Kaam Ki Baat is a developer-team product, which fits none of the five tracks directly. Its engine does, because every track has the same failure: a spoken claim is treated as a fact. Reusable parts, already tested:

| Part | Where | Track fit |
| --- | --- | --- |
| Hinglish clean-up (fillers, self-corrections, kept topic) | `lib/core/understand.ts` | all |
| Wake phrase + allowlisted voice commands, confirm before writes | `lib/core/wake-phrase.ts`, `lib/core/voice-commands.ts` | everyday access |
| "Proposed ≠ decided" evidence rules, escalate instead of guessing | `lib/zones/memory.ts`, `lib/zones/escalation.ts` | civic, healthcare |
| Saved means read back; append-only log | `lib/core/persist-update.ts`, `lib/store/` | small business |
| Memory frames: recall what was on screen, by voice, "kal" | `lib/core/recall-frames.ts` | education, everyday access |

Directions to weigh once the 27 Nov problem statement is out (ideas, not decisions):

- **Small business, "Bola ya bana?" ledger:** a shopkeeper speaks a sale or credit ("Sharma ji ka 450 udhaar"); it is saved only after a spoken read-back, and "kal kitna udhaar diya?" recalls frames by day. Same guards: a correction mid-sentence keeps only the corrected amount.
- **Civic grievance with proof:** a complaint is filed by voice; status questions are answered only from the official record, and unknowns become a question to the office rather than a guess.
- **Everyday access:** the wake phrase plus confirm-before-act loop as a hands-free layer over one app for an older user, with Flow as the keyboard.

Constraints to plan for: Round 2 gives two days, so whatever is reused must already run; judging details are unknown until each round opens; Wispr Flow is a dictation input, not an API, so any "drive Wispr" claim must be framed as "Flow types into our field".
