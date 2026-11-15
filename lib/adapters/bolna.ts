// Development-time custom-function configuration. This does not create an agent
// or place a call. Generated credentials belong only in data/private/.
type Property = { type: string; description: string; enum?: string[] };

export function buildBolnaTools(baseUrl: string, toolKey: string) {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Bolna callbacks require an HTTPS origin without credentials, path, query or fragment");
  }
  if (toolKey.length < 32 || /\s/.test(toolKey)) throw new Error("KKB_TOOL_KEY must be a long, nonempty server key");
  const definitions: Array<{ name: string; description: string; properties: Record<string, Property>; required: string[] }> = [
    {
      name: "get_my_brief",
      description: "Call at the start of the conversation. Read the returned speak field as the brief; never invent meeting, owner or code facts.",
      properties: {}, required: [],
    },
    {
      name: "get_task_evidence",
      description: "Use for follow-up evidence. find searches code, locate gives the file/function/test, verify checks PR and exact-SHA CI. Use only task IDs returned by the backend.",
      properties: {
        task_id: { type: "string", description: "Authorized task ID returned by get_my_brief." },
        focus: { type: "string", description: "Evidence specialist requested by the caller.", enum: ["find", "locate", "verify"] },
        question: { type: "string", description: "The caller's evidence question in their own words." },
      }, required: ["task_id", "focus", "question"],
    },
    {
      name: "get_changes",
      description: "Read saved status changes for this caller since an ISO timestamp. This does not refresh GitHub or re-read a meeting.",
      properties: { since: { type: "string", description: "ISO 8601 timestamp to compare saved task updates against." } }, required: ["since"],
    },
    {
      name: "record_task_update",
      description: "Only after the caller explicitly confirms a task and status. Reuse the same idempotency_key for retries of that update. Say saved only if saved is true and readBack is present; otherwise speak the failure.",
      properties: {
        task_id: { type: "string", description: "Authorized task ID returned by the backend." },
        status: { type: "string", description: "Confirmed task status. reported_done is the caller's report, not verified completion.", enum: ["not_started", "in_progress", "blocked", "reported_done"] },
        confirmed: { type: "boolean", description: "True only after the caller confirms this exact update." },
        idempotency_key: { type: "string", description: "Unique key of at least 8 characters for this update; keep identical on retries." },
      }, required: ["task_id", "status", "confirmed", "idempotency_key"],
    },
  ];
  return definitions.map(({ name, description, properties, required }) => ({
    name, description,
    parameters: {
      type: "object",
      properties: { call_token: { type: "string", description: "Private per-call context variable. Supplied in user_data and the prompt; never ask the caller or speak it." }, ...properties },
      required: ["call_token", ...required],
      additionalProperties: false,
    },
    key: "custom_task",
    value: {
      method: "POST",
      url: `${url.origin}/api/tools/${name}`,
      api_token: `Bearer ${toolKey}`,
      headers: { "Content-Type": "application/json" },
      param: Object.fromEntries(["call_token", ...Object.keys(properties)].map((key) => [key, `%(${key})s`])),
    },
  }));
}
