import { test } from "node:test";
import assert from "node:assert/strict";
import { symbolSpan, signatureEnd } from "../lib/codegraph/highlight";
test("source spans do not consume another symbol when a quoted URL contains //", () => {
  const lines = ['export function endpoint() { return "https://example.org/api"; }', 'export function unrelated() {', '  return 42;', '}'];
  assert.deepEqual(symbolSpan(lines, 1), { start: 1, end: 1 });
});
test("quoted comment markers do not hide signature braces or change real comment handling", () => {
  const lines = ['export function endpoint(base = "https://example.org") { // }', '  return base;', '}'];
  assert.deepEqual(symbolSpan(lines, 1), { start: 1, end: 3 });
  assert.equal(signatureEnd(lines, { start: 1, end: 3 }), 1);
});
