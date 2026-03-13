import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SquashPreview } from '../../../src/webview/components/SquashPreview';

declare global {
  interface Window {
    iconsUri: string;
  }
}

const mockRequest = vi.fn();
const postMessage = vi.fn();

vi.mock('../../../src/webview/state/vscode', () => ({
  request: (...args: any[]) => mockRequest(...args),
  vscode: {
    postMessage: (...args: any[]) => postMessage(...args)
  }
}));

describe('SquashPreview', () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.iconsUri = '/icons';
    mockRequest.mockReset();
    postMessage.mockReset();
    mockRequest.mockResolvedValue([
      { path: 'src/a.ts', status: 'M' },
      { path: 'src/nested/b.ts', status: 'A' }
    ]);
  });

  it('requests combined changes with empty-tree base when oldest commit is root', async () => {
    render(
      <SquashPreview
        shas={['B', 'A']}
        commits={[
          { sha: 'B', parents: ['A'] },
          { sha: 'A', parents: [] }
        ]}
      />
    );

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('range/changes', {
        base: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
        target: 'B'
      });
    });
  });

  it('posts squash request for selected non-uncommitted shas', async () => {
    render(
      <SquashPreview
        shas={['C', 'B', 'UNCOMMITTED']}
        commits={[
          { sha: 'C', parents: ['B'] },
          { sha: 'B', parents: ['A'] },
          { sha: 'UNCOMMITTED', parents: ['C'] },
          { sha: 'A', parents: [] }
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Squash/ }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'git/squash',
      payload: { shas: ['C', 'B'] }
    }));
  });

  it('toggles collapse-all button label based on folder state', async () => {
    render(
      <SquashPreview
        shas={['B', 'A']}
        commits={[
          { sha: 'B', parents: ['A'] },
          { sha: 'A', parents: [] }
        ]}
      />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.getByRole('button', { name: 'Expand' })).toBeTruthy();
  });

  it('refreshes preview silently after repoChanged debounce', async () => {
    render(
      <SquashPreview
        shas={['B', 'A']}
        commits={[
          { sha: 'B', parents: ['A'] },
          { sha: 'A', parents: [] }
        ]}
      />
    );
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'event/repoChanged' } }));
    });
    await new Promise(resolve => setTimeout(resolve, 300));

    expect(mockRequest).toHaveBeenCalledTimes(2);
  });
});
