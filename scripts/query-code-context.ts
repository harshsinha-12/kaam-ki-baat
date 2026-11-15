// Developer KT helper. Reuses Code Scout, so results match the phone runtime.
// It reads a local snapshot, not Wispr or any provider, and emits no passages.
import { loadSnapshot } from "../lib/evidence/load";
import { codeScout } from "../lib/specialists/code-scout";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
};
const snapshotPath = arg("snapshot");
if (snapshotPath) process.env.KKB_SNAPSHOT = snapshotPath;
const graph = arg("graph");
if (graph) process.env.KKB_CODE_GRAPH = graph;
const snapshot = loadSnapshot();
const taskId = arg("task");
const task = snapshot.tasks.find((t) => t.id === taskId);
if (taskId && !task) throw new Error("Task not found in the selected snapshot");
const findings = codeScout(snapshot, task, arg("question") ?? "", 5);
console.log(JSON.stringify({ label: snapshot.label, repository: snapshot.repository, sha: snapshot.pinnedSha, taskId: task?.id, findings }, null, 2));
