import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommits } from '../../../src/webview/state/useCommits';

const mockRequest = vi.fn();
vi.mock('../../../src/webview/state/vscode', () => ({
  request: (...args: any[]) => mockRequest(...args)
}));

describe('useCommits', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (type: string, payload?: any) => {
      if (type === 'branches/list') {
        return [{ name: 'main', remote: false, current: true }];
      }
      if (type === 'tags/remoteList') {
        return ['v1.0.0'];
      }
      if (type === 'commits/list') {
        return [
          {
            sha: payload?.branch === 'feature' ? 'feat1' : 'main1',
            parents: [],
            authorName: 'Filip',
            authorEmail: 'filip@example.com',
            authorDateIso: '2026-03-12T00:00:00Z',
            subject: 'Initial',
            decorations: '',
            refs: []
          }
        ];
      }
      return [];
    });
  });

  it('loads branches and commits on mount', async () => {
    const { result } = renderHook(() => useCommits());

    await waitFor(() => {
      expect(result.current.branches).toHaveLength(1);
      expect(result.current.commits).toHaveLength(1);
    });

    expect(mockRequest).toHaveBeenCalledWith('branches/list');
    expect(mockRequest).toHaveBeenCalledWith('commits/list', { limit: 500, branch: 'HEAD' });
  });

  it('re-fetches commits when selected branch changes', async () => {
    const { result } = renderHook(() => useCommits());

    await waitFor(() => expect(result.current.commits[0].sha).toBe('main1'));
    act(() => result.current.setSelectedBranch('feature'));

    await waitFor(() => expect(result.current.commits[0].sha).toBe('feat1'));
    expect(mockRequest).toHaveBeenCalledWith('commits/list', { limit: 500, branch: 'feature' });
  });

  it('loads the next page when loadMore is called', async () => {
    mockRequest.mockImplementation(async (type: string, payload?: any) => {
      if (type === 'branches/list') {
        return [{ name: 'main', remote: false, current: true }];
      }
      if (type === 'commits/list') {
        if (payload?.skip === 500) {
          return [
            {
              sha: 'main2',
              parents: [],
              authorName: 'Filip',
              authorEmail: 'filip@example.com',
              authorDateIso: '2026-03-12T00:00:00Z',
              subject: 'Second page',
              decorations: '',
              refs: []
            }
          ];
        }
        return Array.from({ length: 500 }, (_, idx) => ({
          sha: `main${idx + 1}`,
          parents: [],
          authorName: 'Filip',
          authorEmail: 'filip@example.com',
          authorDateIso: '2026-03-12T00:00:00Z',
          subject: `Initial ${idx + 1}`,
          decorations: '',
          refs: []
        }));
      }
      return [];
    });

    const { result } = renderHook(() => useCommits());
    await waitFor(() => expect(result.current.commits[0].sha).toBe('main1'));

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('commits/list', { limit: 500, branch: 'HEAD', skip: 500 });
    });
    await waitFor(() => {
      expect(result.current.commits.some(c => c.sha === 'main2')).toBe(true);
    });
  });

  it('refreshes silently on repoChanged event after debounce', async () => {
    renderHook(() => useCommits());
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());

    mockRequest.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'event/repoChanged' } }));
    });
    expect(mockRequest).not.toHaveBeenCalled();

    await new Promise(resolve => setTimeout(resolve, 260));

    expect(mockRequest).toHaveBeenCalledWith('branches/list');
    expect(mockRequest).toHaveBeenCalledWith('tags/remoteList', { remote: 'origin' });
    expect(mockRequest).toHaveBeenCalledWith('commits/list', { limit: 500, branch: 'HEAD' });
  });

  it('matches tags with fuzzy search', async () => {
    mockRequest.mockImplementation(async (type: string) => {
      if (type === 'branches/list') {
        return [{ name: 'main', remote: false, current: true }];
      }
      if (type === 'tags/remoteList') {
        return ['v1.2.3'];
      }
      if (type === 'commits/list') {
        return [
          {
            sha: 'tagged1',
            parents: [],
            authorName: 'Filip',
            authorEmail: 'filip@example.com',
            authorDateIso: '2026-03-12T00:00:00Z',
            subject: 'Release commit',
            decorations: '',
            refs: [{ name: 'v1.2.3', type: 'tag' }]
          },
          {
            sha: 'other1',
            parents: [],
            authorName: 'Filip',
            authorEmail: 'filip@example.com',
            authorDateIso: '2026-03-12T00:00:00Z',
            subject: 'Other commit',
            decorations: '',
            refs: []
          }
        ];
      }
      return [];
    });

    const { result } = renderHook(() => useCommits());
    await waitFor(() => expect(result.current.commits.some(c => c.sha === 'tagged1')).toBe(true));

    act(() => {
      result.current.setSearchQuery('v123');
    });

    await waitFor(() => {
      expect(result.current.commits).toHaveLength(1);
      expect(result.current.commits[0].sha).toBe('tagged1');
    });
  });
});
