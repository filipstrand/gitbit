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
});

