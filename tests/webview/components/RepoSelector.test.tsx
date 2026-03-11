import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RepoSelector } from '../../../src/webview/components/RepoSelector';
import { RepoInfo } from '../../../src/extension/protocol/types';

describe('RepoSelector', () => {
  const repos: RepoInfo[] = [
    { root: '/tmp/gitbit', label: 'gitbit', currentBranch: 'main', hasUncommittedChanges: false },
    { root: '/tmp/play', label: 'gitbit-playground', currentBranch: 'feature/x', hasUncommittedChanges: true }
  ];

  it('renders static label when only one repo exists', () => {
    render(
      <RepoSelector
        repos={[repos[0]]}
        selectedRoot={repos[0].root}
        onSelect={() => {}}
      />
    );

    expect(screen.getByText('gitbit')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search repos...')).not.toBeInTheDocument();
  });

  it('allows searching and selecting from multiple repos', () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    render(
      <RepoSelector
        repos={repos}
        selectedRoot={repos[0].root}
        onSelect={onSelect}
        onOpen={onOpen}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'gitbit' }));
    expect(onOpen).toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Search repos...'), {
      target: { value: 'feature/x' }
    });
    fireEvent.click(screen.getByText('gitbit-playground'));

    expect(onSelect).toHaveBeenCalledWith('/tmp/play');
  });
});

