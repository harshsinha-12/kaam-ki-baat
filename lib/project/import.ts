import { createHash, randomBytes } from "node:crypto";
import type { EvidenceSnapshot, RepoFile } from "../contracts";
import { repositoryName } from "./context";

export class RepositoryImportError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export const IMPORT_LIMITS = { files: 64, fileBytes: 65536, totalBytes: 1500000, responseBytes: 6000000, directories: 8 };
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const safePath = (value: unknown): value is string => typeof value === "string" && value.length < 400 &&
  !value.startsWith("/") && !value.split("/").some(part => !part || part === "." || part === "..") && !/[\x00-\x1f\\]/.test(value);

async function bytes(response: Response, limit: number): Promise<Buffer> {
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) throw new RepositoryImportError("GitHub's public request limit was reached. Please try again later.", 429);
    if (response.status === 404) throw new RepositoryImportError("Public repository or source not found. Private repositories need a separate GitHub connection.", 404);
    throw new RepositoryImportError("GitHub could not return the repository sources. Please retry.", 502);
  }
  if (Number(response.headers.get("content-length")) > limit) throw new RepositoryImportError("Repository response exceeds the import size limit.", 413);
  const reader = response.body?.getReader();
  if (!reader) throw new RepositoryImportError("GitHub returned an empty response.", 502);
  const parts: Uint8Array[] = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new RepositoryImportError("Repository response exceeds the import size limit.", 413); }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

/** Public-only, read-only GitHub import. Repository code is never executed. */
export async function importPublicRepository(url: unknown, transport: typeof fetch = fetch): Promise<EvidenceSnapshot> {
  const repository = repositoryName(url);
  if (!repository || repository.split("/").some(part => part === "." || part === ".."))
    throw new RepositoryImportError("Enter a public GitHub repository URL, such as https://github.com/pingdotgg/t3code.");
  const encoded = repository.split("/").map(encodeURIComponent).join("/");
  const signal = AbortSignal.timeout(50000);
  const request = async (target: string, limit: number) => bytes(await transport(target, {
    // No account token: this flow must never import a private repository.
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Kaam-Ki-Baat", "X-GitHub-Api-Version": "2022-11-28" },
    redirect: "error", signal, cache: "no-store",
  }), limit);
  try {
    const metadata = JSON.parse((await request(`https://api.github.com/repos/${encoded}`, 65536)).toString());
    if (metadata.private !== false || typeof metadata.full_name !== "string" || metadata.full_name.toLowerCase() !== repository.toLowerCase() || typeof metadata.default_branch !== "string")
      throw new RepositoryImportError("Only a verified public GitHub repository can be imported.");
    // Resolve the ref without downloading a potentially enormous commit message/diff.
    const ref = JSON.parse((await request(`https://api.github.com/repos/${encoded}/git/ref/heads/${metadata.default_branch.split("/").map(encodeURIComponent).join("/")}`, 65536)).toString());
    if (ref.object?.type !== "commit" || !sha(ref.object.sha)) throw new RepositoryImportError("GitHub did not return a verifiable commit.", 502);
    const commitSha = ref.object.sha as string;
    let listingBytes = 0;
    const list = async (treeId: string, recursive: boolean) => {
      const raw = await request(`https://api.github.com/repos/${encoded}/git/trees/${treeId}${recursive ? "?recursive=1" : ""}`, IMPORT_LIMITS.responseBytes - listingBytes);
      listingBytes += raw.length;
      const tree = JSON.parse(raw.toString());
      if (tree.truncated !== false || !Array.isArray(tree.tree)) throw new RepositoryImportError("This repository is too large for a complete selected-folder listing. Please use a smaller repository.", 413);
      return tree.tree as Record<string, unknown>[];
    };
    // Skip hidden/vendor trees before recursion (large repos often vendor other repositories).
    const root = await list(commitSha, false);
    const roots = ["src", "app", "apps", "lib", "packages", "docs", "scripts", "native"];
    const directories = root.filter(entry => entry.type === "tree" && safePath(entry.path) && sha(entry.sha) &&
      !String(entry.path).startsWith(".") && !/^(?:node_modules|vendor|dist|build|assets|coverage|third-party-licenses|__snapshots__)$/.test(String(entry.path)))
      .sort((a, b) => (roots.indexOf(String(a.path)) < 0 ? 99 : roots.indexOf(String(a.path))) - (roots.indexOf(String(b.path)) < 0 ? 99 : roots.indexOf(String(b.path))) || String(a.path).localeCompare(String(b.path)))
      .slice(0, IMPORT_LIMITS.directories);
    const entries = root.filter(entry => entry.type === "blob");
    for (const directory of directories) {
      const children = await list(String(directory.sha), true);
      entries.push(...children.map(entry => ({ ...entry, path: `${directory.path}/${entry.path}` })));
    }
    const candidates = entries.filter((entry: Record<string, unknown>) => entry.type === "blob" && ["100644", "100755"].includes(String(entry.mode)) &&
      safePath(entry.path) && sha(entry.sha) && Number.isSafeInteger(entry.size) && Number(entry.size) <= IMPORT_LIMITS.fileBytes &&
      /\.(?:[cm]?[jt]sx?|md|mdx|json|py|go|rs|swift|java|kt|rb|css|html|ya?ml)$/.test(String(entry.path)) &&
      !/(^|\/)(?:node_modules|vendor|dist|build|\.[^/]+|coverage|__snapshots__)(\/|$)|(?:^|\/)(?:package-lock|pnpm-lock|yarn\.lock)|\.min\./.test(String(entry.path))) as { path: string; sha: string; size: number }[];
    const priority = (path: string) => /^readme\.md$/i.test(path) ? 0 : path === "package.json" ? 1 : /(?:^|\/)(?:architecture|context|overview|index|main|server|App)\./i.test(path) ? 2 : /\.[cm]?[jt]sx?$/.test(path) && !/test|spec|fixture/i.test(path) ? 3 : /\.md$/.test(path) ? 4 : 5;
    candidates.sort((a, b) => priority(a.path) - priority(b.path) || a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
    let selectedBytes = 0;
    const selected: typeof candidates = [];
    for (const entry of candidates) {
      if (selected.length >= IMPORT_LIMITS.files) break;
      if (selectedBytes + entry.size > IMPORT_LIMITS.totalBytes) continue;
      selectedBytes += entry.size; selected.push(entry);
    }
    if (!selected.length) throw new RepositoryImportError("No supported text source files were found in this repository.");
    const files: RepoFile[] = [];
    // Raw commit URLs avoid one GitHub API request per selected source file.
    for (let i = 0; i < selected.length; i += 6) {
      files.push(...await Promise.all(selected.slice(i, i + 6).map(async entry => {
        const body = await request(`https://raw.githubusercontent.com/${encoded}/${commitSha}/${entry.path.split("/").map(encodeURIComponent).join("/")}`, IMPORT_LIMITS.fileBytes);
        const hash = createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
        if (body.length !== entry.size || hash !== entry.sha || body.includes(0)) throw new RepositoryImportError("Repository source verification failed. No workspace was changed.", 502);
        return { path: entry.path, content: new TextDecoder("utf-8", { fatal: true }).decode(body) };
      })));
    }
    return { label: "LIVE", repository: metadata.full_name, pinnedSha: commitSha, fetchedAt: new Date().toISOString(),
      note: `Public GitHub source import: ${files.length} selected files from ${candidates.length} eligible files in the listed folders; maximum ${IMPORT_LIMITS.directories} top-level folders, ${IMPORT_LIMITS.files} files, 64 KiB per file and 1.5 MB total. Hidden/vendor folders are excluded. This is a selected-source index, not the entire repository. No meeting, task, PR or CI verification is included.`,
      files, participants: [{ id: `repo_${randomBytes(12).toString("hex")}`, name: "Repository visitor", role: "member", repoAccess: true, meetingIds: [], taskIds: [] }],
      meetings: [], passages: [], tasks: [], pullRequests: [], checks: [] };
  } catch (error) {
    if (error instanceof RepositoryImportError) throw error;
    throw new RepositoryImportError("Public repository import could not finish. Please retry; the existing workspace was preserved.", 502);
  }
}
