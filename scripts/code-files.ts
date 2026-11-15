// Code files straight from the local git object store at an exact ref. Only
// repository code (lib, app, scripts, tests) — never meeting data — so it is safe
// for the public graph examples. Used by `graph -- --demo --code-ref <ref>`.
import { execFileSync } from "node:child_process";

export function codeFilesAt(ref: string, paths = ["lib", "app", "scripts", "tests"]) {
  const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const sha = git("rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`).trim();
  const files = git("ls-tree", "-r", "--name-only", sha, "--", ...paths)
    .split("\n").filter((p) => /\.(ts|tsx|js|mjs)$/.test(p))
    .map((p) => ({ path: p, content: git("show", `${sha}:${p}`) }));
  return { sha, files };
}

export function codeRefArg(argv = process.argv): string | undefined {
  const i = argv.indexOf("--code-ref");
  return i >= 0 ? argv[i + 1] : undefined;
}
