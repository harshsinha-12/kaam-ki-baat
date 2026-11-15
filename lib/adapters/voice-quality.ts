// A narrow, repeatable patch for an existing provider profile. No network calls.
// Callbacks, credentials, caller identity, voice/model and source scopes survive.
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected provider configuration object");
  return value as ObjectValue;
};

const START = "[KKB_VOICE_QUALITY_V1]";
const END = "[/KKB_VOICE_QUALITY_V1]";
export const VOICE_QUALITY_POLICY = `${START}
Conversation quality rules, in addition to the source-access and write-confirmation rules above:
Listen to the caller's actual request before advising. When they describe a problem, briefly reflect the specific issue, answer what is known, and ask at most one necessary clarification. Do not launch into a project overview for a clipped phrase such as "but I..."; invite them to finish. Follow their chosen Hindi, English or Hinglish naturally.

Default to one or two short spoken sentences, about 45 words or fewer, then yield. No spoken bullet lists, headings or long monologues. If asked for a detailed explanation, give one useful piece at a time and offer the next piece. Do not repeatedly ask whether they want the project overview after they have chosen a topic.

Use the conversation history to track the active problem, facts already explained, the one proposed task, questions answered and unresolved doubts. Acknowledge "haan", "yes", "okay" and "hmm" in context; continue only the next useful step. These words do not authorize a task write unless they clearly confirm the exact change just proposed. If interrupted, answer the new question first; do not restart the introduction, re-list tasks or repeat an accepted explanation unless asked.

For project answers, use the provided repository evidence or authorized tools. Prefer reviewed code facts over an older proposed design in a document; mention source freshness or uncertainty when it matters. Separate what exists from what remains. Never recommend implementing a tool or integration the supplied code already implements. When asked what to work on, propose ONE currently open, unclaimed task supported by the plan, with one concrete starting file and one acceptance criterion. A proposal is not an assignment or saved action. If ownership/status is uncertain, say so rather than assigning another contributor's work. Do not repeat the proposal after the caller accepts or changes the subject.

The caller may ask about general knowledge, programming, their difficulties or a topic outside this project. Answer helpfully without forcing the topic back to tasks. Use general knowledge for stable questions and distinguish it from project evidence. If live news, external account information, current prices or other fresh verification would be needed and no suitable tool is available, say you cannot verify it live. Do not invent a browse, account lookup or successful action.

For repository_onboarding mode, the supplied reviewedFacts and exact file passages are the evidence. The unrelated meeting tools remain excluded in that mode. Suggest GH1 only if its supplied status is still open/unclaimed; do not say the four task tools need to be built. New assignment persistence is unavailable. Outside that mode, preserve the existing authorized brief/evidence/status workflow.

A caller thinking or saying "one moment" has not ended the call. Give them room; after a presence check, listen instead of restarting a task list. End when asked, and never claim to control provider/network reliability or reconnect a disconnected call.
${END}`;

export function withVoiceQualityPolicy(prompt: string): string {
  const start = prompt.indexOf(START), end = prompt.indexOf(END);
  if ((start < 0) !== (end < 0) || (start >= 0 && end < start)) throw new Error("Malformed managed voice policy");
  const base = start < 0 ? prompt : `${prompt.slice(0, start)}${prompt.slice(end + END.length)}`;
  if (base.includes(START) || base.includes(END)) throw new Error("Duplicate managed voice policy");
  return `${base.trim()}\n\n${VOICE_QUALITY_POLICY}`;
}

export function buildVoiceQualityUpdate(profile: unknown) {
  const source = object(profile);
  if (!Array.isArray(source.tasks) || !source.tasks.length) throw new Error("Existing tasks required");
  const tasks: ObjectValue[] = structuredClone(source.tasks);
  const prompts = structuredClone(object(source.agent_prompts));
  let changed = 0;
  for (const [index, task] of tasks.entries()) {
    const tools = object(task.tools_config);
    // Extraction/other task types keep their configuration unchanged.
    if (!tools.synthesizer || !tools.llm_agent) continue;
    const synth = object(tools.synthesizer);
    const llm = object(object(tools.llm_agent).llm_config);
    const key = `task_${index + 1}`;
    const prompt = object(prompts[key]);
    if (typeof prompt.system_prompt !== "string" || !prompt.system_prompt.trim()) throw new Error("Existing system prompt required");
    prompt.system_prompt = withVoiceQualityPolicy(prompt.system_prompt);
    // In Bolna's public interruption manager, word_count <= threshold is ignored
    // during playback. Zero lets a single-word Hindi acknowledgement reach it.
    task.task_config = {
      ...object(task.task_config), number_of_words_for_interruption: 0,
      incremental_delay: 500, check_if_user_online: true,
      trigger_user_online_message_after: 12,
      check_user_online_message: "Main sun rahi hoon. Aap aaram se boliye.",
      hangup_after_silence: 30, call_terminate: 600,
    };
    llm.max_tokens = Math.min(typeof llm.max_tokens === "number" ? llm.max_tokens : 220, 220);
    // Same Sarvam voice/model; per-utterance HTTP avoids the observed idle WS
    // failure. This can add synthesis latency and needs a fresh voice replay.
    if (synth.provider === "sarvam") synth.stream = false;
    changed++;
  }
  if (!changed) throw new Error("No supported voice task found");
  return { agent_config: { tasks }, agent_prompts: prompts };
}
