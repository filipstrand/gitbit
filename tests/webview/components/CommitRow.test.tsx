import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CommitRow } from '../../../src/webview/components/CommitRow';
import { GraphCommit } from '../../../src/webview/state/GraphLayout';

const { postMessage } = vi.hoisted(() => ({ postMessage: vi.fn() }));
vi.mock('../../../src/webview/state/vscode', () => ({
  vscode: {
    postMessage
  }
}));

function commit(overrides: Partial<GraphCommit> = {}): GraphCommit {
  return {
    sha: 'abc12345',
    parents: ['parent'],
    authorName: 'Filip',
    authorEmail: 'filip@example.com',
    authorDateIso: '2026-03-11T00:00:00Z',
    subject: 'Test commit',
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

describe('CommitRow', () => {
  it('calls onSelect with modifier flags when row is clicked', () => {
    const onSelect = vi.fn();
    render(
      <CommitRow
        commit={commit()}
        isSelected={false}
        onSelect={onSelect}
        onContextMenu={() => {}}
      />
    );

    fireEvent.click(screen.getByText('Test commit'), { ctrlKey: true, shiftKey: true });
    expect(onSelect).toHaveBeenCalledWith('abc12345', true, true);
  });

  it('posts copy-to-clipboard message when sha cell is clicked', () => {
    postMessage.mockReset();
    render(
      <CommitRow
        commit={commit()}
        isSelected={false}
        onSelect={() => {}}
        onContextMenu={() => {}}
      />
    );

    fireEvent.click(screen.getByText('abc12345'));
    expect(postMessage).toHaveBeenCalledWith({
      type: 'app/copyToClipboard',
      payload: { text: 'abc12345' }
    });
  });

  it('invokes context menu callback with pointer coordinates', () => {
    const onContextMenu = vi.fn();
    const { container } = render(
      <CommitRow
        commit={commit()}
        isSelected={false}
        onSelect={() => {}}
        onContextMenu={onContextMenu}
      />
    );

    fireEvent.contextMenu(container.querySelector('.commit-row')!, { clientX: 25, clientY: 30 });
    expect(onContextMenu).toHaveBeenCalledWith('abc12345', 25, 30);
  });

  it('renders discard action for uncommitted row and triggers callback', () => {
    const onDiscardAllUncommitted = vi.fn();
    render(
      <CommitRow
        commit={commit({ sha: 'UNCOMMITTED', parents: [] })}
        isSelected={false}
        onSelect={() => {}}
        onContextMenu={() => {}}
        onDiscardAllUncommitted={onDiscardAllUncommitted}
      />
    );

    fireEvent.click(screen.getByTitle('Discard all uncommitted changes'));
    expect(onDiscardAllUncommitted).toHaveBeenCalled();
  });

  it('renders selected action icon and triggers callback', () => {
    const onSelectedAction = vi.fn();
    render(
      <CommitRow
        commit={commit()}
        isSelected
        onSelect={() => {}}
        onContextMenu={() => {}}
        onSelectedAction={{
          iconClassName: 'codicon-arrow-left',
          title: 'Open this commit in repo context',
          onClick: onSelectedAction
        }}
      />
    );

    fireEvent.click(screen.getByTitle('Open this commit in repo context'));
    expect(onSelectedAction).toHaveBeenCalled();
  });

  it('renders local-only tag with muted class', () => {
    const { container } = render(
      <CommitRow
        commit={commit({
          refs: [{ name: 'v2.0.0', type: 'tag' }]
        })}
        remoteTagNameSet={new Set(['v1.0.0'])}
        isSelected={false}
        onSelect={() => {}}
        onContextMenu={() => {}}
      />
    );

    const tag = container.querySelector('.ref-badge.ref-tag');
    expect(tag).toBeTruthy();
    expect(tag?.classList.contains('ref-tag-local')).toBe(true);
  });
});
