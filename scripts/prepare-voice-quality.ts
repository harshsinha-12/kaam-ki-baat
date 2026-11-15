// Local preparation only; never applies changes or starts a call.
import { readFile, mkdir, open } from "node:fs/promises";
import path from "node:path";
import { buildVoiceQualityUpdate } from "../lib/adapters/voice-quality";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
async function main() {
  const input = arg("input"), output = arg("out") ?? "data/private/voice-quality-update.json";
  if (!input) throw new Error("Private provider read-back input required");
  const privateRoot = path.resolve("data/private");
  const target = path.resolve(output);
  if (!target.startsWith(`${privateRoot}${path.sep}`)) throw new Error("Output must remain in data/private");
  const update = buildVoiceQualityUpdate(JSON.parse(await readFile(input, "utf8")));
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const handle = await open(target, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(update, null, 2)); await handle.sync(); }
  finally { await handle.close(); }
  console.log("Prepared private voice-quality patch. No agent changed and no call placed.");
}
main().catch(() => { console.error("Voice-quality preparation failed; check input, private output and existing files."); process.exitCode = 1; });
