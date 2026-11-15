// Repeatable retrieval eval for the code graph over THIS repo's snapshot.
//   npm run graph:eval   — prints hit@1 so improvements are measurable.
import { getCodeGraph } from "../lib/codegraph/load";
import { queryGraph } from "../lib/codegraph/graph";
import { loadSnapshot } from "../lib/evidence/load";

const CASES: [string, string[]][] = [
  ["where do we read back before saying saved", ["persistVerifiedUpdate", "resolveTicket"]],
  ["leader step up verification", ["stepUp", "assertPasskey"]],
  ["which code dedupes bolna callbacks", ["recordExecutionCallback"]],
  ["kahan hai head turn dwell hysteresis", ["step"]],
  ["passkey signature counter cloned key", ["assertPasskey"]],
  ["live utterance consent revoked", ["ingestUtterance", "setConsent"]],
  ["stale CI check older sha", ["reconcileTask"]],
  ["who can open the leader desk", ["zoneAccess"]],
];
const s = loadSnapshot();
const g = getCodeGraph(s);
let hits = 0;
for (const [q, want] of CASES) {
  const a = queryGraph(g, q, s.files);
  const ok = want.includes(a.seed?.label ?? "");
  hits += ok ? 1 : 0;
  console.log(`${ok ? "PASS" : "MISS"}  ${q}  →  ${a.seed?.label ?? "none"} (${a.seed?.path ?? ""}:${a.seed?.line ?? ""})`);
}
console.log(`\nhit@1 = ${hits}/${CASES.length} @ ${s.pinnedSha.slice(0, 7)} (${s.label})`);
