import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DetailsPane } from '../../../src/webview/components/DetailsPane';

const mockRequest = vi.fn();
const mockPostMessage = vi.fn();
const mockUseCommitDetails = vi.fn();

vi.mock('../../../src/webview/state/vscode', () => ({
  request: (...args: any[]) => mockRequest(...args),
  vscode: {
    postMessage: (...args: any[]) => mockPostMessage(...args)
  }
}));

vi.mock('../../../src/webview/state/useCommitDetails', () => ({
  useCommitDetails: (...args: any[]) => mockUseCommitDetails(...args)
}));

describe('DetailsPane', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockPostMessage.mockReset();
    mockUseCommitDetails.mockReset();
  });

  it('requires explicit second click to commit when nothing is selected', async () => {
    mockRequest.mockResolvedValue(undefined);
    mockUseCommitDetails.mockReturnValue({
      details: {
        sha: 'UNCOMMITTED',
        parents: ['HEAD'],
        subject: 'Uncommitted Changes',
        message: 'Uncommitted Changes',
        authorName: '*',
        authorEmail: '',
        authorDateIso: '2026-03-11T00:00:00Z'
      },
      changes: [
        { path: 'a.txt', status: '?' },
        { path: 'b.txt', status: 'M' }
      ],
      loading: false
    });

    render(<DetailsPane sha="UNCOMMITTED" />);
    fireEvent.change(screen.getByPlaceholderText('Commit message...'), {
      target: { value: 'test commit message' }
    });

    const commitButton = screen.getByRole('button', { name: 'Commit' });
    fireEvent.click(commitButton);
    expect(mockRequest).not.toHaveBeenCalled();

    fireEvent.click(commitButton);
    expect(mockRequest).toHaveBeenCalledWith('git/commit', {
      message: 'test commit message',
      paths: ['a.txt', 'b.txt'],
      amend: false,
      noVerify: false
    });
  });
});

