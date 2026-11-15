// Local preparation only. Never creates an agent or starts a telephone call.
import { mkdir, writeFile } from "node:fs/promises";
import { buildBolnaTools } from "../lib/adapters/bolna";

const tools = buildBolnaTools(process.env.KKB_PUBLIC_URL ?? "", process.env.KKB_TOOL_KEY ?? "");
await mkdir("data/private", { recursive: true });
await writeFile("data/private/bolna-tools.json", JSON.stringify(tools, null, 2), { mode: 0o600 });
console.log("Prepared four Bolna custom functions in ignored data/private/bolna-tools.json; no agent changed.");
