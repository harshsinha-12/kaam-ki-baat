# Kaam Ki Baat

A voice teammate that connects what a team agreed in a meeting with what its GitHub repository shows, then helps each teammate take the next useful action.

**Stage:** the application core, four runtime tools, evidence specialists and GitHub adapter are implemented. Current demo work and exact verification results are tracked in [the plan](docs/plan.md). Real calls, agent changes, deployment, and merging each need a separate instruction.

## Start here (plain version)

1. Read [architecture.md](docs/architecture.md). It explains the problem, the direction, and the build order.
2. Read [integration-design.md](docs/integration-design.md). It explains exactly how Wispr Flow and Bolna connect to the system.
3. Read [decisions.md](docs/decisions.md). It lists every decision, whether it is confirmed, and what is still open.

## Working with coding agents

Start with [AGENTS.md](AGENTS.md) for the required instruction reads, implementation and Git checks, contributor coordination, and handoff workflow. [CLAUDE.md](CLAUDE.md) directs Claude clients to the same instructions. Keep [the plan](docs/plan.md) current as work progresses; verify its status against the checkout before acting.

## Project notes

- [Context](docs/context.md): purpose, proposed MVP, and open decisions.
- [Instructions](docs/instructions.md): current working constraints and acceptance principles.
- [Plan](docs/plan.md): completed preparation and future milestones.
- [MCP integrations](docs/integrations.md): endpoints, authentication, and verified connection status.
- [Tool recommendations](docs/tool-research.md): tools to use for setup, debugging, and the future voice runtime.
- [Code context](docs/code-context.md): optional Graphify retrieval linking meeting tasks to pinned code and dependencies.
- [Workspace setup](docs/workspace-setup.md): public/private GitHub access, passkey settings and required APIs.
- [Competition rules](docs/competition.md): verified schedule, strict call duration, and submission requirements.
- [Evaluation pipeline](docs/evaluation-pipeline.md): stored call evaluations and reviewed improvements between calls.
- [Handoff references](docs/reference/README.md): retained architecture, contracts, UX, and evaluation details.

## Development setup

The application uses Next.js and TypeScript with a local append-only JSONL store. Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`. Copy `.env.example` to ignored `.env.local` and supply random server keys before starting the app. Meeting import, live calls and evaluations have their own verification gates; see [voice setup](docs/bolna/agent.md).

Use **Kaam Ki Baat** as the project name everywhere. The repository is [harshsinha-12/kaam-ki-baat](https://github.com/harshsinha-12/kaam-ki-baat).
