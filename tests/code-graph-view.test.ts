import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { graphNeighborhood, initialGraphFocus, type ViewGraph, type ViewNode } from '../lib/codegraph/view';

const node = (id: string, kind = 'file'): ViewNode => ({ id, kind, label: id, path: `lib/${id}.ts`, line: 1 });
const graph: ViewGraph = {
  repository: 'owner/repo', sha: 'abc1234', godNodes: ['missing', 'target'],
  nodes: [node('target'), node('caller'), node('symbol', 'function'), node('test', 'test'), node('unrelated')],
  edges: [
    { from: 'caller', to: 'target', kind: 'imports' },
    { from: 'test', to: 'target', kind: 'tests' },
    { from: 'target', to: 'symbol', kind: 'defines' },
    { from: 'caller', to: 'target', kind: 'uses' },
    { from: 'caller', to: 'target', kind: 'uses' },
    { from: 'target', to: 'missing', kind: 'imports' },
    { from: 'unrelated', to: 'caller', kind: 'imports' },
    { from: 'target', to: 'target', kind: 'uses' },
  ],
};

describe('readable graph neighborhood', () => {
  it('retains actual direction, combines link kinds, and excludes unrelated, dangling and self links', () => {
    const result = graphNeighborhood(graph, 'target');
    assert.deepEqual(result.incoming.map(n => n.node.id), ['test', 'caller']);
    assert.deepEqual(result.incoming.find(n => n.node.id === 'caller')?.kinds, ['imports', 'uses']);
    assert.deepEqual(result.outgoing.map(n => n.node.id), ['symbol']);
    assert.deepEqual(graphNeighborhood(graph, 'unrelated').incoming, []);
    assert.deepEqual(graphNeighborhood(graph, 'missing-id'), { incoming: [], outgoing: [] });
  });
  it('keeps highlighted neighbors first without losing other indexed connections', () => {
    const dense = { ...graph, nodes: [...graph.nodes, ...Array.from({ length: 60 }, (_, i) => node(`extra${i}`))], edges: [...graph.edges, ...Array.from({ length: 60 }, (_, i) => ({ from: `extra${i}`, to: 'target', kind: 'imports' }))] };
    const result = graphNeighborhood(dense, 'target', ['extra59']);
    assert.equal(result.incoming[0].node.id, 'extra59');
    assert.equal(result.incoming.length, 62);
    assert.deepEqual(result, graphNeighborhood(dense, 'target', ['extra59']));
  });
  it('selects valid answer nodes, then a connected entry, and handles empty and file-only graphs', () => {
    assert.equal(initialGraphFocus(graph, ['stale', 'symbol'])?.id, 'symbol');
    assert.equal(initialGraphFocus(graph, [])?.id, 'target');
    assert.equal(initialGraphFocus({ ...graph, godNodes: [], nodes: [node('README')] }, [])?.id, 'README');
    assert.equal(initialGraphFocus({ ...graph, nodes: [] }, []), undefined);
  });
});
