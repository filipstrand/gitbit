import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/webview/index';

const mockRequest = vi.fn();
const mockRefresh = vi.fn();
const mockUseCommits = vi.fn();

vi.mock('../../src/webview/state/useCommits', () => ({
  useCommits: (...args: any[]) => mockUseCommits(...args)
}));

vi.mock('../../src/webview/state/vscode', () => ({
  request: (...args: any[]) => mockRequest(...args),
  vscode: {
    postMessage: vi.fn(),
    getState: () => ({}),
    setState: vi.fn()
  }
}));

describe('App', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockRefresh.mockReset();
    mockUseCommits.mockReset();

    mockUseCommits.mockReturnValue({
      commits: [],
      maxLanes: 1,
      branches: [{ name: 'main', remote: false, current: true }],
      loading: false,
      error: '',
      hasUncommitted: false,
      selectedBranch: 'HEAD',
      setSelectedBranch: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      refresh: mockRefresh
    });

    mockRequest.mockImplementation(async (type: string, payload?: any) => {
      if (type === 'repos/list') {
        return [
          { root: '/tmp/gitbit', label: 'gitbit', currentBranch: 'main', hasUncommittedChanges: false },
          { root: '/tmp/play', label: 'gitbit-playground', currentBranch: 'main', hasUncommittedChanges: false }
        ];
      }
      if (type === 'repo/select') return 'ok';
      if (type === 'git/fetch') return 'ok';
      return [];
    });
  });

  it('forces repo list refresh after fetch action', async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('repos/list', { force: false });
    });

    fireEvent.click(screen.getByRole('button', { name: /Fetch/ }));

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('git/fetch', {});
      expect(mockRequest).toHaveBeenCalledWith('repos/list', { force: true });
    });
  });
});

