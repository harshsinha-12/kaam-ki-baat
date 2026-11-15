> Planning reference adapted from the user-supplied handoff on 2026-11-15. Project naming has been updated. This is design intent, not implemented behavior. Current user instructions and [the active plan](../plan.md) take precedence.

# Recommended source repository structure (implementation target)

```text
kaam-ki-baat/
├── README.md
├── START_HERE.md
├── AGENTS.md                     # Codex instructions
├── CLAUDE.md                     # Claude Code instructions
├── .env.example                  # variable names only
├── package.json
├── next.config.ts
├── tsconfig.json
├── app/
│   ├── page.tsx                  # one-page evidence / next-action screen
│   └── api/
│       ├── bolna/tools/route.ts   # authenticated tool dispatch
│       ├── bolna/webhook/route.ts # idempotent call record ingest
│       ├── meetings/import/route.ts
│       └── projects/[id]/brief/route.ts
├── components/
│   ├── BriefCard.tsx
│   ├── EvidenceTrail.tsx
│   └── TestPulse.tsx
├── lib/
│   ├── adapters/
│   │   ├── wispr-mcp.ts          # read-only authorized MCP
│   │   ├── github.ts             # selected repo read-only
│   │   └── bolna.ts              # outbound call initiation / execution fetch
│   ├── core/
│   │   ├── normalize.ts          # typed evidence extraction
│   │   ├── reconcile.ts          # deterministic task state rules
│   │   ├── briefs.ts             # scope-limited first-turn brief
│   │   └── permissions.ts        # participant and repo access
│   ├── db/
│   │   ├── schema.ts
│   │   └── repository.ts
│   └── contracts.ts              # Zod request/response schemas
├── tests/
│   ├── reconciliation.test.ts
│   ├── permissions.test.ts
│   ├── tool-postconditions.test.ts
│   └── fixtures/
│       ├── synthetic-meeting.md
│       └── synthetic-github.json
└── docs/
    ├── MASTER_CONTEXT.md
    ├── ARCHITECTURE.md
    ├── DATA_CONTRACTS.md
    ├── INTEGRATIONS.md
    ├── UX_FLOWS.md
    ├── EVALUATION.md
    ├── BUILD_PLAN.md
    ├── DECISIONS.md
    └── PITCH.md
```

## Priority commit sequence
1. `chore: scaffold and schemas` — fixture-based evidence records + tests.
2. `feat: reconcile tasks with GitHub states` — no LLM hallucinated status.
3. `feat: participant-specific context and verified writes` — permissions + postcondition.
4. `feat: Bolna callable endpoints` — one real end-to-end call.
5. `feat: Wispr approved meeting import` — OAuth MCP tested; explicit fallback.
6. `test: preserve and fix real regression` — actual V1/V2 evidence.
7. `docs: demo evidence and known limitations`.

## Minimal dependencies
Next.js, React, TypeScript, Zod, small DB adapter, Vitest. Integrations behind provider-specific modules. Avoid full code indexing and vector DB until there is a demonstrated retrieval need.
