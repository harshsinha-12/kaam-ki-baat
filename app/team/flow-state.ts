export type FlowStage = 0 | 1 | 2 | 3 | 4;
type Destination = "memory" | "leader" | "code";
export type FlowState = { requestId: number; stage: FlowStage; busy: boolean; branch: "leader" | "code" | null };
type FlowAction = { type: "start"; requestId: number; destination: Destination } | { type: "finish"; requestId: number; success: boolean };

export const initialFlow: FlowState = { requestId: 0, stage: 0, busy: false, branch: null };

// Retained graph results and delivery history belong to their cards. Only the
// latest explicit request may advance the live rail, even if replies race.
export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  if (action.type === "start") {
    const branch = action.destination === "memory" ? null : action.destination;
    return { requestId: action.requestId, branch, busy: true,
      stage: action.destination === "memory" ? 1 : action.destination === "leader" ? 3 : 4 };
  }
  if (action.requestId !== state.requestId) return state;
  if (!action.success) return { ...initialFlow, requestId: state.requestId };
  return { ...state, busy: false, stage: state.branch === null ? 2 : state.stage };
}
