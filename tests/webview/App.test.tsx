import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/webview/index';

const mockRequest = vi.fn();
const mockRefresh = vi.fn();
const mockLoadMore = vi.fn();
const mockUseCommits = vi.fn();
const mockUseCommitDetails = vi.fn();

vi.mock('../../src/webview/state/useCommits', () => ({
  useCommits: (...args: any[]) => mockUseCommits(...args)
}));

vi.mock('../../src/webview/state/useCommitDetails', () => ({
  useCommitDetails: (...args: any[]) => mockUseCommitDetails(...args)
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
  let setSelectedBranchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRequest.mockReset();
    mockRefresh.mockReset();
    mockLoadMore.mockReset();
    mockUseCommits.mockReset();
    mockUseCommitDetails.mockReset();
    setSelectedBranchSpy = vi.fn();

    mockUseCommits.mockReturnValue({
      commits: [],
      maxLanes: 1,
      branches: [{ name: 'main', remote: false, current: true }],
      loading: false,
      loadingMore: false,
      hasMore: false,
      error: '',
      hasUncommitted: false,
      selectedBranch: 'HEAD',
      setSelectedBranch: setSelectedBranchSpy,
      searchQuery: '',
      setSearchQuery: vi.fn(),
      searchScope: 'context',
      setSearchScope: vi.fn(),
      isGlobalSearchActive: false,
      globalGroups: [],
      globalLoading: false,
      globalTotalMatches: 0,
      globalScannedRepos: 0,
      refresh: mockRefresh,
      loadMore: mockLoadMore
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

    mockUseCommitDetails.mockImplementation((sha: string | null) => {
      if (!sha) return { details: null, changes: [], loading: false };
      return {
        details: {
          sha,
          parents: ['parent'],
          subject: 'Test commit',
          message: 'Test commit',
          authorName: 'Filip',
          authorEmail: 'filip@example.com',
          authorDateIso: '2026-03-11T00:00:00Z'
        },
        changes: [],
        loading: false
      };
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

  it('selects repo and resets branch filter to HEAD', async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('repo/select', { root: '/tmp/gitbit' });
    });
    expect(setSelectedBranchSpy).toHaveBeenCalledWith('HEAD');
    expect(mockRefresh).toHaveBeenCalledWith(true);
  });

  it('runs pull action through gitAction flow', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Pull/ }));

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('git/pull', {});
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('opens context menu actions and dispatches reset soft request', async () => {
    mockUseCommits.mockReturnValue({
      commits: [
        {
          sha: 'abc12345',
          parents: ['def67890'],
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
          hasChild: false
        }
      ],
      maxLanes: 1,
      branches: [{ name: 'main', remote: false, current: true }],
      loading: false,
      loadingMore: false,
      hasMore: false,
      error: '',
      hasUncommitted: false,
      selectedBranch: 'HEAD',
      setSelectedBranch: setSelectedBranchSpy,
      searchQuery: '',
      setSearchQuery: vi.fn(),
      searchScope: 'context',
      setSearchScope: vi.fn(),
      isGlobalSearchActive: false,
      globalGroups: [],
      globalLoading: false,
      globalTotalMatches: 0,
      globalScannedRepos: 0,
      refresh: mockRefresh,
      loadMore: mockLoadMore
    });

    const { container } = render(<App />);
    const row = container.querySelector('[data-sha="abc12345"]');
    expect(row).toBeTruthy();
    fireEvent.contextMenu(row!);
    fireEvent.click(screen.getByText('Reset Soft'));

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('git/reset', {
        sha: 'abc12345',
        mode: 'soft'
      });
    });
  });

  it('dispatches rename action from commit context menu', async () => {
    mockUseCommits.mockReturnValue({
      commits: [
        {
          sha: 'abc12345',
          parents: ['def67890'],
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
          hasChild: false
        }
      ],
      maxLanes: 1,
      branches: [{ name: 'main', remote: false, current: true }],
      loading: false,
      loadingMore: false,
      hasMore: false,
      error: '',
      hasUncommitted: false,
      selectedBranch: 'HEAD',
      setSelectedBranch: setSelectedBranchSpy,
      searchQuery: '',
      setSearchQuery: vi.fn(),
      searchScope: 'context',
      setSearchScope: vi.fn(),
      isGlobalSearchActive: false,
      globalGroups: [],
      globalLoading: false,
      globalTotalMatches: 0,
      globalScannedRepos: 0,
      refresh: mockRefresh,
      loadMore: mockLoadMore
    });

    const { container } = render(<App />);
    const row = container.querySelector('[data-sha="abc12345"]');
    expect(row).toBeTruthy();
    fireEvent.contextMenu(row!);
    fireEvent.click(screen.getByText('Rename'));

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('git/reword', { sha: 'abc12345' });
    });
  });

  it('opens remotes dropdown and dispatches add remote action', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'REMOTES' }));
    fireEvent.click(screen.getByRole('button', { name: /\+ Add new remote/i }));

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('git/remoteAdd', {});
    });
  });

  it('dispatches remove remote action from remotes dropdown', async () => {
    mockRequest.mockImplementation(async (type: string) => {
      if (type === 'repos/list') {
        return [
          { root: '/tmp/gitbit', label: 'gitbit', currentBranch: 'main', hasUncommittedChanges: false }
        ];
      }
      if (type === 'repo/select') return 'ok';
      if (type === 'git/remotesList') {
        return [{ name: 'origin', url: 'git@github.com:filipstrand/gitbit.git' }];
      }
      return [];
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'REMOTES' }));
    const removeButton = await screen.findByRole('button', { name: 'Remove origin' });
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('git/remoteRemove', { name: 'origin' });
    });
  });
});

