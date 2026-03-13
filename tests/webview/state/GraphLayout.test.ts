import { describe, expect, it } from 'vitest';
import { GraphLayout } from '../../../src/webview/state/GraphLayout';
import { Commit } from '../../../src/extension/protocol/types';

function c(sha: string, parents: string[], refs: any[] = []): Commit {
  return {
    sha,
    parents,
    authorName: 'Test',
    authorEmail: 'test@example.com',
    authorDateIso: '2026-01-01T00:00:00Z',
    subject: sha,
    decorations: '',
    refs
  };
}

describe('GraphLayout', () => {
  it('computes a single-lane linear history', () => {
    const commits = [c('C', ['B']), c('B', ['A']), c('A', [])];
    const graph = GraphLayout.compute(commits);

    expect(graph).toHaveLength(3);
    expect(graph.map(g => g.lane)).toEqual([0, 0, 0]);
    expect(graph[0].connections).toEqual([
      { fromLane: 0, toLane: 0, type: 'line', toSha: 'B', colorLane: graph[0].colorLane }
    ]);
  });

  it('creates merge connections for secondary parents', () => {
    const commits = [
      c('M', ['A', 'B'], [{ name: 'main', type: 'head' }]),
      c('A', ['P']),
      c('B', ['P']),
      c('P', [])
    ];
    const graph = GraphLayout.compute(commits);
    const mergeCommit = graph[0];

    expect(mergeCommit.connections).toHaveLength(2);
    expect(mergeCommit.connections[0].type).toBe('line');
    expect(mergeCommit.connections[1].type).toBe('merge');
    expect(mergeCommit.connections[1].toSha).toBe('B');
  });

  it('returns lane colors cyclically', () => {
    expect(GraphLayout.getLaneColor(0)).toBe(GraphLayout.getLaneColor(10));
    expect(GraphLayout.getLaneColor(1)).toBe(GraphLayout.getLaneColor(11));
  });
});
