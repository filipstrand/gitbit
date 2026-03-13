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
    expect(mockRequest).toHaveBeenCalledWith('commits/list', { limit: 500, branch: 'HEAD' });
  });
});
