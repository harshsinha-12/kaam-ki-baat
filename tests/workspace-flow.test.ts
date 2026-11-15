import { test } from "node:test";
import assert from "node:assert/strict";
import { flowReducer, initialFlow } from "../app/team/flow-state";

test("a new memory question replaces previous code or leader progress", () => {
  for (const destination of ["code", "leader"] as const) {
    let flow = flowReducer(initialFlow, { type: "start", requestId: 1, destination });
    flow = flowReducer(flow, { type: "finish", requestId: 1, success: true });
    flow = flowReducer(flow, { type: "start", requestId: 2, destination: "memory" });
    assert.deepEqual(flow, { requestId: 2, branch: null, stage: 1, busy: true });
    flow = flowReducer(flow, { type: "finish", requestId: 2, success: true });
    assert.deepEqual(flow, { requestId: 2, branch: null, stage: 2, busy: false });
  }
});

test("an older reply cannot complete a newer in-flight question", () => {
  let flow = flowReducer(initialFlow, { type: "start", requestId: 1, destination: "code" });
  flow = flowReducer(flow, { type: "start", requestId: 2, destination: "memory" });
  for (const success of [true, false]) {
    assert.equal(flowReducer(flow, { type: "finish", requestId: 1, success }), flow);
  }
  assert.equal(flow.busy, true);
  assert.equal(flow.stage, 1);
});

test("failed requests stop the pulse without claiming a completed destination", () => {
  const flow = flowReducer(initialFlow, { type: "start", requestId: 1, destination: "leader" });
  assert.deepEqual(flowReducer(flow, { type: "finish", requestId: 1, success: false }), { ...initialFlow, requestId: 1 });
});
