import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Graph } from '../../../src/webview/components/Graph';
import { GraphCommit } from '../../../src/webview/state/GraphLayout';

function graphCommit(overrides: Partial<GraphCommit> = {}): GraphCommit {
  return {
    sha: 'abc123',
    parents: [],
    authorName: 'Test',
    authorEmail: 'test@example.com',
    authorDateIso: '2026-01-01T00:00:00Z',
    subject: 'commit',
    decorations: '',
    refs: [],
    lane: 0,
    colorLane: 0,
    connections: [],
    activeLanes: [],
    hasChild: false,
    ...overrides
  };
}

describe('Graph', () => {
  it('renders bezier path for cross-lane connection', () => {
    const commit = graphCommit({
      connections: [{ fromLane: 0, toLane: 2, type: 'merge', toSha: 'p1', colorLane: 2 }]
    });
    const { container } = render(<Graph commit={commit} />);

    expect(container.querySelector('path')).toBeTruthy();
  });

  it('renders uncommitted node as hollow dot', () => {
    const commit = graphCommit({ sha: 'UNCOMMITTED' });
    const { container } = render(<Graph commit={commit} />);
    const circles = container.querySelectorAll('circle');

    expect(circles.length).toBe(2);
  });

  it('renders incoming child line when hasChild is true', () => {
    const commit = graphCommit({ hasChild: true });
    const { container } = render(<Graph commit={commit} />);
    const lines = container.querySelectorAll('line');

    // One line from child plus any other straight connections (none here).
    expect(lines.length).toBe(1);
  });
});
