/** Presentation only: retain the index's direction and never invent a link. */
export interface ViewNode { id: string; kind: string; label: string; path: string; line: number; community?: number; degree?: number }
export interface ViewGraph { nodes: ViewNode[]; edges: { from: string; to: string; kind: string }[]; godNodes: string[]; sha: string; repository: string }
export interface Neighbor { node: ViewNode; kinds: string[] }

export function graphNeighborhood(graph: ViewGraph, focusId: string, highlights: string[] = []) {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const incoming = new Map<string, Neighbor>(), outgoing = new Map<string, Neighbor>();
  for (const edge of graph.edges) {
    if (edge.from === edge.to) continue;
    const direction = edge.to === focusId ? incoming : edge.from === focusId ? outgoing : null;
    const id = edge.to === focusId ? edge.from : edge.to;
    const node = byId.get(id);
    if (!direction || !node) continue;
    const entry = direction.get(id) ?? { node, kinds: [] };
    if (!entry.kinds.includes(edge.kind)) entry.kinds.push(edge.kind);
    direction.set(id, entry);
  }
  const selected = new Set(highlights);
  const rank = (a: Neighbor, b: Neighbor) => Number(selected.has(b.node.id)) - Number(selected.has(a.node.id)) ||
    Number(b.node.kind === 'test') - Number(a.node.kind === 'test') || (b.node.degree ?? 0) - (a.node.degree ?? 0) || a.node.id.localeCompare(b.node.id);
  return { incoming: [...incoming.values()].sort(rank), outgoing: [...outgoing.values()].sort(rank) };
}

export function initialGraphFocus(graph: ViewGraph, highlights: string[]) {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  return highlights.map(id => byId.get(id)).find(Boolean) ?? graph.godNodes.map(id => byId.get(id)).find(Boolean) ?? graph.nodes[0];
}

export function edgeLabel(kind: string) {
  return ({ defines: 'defines', imports: 'imports', uses: 'uses', tests: 'test link' } as Record<string, string>)[kind] ?? kind;
}
