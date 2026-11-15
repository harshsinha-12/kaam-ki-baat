import { it } from "node:test";
import assert from "node:assert/strict";
import { codeScout } from "../lib/specialists/code-scout";
import { testSnapshot } from "./helpers/snapshot";

it("does not turn generic question words into evidence for a different product's task", () => {
  const snapshot = testSnapshot();
  const task = { ...snapshot.tasks[0], searchTerms: ["inventoryrebalance", "warehousestock"], prNumber: undefined };
  snapshot.files = [{ path: "lib/scout.ts", content: "export function findImplementation() { return 'matching implementation'; }" }];
  assert.deepEqual(codeScout(snapshot, task, "Where is the matching implementation?"), []);
  snapshot.files.push({ path: "lib/inventory.ts", content: "export function inventoryRebalance() { return 'pending'; }" });
  const matches = codeScout(snapshot, task, "Where is the matching implementation?");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].path, "lib/inventory.ts");
  assert.equal(matches[0].match, "candidate");
});
