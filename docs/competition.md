# Competition requirements

Source: [Build Out Loud: A Wispr Flow × Bolna Hackathon](https://luma.com/1a2rjj9r), read on 2026-11-15. All times below are Asia/Kolkata. The public page says full guidelines are supplied to registered participants; this document does not claim to cover those additional guidelines.

## Published schedule

The event is in person in Bengaluru on 15 November 2026, 12 PM–5 PM.

| Time | Published activity |
| --- | --- |
| 12:00–12:30 PM | Registration |
| 12:30–1:00 PM | Instructions and setup |
| 1:00–4:00 PM | Build |
| 4:30–5:00 PM | Awards |

The page does not specify the activity for 4:00–4:30 PM or an exact submission deadline. Do not assume that interval is extra build time.

## Published rules

- Build entirely by voice through Wispr Flow, with no typing: prompts, edits, and fixes.
- Build a working voice agent or multi-agent system on Bolna.
- Teams may have up to four people; solo participation is allowed.
- Make at least three test calls, each **over 45 seconds**, with people who agreed to participate.
- Show how the project improved along the way.

Submit the agent, a short note explaining Wispr Flow usage, and examples of testing and improvements. The public page does not give a detailed judging rubric, require an LLM judge, require three different testers, or explicitly mandate MCP. MCP use is a separate user requirement for this project. Confirm detailed call eligibility and any pre-existing-code restrictions in participant guidelines.

## How this changes the plan

Call qualification uses `duration_seconds > 45`, not `>= 45`. Target a useful 60–90-second conversation; do not pad a failed interaction to qualify. Record consent and duration from actual records. Automated evaluation can check these facts but cannot guarantee a call will qualify before it finishes.

Within the three-hour build window, prioritize one useful end-to-end brief and saved action, three real calls, and a visible improvement. Keep evaluation small: deterministic qualification and evidence checks, a stored rubric, reviewed suggestions, and one comparable regression replay. A large dashboard, provider benchmark, or general-purpose evaluation framework must not delay required calls.

The public rules ask for improvement, not foundation-model training. A versioned prompt/tool/configuration fix with before/after evidence meets our proposed demonstration approach; final eligibility remains subject to organizer guidelines. Wispr MCP retrieval alone does not demonstrate voice-only development through Wispr Flow.
