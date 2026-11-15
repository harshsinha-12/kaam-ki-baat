// Local preparation only. Never creates an agent or starts a telephone call.
import { mkdir, writeFile } from "node:fs/promises";
import { buildBolnaTools } from "../lib/adapters/bolna";
import { buildSpatialBolnaTools } from "../lib/spatial/bolna-config";

const tools = buildBolnaTools(process.env.KKB_PUBLIC_URL ?? "", process.env.KKB_TOOL_KEY ?? "");
if (process.argv.includes("--spatial")) tools.push(...buildSpatialBolnaTools(process.env.KKB_PUBLIC_URL ?? "", process.env.KKB_TOOL_KEY ?? ""));
await mkdir("data/private", { recursive: true });
await writeFile("data/private/bolna-tools.json", JSON.stringify(tools, null, 2), { mode: 0o600 });
console.log(`Prepared ${tools.length} Bolna custom functions in ignored data/private/bolna-tools.json; no agent changed.`);
