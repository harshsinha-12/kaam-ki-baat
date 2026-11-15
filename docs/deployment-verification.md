# Deploying Kaam Ki Baat to Vercel Own Track

**Status (2026-11-15): blocked on Vercel GitHub App access to the target repository. No deployment parity or public-access check has passed for `harshsinha-12/kaam-ki-baat`.**

## Target and why the old URL is insufficient

- Correct source: `harshsinha-12/kaam-ki-baat` (public), branch `main`.
- Intended Vercel team: `own-track` (`team_AqmETX0fYSmEqQCjxXHDgjcv`).
- Existing Vercel project `kaam-ki-baat` under Own Track is linked to **`charan-rathore/kaam-ki-baat`**, a different GitHub origin. Its previous deployment may be READY but is not evidence that this repository's latest code is live.
- An attempt to create a correctly linked `kaam-ki-baat-live` project was rejected with HTTP 400: `To link a GitHub repository, you need to install the GitHub integration first.`
- Never replace the existing project or reuse a legacy URL without confirming that the target origin and deployed SHA are correct.

## One-time authorization step

A GitHub repository owner/admin must install or configure the **Vercel GitHub App** with access to the exact repository:

1. Open https://github.com/settings/installations (or the `harshsinha-12` account's installed-app settings).
2. Select **Vercel** → **Configure**, or install the app if absent.
3. Grant repository access to **`harshsinha-12/kaam-ki-baat`** (ideally selected-repository access only).
4. Return to the **Own Track** Vercel team → Add New Project → import the exact repository. Choose a distinct project name such as `kaam-ki-baat-live`.
5. Set framework **Next.js**, root directory **repository root**, production branch **main**. Do not paste or publish secrets.

The GitHub owner/account admin may need to grant this access; a collaborator with push permission does not necessarily have installation administration permissions.

## Deployment parity check

Once the project builds, run:

```bash
npm run deploy:check -- https://<public-deployment-domain> <expected-full-main-sha>
```

The `/api/deployment-info` route exposes **non-secret deployment provenance**:
`{ project, gitCommitSha, gitCommitRef, gitRepo, gitRepoOwner, provider, ... }`.

This check:
- Rejects a Vercel login/protection page in place of the app.
- Checks the app landing page, `/story`, `/graph`, and `/api/deployment-info`.
- Fails if the deployed SHA does not equal the expected SHA.
- Shows a clear error when Git metadata is unavailable.

**Do not** add a public Live Demo badge or URL to the README until a production URL is READY, matches the correct origin and full commit, and passes the public-access check.

## Animation and interaction QA

These require an actual rendered browser, not just HTTP responses:

1. Open the site using an external/private browser session without Vercel login. Confirm no authentication challenge on public pages.
2. Desktop viewport: check the character/head turning, three color-coded agents, speech bubble text, scroll-reveal effects and animated graph. Ensure text remains legible.
3. Interact: click LEFT, CENTER, RIGHT and use `A`, `↑`, `L` or arrow keys; verify the highlighted agent and copy update. Check that interactive agent demos remain labeled as examples, not live integrations.
4. Mobile viewport: verify no horizontal overflow, tappable controls, sensible stacking and accessible text.
5. Enable OS `prefers-reduced-motion` and reload. Motion should be disabled or minimized; all content should remain visible and usable.
6. In browser DevTools, check for hydration errors, 404s for illustration assets, missing fonts, uncaught client exceptions, console errors and broken SVG animations.
7. Test at slower network speed and with camera/audio permission denied. Manual navigation must still work.
8. For secure team/leader routes, validate authorization with fixture users only; never open private meeting data publicly.
9. Record screenshots or a short screen capture of actual rendering and the deployed SHA.

## Private functionality and runtime constraints

- `/story`, `/graph` and the landing page need no private credentials; Bolna calls, meeting import, and protected board functions do.
- Local JSONL/temporary runtime storage is not a reliable shared durable store across Vercel serverless function instances. Review the current storage contracts and move shared writable state to an appropriately scoped durable store before claiming production-safe persistence.
- Credentials belong in Vercel encrypted environment variables, not the Git repository or frontend.
- A production deployment isn't proof that actual Wispr MCP reads, Bolna callbacks, WebRTC, AirPods motion or leader escalation work. Verify each separately.

## CI note

The existing GitHub Action `.github/workflows/deploy-vercel.yml` uses `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` secrets; it skips deployment if any are missing. The safer default for newly Git-linked projects is Vercel's native Git integration. Do not wire the legacy deploy job to a different project unintentionally.

## Status update requirements

After deployment, record in `docs/plan.md` and `docs/integrations.md`:
- Vercel team/project ID, canonical public domain and Git origin.
- Production branch and exact deployed full SHA.
- READY state, public-access test, smoke check and visual-motion QA result.
- Any outstanding secret, hosted-state, phone-call or native-hardware blockers.
