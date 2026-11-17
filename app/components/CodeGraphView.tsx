"use client";
import { useMemo, useState } from "react";
import { edgeLabel, graphNeighborhood, initialGraphFocus, type ViewGraph, type ViewNode, type Neighbor } from "@/lib/codegraph/view";
import s from "./code-graph.module.css";
export type { ViewGraph, ViewNode } from "@/lib/codegraph/view";

/** A stable one-hop map. Every card remains a real node in the scoped index. */
export function CodeGraphView({ graph, highlight = [], height = 460, onPick }: { graph: ViewGraph; highlight?: string[]; height?: number; onPick?: (n: ViewNode) => void }) {
  // Reset local exploration when a new answer or repository arrives.
  const scope = `${graph.repository}@${graph.sha}:${JSON.stringify(highlight)}`;
  return <FocusedGraph key={scope} graph={graph} highlight={highlight} height={height} onPick={onPick} />;
}

function FocusedGraph({ graph, highlight, height, onPick }: { graph: ViewGraph; highlight: string[]; height: number; onPick?: (n: ViewNode) => void }) {
  const [focusId, setFocusId] = useState(() => initialGraphFocus(graph, highlight)?.id);
  const [query, setQuery] = useState("");
  const focus = graph.nodes.find(node => node.id === focusId);
  const related = useMemo(() => graphNeighborhood(graph, focusId ?? "", highlight), [graph, focusId, highlight]);
  const selected = new Set(highlight);
  const matches = graph.nodes.filter(node => selected.has(node.id));
  const browse = graph.nodes.filter(node => `${node.label} ${node.path}`.toLowerCase().includes(query.trim().toLowerCase()));
  const explore = (node: ViewNode) => setFocusId(node.id);
  const card = (node: ViewNode, kinds?: string[]) => <>
    <span className={s.cardMeta}><span data-kind={node.kind}>{node.kind}</span>{selected.has(node.id) && <em>Result</em>}</span>
    <strong>{node.label}{node.kind === "function" ? "()" : ""}</strong>
    <code>{node.path}:{node.line}</code>
    {kinds && <span className={s.relation}>{kinds.map(edgeLabel).join(" · ")}</span>}
  </>;
  const lane = (direction: "incoming" | "outgoing", title: string, subtitle: string, nodes: Neighbor[]) => <section className={s.lane} data-direction={direction} aria-label={title}>
    <h4>{title} <span>{nodes.length}</span></h4><p>{subtitle}</p>
    <ul className={s.connections}>{nodes.map(({ node, kinds }) => <li key={node.id}>
      <button type="button" className={s.node} data-match={selected.has(node.id)} onClick={() => explore(node)} aria-label={`Explore ${node.label} in ${node.path}`}>{card(node, kinds)}</button>
    </li>)}</ul>
    {!nodes.length && <div className={s.empty}>No {direction} links in this index.</div>}
  </section>;

  return <div className={s.graph} aria-label={`Code graph of ${graph.repository} at ${graph.sha.slice(0, 7)}`}>
    <header className={s.header}><div><span className={s.eyebrow}>Code connections</span><h3>One file. A clear path.</h3></div><span className={s.commit}>@ {graph.sha.slice(0, 7)}</span></header>
    <p className={s.intro}>Explore a card to follow its links. Open the selected source to check the code.</p>
    {matches.length > 0 && <div className={s.matches} aria-label="Search result nodes"><span>Results</span>{matches.map(node => <button type="button" key={node.id} aria-pressed={focusId === node.id} onClick={() => explore(node)} title={`${node.path}:${node.line}`}>{node.label}</button>)}</div>}
    {focus ? <div className={s.map} style={{ minHeight: Math.max(220, height - 140) }}>
      {lane("incoming", "Links into this", "Other code → selected node", related.incoming)}
      <section className={s.center} data-incoming={related.incoming.length > 0} data-outgoing={related.outgoing.length > 0} aria-label="Selected node"><span className={s.focusLabel}>Selected node</span><div className={s.focusCard}>{card(focus)}
        {onPick && <button type="button" className={s.open} onClick={() => onPick(focus)}>Open source <span aria-hidden="true">↗</span></button>}
      </div></section>
      {lane("outgoing", "Links from this", "Selected node → other code", related.outgoing)}
    </div> : <p className={s.empty}>No code nodes are available in this snapshot.</p>}
    <footer className={s.footer}><span>{graph.nodes.length} indexed nodes · {graph.edges.length} links</span><span>Static links are hints; test execution is unverified.</span></footer>
    <section className={s.browse} aria-label="All indexed files and symbols"><h4>Files &amp; symbols</h4>
      <label className={s.filter}>Filter by name or path<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. persist or lib/store" /></label>
      <p className={s.count}>{browse.length} nodes found</p>
      <ul className={s.browseList}>{browse.map(node => <li key={node.id}><button type="button" aria-pressed={focusId === node.id} onClick={() => explore(node)}><strong>{node.label}</strong><code>{node.path}:{node.line}</code></button></li>)}</ul>
      {!browse.length && <p className={s.empty}>No matching files or symbols.</p>}
    </section>
  </div>;
}
