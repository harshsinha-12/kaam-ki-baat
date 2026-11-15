import { it } from "node:test";
import assert from "node:assert/strict";
import { buildVoiceQualityUpdate, withVoiceQualityPolicy } from "../lib/adapters/voice-quality";

const profile = () => ({ agent_prompts: { task_1: { system_prompt: "Keep caller boundaries. Context: {{repository_context}}", metadata: 3 } }, tasks: [{
  tools_config: {
    synthesizer: { provider: "sarvam", stream: true, provider_config: { voice_id: "existing", model: "existing", language: "hi" } },
    llm_agent: { llm_config: { model: "existing-model", max_tokens: 512, api_tools: { secret: "keep-private", callback: "https://allowed.example/tools" } } },
    transcriber: { provider: "sarvam", language: "hi" }, input: { provider: "existing-carrier" },
  }, task_config: { number_of_words_for_interruption: 2, interruption_backoff_period: 100, hangup_after_LLMCall: false },
}], webhook_url: "https://allowed.example/completion" });

it("changes the observed failure settings while retaining voice, callbacks and caller/tool boundaries", () => {
  const p = profile(), original = structuredClone(p);
  const patch = buildVoiceQualityUpdate(p);
  const task = patch.agent_config.tasks[0] as typeof p.tasks[0];
  assert.deepEqual(p, original, "preparing the patch must not mutate the source profile");
  assert.deepEqual(task.tools_config.synthesizer.provider_config, p.tasks[0].tools_config.synthesizer.provider_config);
  assert.deepEqual(task.tools_config.llm_agent.llm_config.api_tools, p.tasks[0].tools_config.llm_agent.llm_config.api_tools);
  assert.deepEqual(task.tools_config.transcriber, p.tasks[0].tools_config.transcriber);
  assert.deepEqual(task.tools_config.input, p.tasks[0].tools_config.input);
  assert.equal(task.task_config.interruption_backoff_period, 100);
  assert.equal(task.task_config.hangup_after_LLMCall, false);
  // The documented provider predicate discards word_count <= threshold.
  assert.equal(1 <= task.task_config.number_of_words_for_interruption, false);
  assert.equal(task.tools_config.synthesizer.stream, false);
  assert.equal(task.tools_config.llm_agent.llm_config.max_tokens, 220);
  assert.ok(!("webhook_url" in patch.agent_config), "the narrow update must not replace completion routing");
});

it("is idempotent and retains the original prompt/context when preparing a subsequent update", () => {
  const first = buildVoiceQualityUpdate(profile());
  const second = buildVoiceQualityUpdate({ tasks: first.agent_config.tasks, agent_prompts: first.agent_prompts });
  assert.deepEqual(second, first);
  const prompt = (first.agent_prompts.task_1 as { system_prompt: string }).system_prompt;
  assert.ok(prompt.startsWith("Keep caller boundaries. Context: {{repository_context}}"));
  assert.throws(() => withVoiceQualityPolicy("[KKB_VOICE_QUALITY_V1]unfinished"), /Malformed/);
});

it("preserves other voice providers, stricter token limits and non-voice tasks", () => {
  const p = profile();
  p.tasks[0].tools_config.synthesizer.provider = "another-provider";
  p.tasks[0].tools_config.llm_agent.llm_config.max_tokens = 120;
  const auxiliary = { tools_config: {}, task_config: { retained: true } };
  const patch = buildVoiceQualityUpdate({ ...p, tasks: [...p.tasks, auxiliary] });
  const task = patch.agent_config.tasks[0] as typeof p.tasks[0];
  assert.equal(task.tools_config.synthesizer.stream, true);
  assert.equal(task.tools_config.llm_agent.llm_config.max_tokens, 120);
  assert.deepEqual(patch.agent_config.tasks[1], auxiliary);
  assert.throws(() => buildVoiceQualityUpdate({ tasks: [], agent_prompts: {} }), /Existing tasks/);
  assert.throws(() => buildVoiceQualityUpdate({ ...p, agent_prompts: {} }), /configuration object/);
});
