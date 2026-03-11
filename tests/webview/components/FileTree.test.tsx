import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FileTree } from '../../../src/webview/components/FileTree';
import { Change } from '../../../src/extension/protocol/types';

declare global {
  interface Window {
    iconsUri: string;
  }
}

describe('FileTree', () => {
  const change: Change = {
    path: 'pipelines/fibo_fast/examples/simple.py',
    status: '?'
  };

  it('renders untracked file name and status badge', () => {
    window.iconsUri = '/icons';
    render(
      <FileTree
        changes={[change]}
        onFileClick={() => {}}
      />
    );

    expect(screen.getByText('simple.py')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('opens file when file row is clicked', () => {
    window.iconsUri = '/icons';
    const onFileClick = vi.fn();
    render(
      <FileTree
        changes={[change]}
        onFileClick={onFileClick}
      />
    );

    fireEvent.click(screen.getByText('simple.py'));
    expect(onFileClick).toHaveBeenCalledWith(change);
  });

  it('toggles file checkbox selection in selectable mode', () => {
    window.iconsUri = '/icons';
    const onToggleSelect = vi.fn();
    render(
      <FileTree
        changes={[change]}
        onFileClick={() => {}}
        selectable
        selectedPaths={new Set()}
        onToggleSelect={onToggleSelect}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onToggleSelect).toHaveBeenCalledWith(change.path, true);
  });

  it('collapses folder nodes when clicked', () => {
    window.iconsUri = '/icons';
    const { container } = render(
      <FileTree
        changes={[change]}
        onFileClick={() => {}}
      />
    );

    expect(screen.getByText('simple.py')).toBeInTheDocument();
    const folderRow = container.querySelector('.tree-node .file-item');
    expect(folderRow).toBeTruthy();
    fireEvent.click(folderRow!);
    expect(screen.queryByText('simple.py')).not.toBeInTheDocument();
  });

  it('discards the current multi-selection when clicking discard on a selected file', () => {
    window.iconsUri = '/icons';
    const onDiscard = vi.fn();
    const changes: Change[] = [
      { path: 'a.txt', status: 'M' },
      { path: 'b.txt', status: 'M' }
    ];
    render(
      <FileTree
        changes={changes}
        onFileClick={() => {}}
        onDiscard={onDiscard}
        selectable
        selectedPaths={new Set(['a.txt', 'b.txt'])}
      />
    );

    const discardIcons = screen.getAllByTitle('Discard changes');
    fireEvent.click(discardIcons[0]);
    expect(onDiscard).toHaveBeenCalledWith(['a.txt', 'b.txt']);
  });
});

