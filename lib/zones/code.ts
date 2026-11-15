import type { EvidenceSnapshot, Task } from "../contracts";
import { codeScout } from "../specialists/code-scout";
import { fixNavigator } from "../specialists/fix-navigator";
import { zoneAccess } from "./focus";
import type { Actor } from "./identity";

// RIGHT — Code Navigator. Returns an exact, SHA-pinned location the UI can open
// and highlight. Every location is re-checked against the pinned file content so
// a highlight can never point at lines that don't exist at that commit.

export interface CodeLocation {
  repository: string;
  sha: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  symbol?: string;
  match: "candidate" | "confirmed";
  url: string;
  lines: string[]; // the exact highlighted lines at `sha`
  verified: boolean; // range exists at sha and url is the canonical permalink
}

export function navigateCode(snapshot: EvidenceSnapshot, actor: Actor, question: string, taskId?: string) {
  const access = zoneAccess(actor, "code_navigator");
  if (!access.allowed) return { ok: false as const, status: 403 as const, reason: access.reason };
  const task: Task | undefined = taskId
    ? snapshot.tasks.find((t) => t.id === taskId && actor.meetingIds.includes(t.meetingId))
    : undefined;
  if (taskId && !task) return { ok: false as const, status: 403 as const, reason: "task not authorized" };
  const findings = codeScout(snapshot, task, question, 3);
  const plan = fixNavigator(snapshot, findings);
  const locations = findings.map((f) => checkLocation(snapshot, f.path, f.lineStart, f.lineEnd, f.match, f.symbol, f.url));
  const test = plan.test ? checkLocation(snapshot, plan.test.path, plan.test.line, plan.test.line, "confirmed", undefined, plan.test.url) : null;
  return {
    ok: true as const,
    repository: snapshot.repository,
    sha: snapshot.pinnedSha,
    label: snapshot.label,
    locations,
    test,
    steps: plan.steps,
    speak: plan.spoken,
  };
}

export function checkLocation(snapshot: EvidenceSnapshot, path: string, a: number, b: number, match: "candidate" | "confirmed", symbol: string | undefined, url: string): CodeLocation {
  const file = snapshot.files.find((f) => f.path === path);
  const all = file ? file.content.split("\n") : [];
  const canonical = `https://github.com/${snapshot.repository}/blob/${snapshot.pinnedSha}/${path}#L${a}-L${b}`;
  const inRange = Boolean(file) && a >= 1 && b >= a && b <= all.length;
  const verified = inRange && url === canonical;
  return {
    repository: snapshot.repository, sha: snapshot.pinnedSha, path, lineStart: a, lineEnd: b, symbol,
    match: verified ? match : "candidate", // anything we cannot verify stays a candidate
    url: canonical,
    lines: inRange ? all.slice(a - 1, b) : [],
    verified,
  };
}
