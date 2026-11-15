// An explicitly checked code-graph revision is distinct from the deployed application revision.
// Do not silently describe a historical demo graph as a map of current HEAD.
export type GraphFreshness = "current" | "stale" | "unverified";

export function graphFreshness(graphSha: string, deployedSha?: string | null): GraphFreshness {
  if (!deployedSha || !/^[0-9a-f]{40}$/i.test(deployedSha)) return "unverified";
  return graphSha.toLowerCase() === deployedSha.toLowerCase() ? "current" : "stale";
}
