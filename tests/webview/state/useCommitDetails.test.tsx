import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommitDetails } from '../../../src/webview/state/useCommitDetails';

const mockRequest = vi.fn();
vi.mock('../../../src/webview/state/vscode', () => ({
  request: (...args: any[]) => mockRequest(...args)
}));

describe('useCommitDetails', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (type: string) => {
      if (type === 'commit/details') {
        return {
          sha: 'abc123',
          parents: ['parent'],
          subject: 'Subject',
          message: 'Message',
          authorName: 'Filip',
          authorEmail: 'filip@example.com',
          authorDateIso: '2026-03-12T00:00:00Z'
        };
      }
      if (type === 'commit/changes') {
        return [{ path: 'src/file.ts', status: 'M' }];
      }
      return [];
    });
  });

  it('returns empty state and does not request when sha is null', async () => {
    const { result } = renderHook(() => useCommitDetails(null));

    await waitFor(() => {
      expect(result.current.details).toBeNull();
      expect(result.current.changes).toEqual([]);
    });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('fetches details and changes when sha is provided', async () => {
    const { result } = renderHook(() => useCommitDetails('abc123'));

    await waitFor(() => {
      expect(result.current.details?.sha).toBe('abc123');
      expect(result.current.changes).toEqual([{ path: 'src/file.ts', status: 'M' }]);
    });
    expect(mockRequest).toHaveBeenCalledWith('commit/details', { sha: 'abc123' });
    expect(mockRequest).toHaveBeenCalledWith('commit/changes', { sha: 'abc123' });
  });

  it('includes repoRoot in requests when provided', async () => {
    renderHook(() => useCommitDetails('abc123', '/tmp/gitbit'));

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('commit/details', { sha: 'abc123', repoRoot: '/tmp/gitbit' });
    });
    expect(mockRequest).toHaveBeenCalledWith('commit/changes', { sha: 'abc123', repoRoot: '/tmp/gitbit' });
  });

  it('refreshes silently on repoChanged event after debounce', async () => {
    renderHook(() => useCommitDetails('abc123'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());

    mockRequest.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'event/repoChanged' } }));
    });
    expect(mockRequest).not.toHaveBeenCalled();

    await new Promise(resolve => setTimeout(resolve, 300));

    expect(mockRequest).toHaveBeenCalledWith('commit/details', { sha: 'abc123' });
    expect(mockRequest).toHaveBeenCalledWith('commit/changes', { sha: 'abc123' });
  });
});
