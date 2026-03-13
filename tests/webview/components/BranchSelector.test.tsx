import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BranchSelector } from '../../../src/webview/components/BranchSelector';
import { Branch } from '../../../src/extension/protocol/types';

describe('BranchSelector', () => {
  const branches: Branch[] = [
    { name: 'main', remote: false, current: true },
    { name: 'feature/refactor', remote: false, current: false },
    { name: 'origin/main', remote: true, current: false }
  ];

  it('shows HEAD with current branch label and supports branch selection', () => {
    const onSelect = vi.fn();
    render(
      <BranchSelector
        branches={branches}
        selectedBranch="HEAD"
        onSelect={onSelect}
      />
    );

    expect(screen.getByText('HEAD (main)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('HEAD (main)'));
    fireEvent.click(screen.getByText('feature/refactor'));
    expect(onSelect).toHaveBeenCalledWith('feature/refactor');
  });

  it('filters by search query and shows empty state', () => {
    render(
      <BranchSelector
        branches={branches}
        selectedBranch="main"
        onSelect={() => {}}
      />
    );

    fireEvent.click(screen.getByText('main'));
    fireEvent.change(screen.getByPlaceholderText('Search branches...'), {
      target: { value: 'does-not-exist' }
    });
    expect(screen.getByText('No branches found')).toBeInTheDocument();
  });

  it('uses hover actions in action mode instead of direct select', () => {
    const onSelect = vi.fn();
    const onHoverAction = vi.fn();
    render(
      <BranchSelector
        branches={branches}
        selectedBranch="main"
        onSelect={onSelect}
        enableHoverActions
        onHoverAction={onHoverAction}
      />
    );

    fireEvent.click(screen.getByText('main'));
    fireEvent.mouseEnter(screen.getByText('feature/refactor'));
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onHoverAction).toHaveBeenCalledWith(
      'checkout',
      expect.objectContaining({ name: 'feature/refactor', remote: false })
    );
  });

  it('disables rename action for remote branches in hover menu', () => {
    const onHoverAction = vi.fn();
    render(
      <BranchSelector
        branches={branches}
        selectedBranch="main"
        onSelect={() => {}}
        enableHoverActions
        onHoverAction={onHoverAction}
      />
    );

    fireEvent.click(screen.getByText('main'));
    fireEvent.mouseEnter(screen.getByText('origin/main'));
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
  });

  it('lets users star a branch and move it to Important', () => {
    render(
      <BranchSelector
        branches={branches}
        selectedBranch="main"
        onSelect={() => {}}
      />
    );

    fireEvent.click(screen.getByText('main'));
    expect(screen.getByText('Local Branches')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Star feature/refactor'));

    expect(screen.getByLabelText('Unstar feature/refactor')).toBeInTheDocument();
    expect(screen.queryByText('Local Branches')).not.toBeInTheDocument();
  });
});

