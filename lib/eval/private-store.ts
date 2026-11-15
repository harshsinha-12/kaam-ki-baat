import { link, lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { canonical, digest } from "./private";

/** Atomic, immutable publish. A crash before link cannot expose a partial run. */
export async function savePrivateEvaluation(directory: string, payload: unknown) {
  const runId = digest(payload);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const dirStat = await lstat(directory);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink() || (dirStat.mode & 0o077)) throw new Error("Private directory required");
  const file = path.join(directory, `eval-${runId}.json`);
  const temporary = path.join(directory, `.pending-${randomUUID()}`);
  const record = { runId, createdAt: new Date().toISOString(), payload };
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(record, null, 2) + "\n"); await handle.sync(); }
  finally { await handle.close(); }
  let replayed = false;
  try {
    try { await link(temporary, file); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; replayed = true; }
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error("Private immutable file required");
    const persisted = JSON.parse(await readFile(file, "utf8"));
    if (persisted.runId !== runId || digest(persisted.payload) !== runId || canonical(persisted.payload) !== canonical(payload))
      throw new Error("Evaluation read-back mismatch");
    const dir = await open(directory, "r");
    try { await dir.sync(); } finally { await dir.close(); }
    return { runId, file, replayed };
  } finally { await unlink(temporary); }
}
