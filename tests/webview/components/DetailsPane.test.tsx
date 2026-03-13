import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('commits all changed files on first click when nothing is selected', async () => {
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
    expect(mockRequest).toHaveBeenCalledWith('git/commit', {
      message: 'test commit message',
      paths: ['a.txt', 'b.txt'],
      amend: false,
      noVerify: false
    });
  });

  it('supports committed commit interactions: expand message, copy subject, and open file', () => {
    mockUseCommitDetails.mockReturnValue({
      details: {
        sha: 'abc12345',
        parents: ['def67890'],
        subject: 'Add parser tests',
        message: 'Add parser tests\n\nIncludes edge cases.',
        authorName: 'Filip',
        authorEmail: 'filip@example.com',
        authorDateIso: '2026-03-11T00:00:00Z'
      },
      changes: [
        { path: 'src/extension/git/changeParsing.ts', status: 'M' }
      ],
      loading: false
    });

    const { container } = render(<DetailsPane sha="abc12345" />);

    fireEvent.click(screen.getByTitle('Show commit message'));
    const fullMessage = container.querySelector('.commit-message-display');
    expect(fullMessage?.textContent || '').toContain('Includes edge cases.');

    fireEvent.click(screen.getByTitle('Copy commit title'));
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'app/copyToClipboard',
      payload: { text: 'Add parser tests' }
    });

    fireEvent.click(screen.getByText('changeParsing.ts'));
    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'file/open',
      payload: expect.objectContaining({
        sha: 'abc12345',
        base: 'abc12345^',
        path: 'src/extension/git/changeParsing.ts',
        status: 'M'
      })
    }));
  });

  it('supports amend with Alt key as no-verify', async () => {
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
    const amendButton = screen.getByRole('button', { name: 'Amend' });
    fireEvent.click(amendButton, { altKey: true });

    expect(mockRequest).toHaveBeenCalledWith('git/commit', {
      message: '',
      paths: ['a.txt', 'b.txt'],
      amend: true,
      noVerify: true
    });
  });

  it('clears commit error banner on ui/escape event', async () => {
    mockRequest.mockRejectedValue({ message: 'Commit failed', details: 'hook output' });
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
        { path: 'a.txt', status: '?' }
      ],
      loading: false
    });

    render(<DetailsPane sha="UNCOMMITTED" />);
    fireEvent.change(screen.getByPlaceholderText('Commit message...'), {
      target: { value: 'msg' }
    });

    const commitButton = screen.getByRole('button', { name: 'Commit' });
    fireEvent.click(commitButton);

    await waitFor(() => {
      expect(screen.getByText('Commit failed')).toBeTruthy();
    });

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'ui/escape' } }));
    await waitFor(() => {
      expect(screen.queryByText('Commit failed')).toBeNull();
    });
  });
});

