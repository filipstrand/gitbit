import { describe, expect, it, vi } from 'vitest';
import { GitContentProvider } from '../../../src/extension/git/GitContentProvider';

describe('GitContentProvider', () => {
  it('returns newline for EMPTY revision', async () => {
    const provider = new GitContentProvider(
      () => {
        throw new Error('should not be called');
      },
      { appendLine: vi.fn() } as any
    );

    const content = await provider.provideTextDocumentContent({
      query: 'rev=EMPTY',
      path: '/src/file.ts',
      toString: () => 'gitbit:/src/file.ts?rev=EMPTY'
    } as any);

    expect(content).toBe('\n');
  });

  it('throws when no git runner is available', async () => {
    const provider = new GitContentProvider(() => undefined, { appendLine: vi.fn() } as any);

    await expect(provider.provideTextDocumentContent({
      query: 'rev=abc123',
      path: '/src/file.ts',
      toString: () => 'gitbit:/src/file.ts?rev=abc123'
    } as any)).rejects.toThrow('No git runner available for this URI');
  });

  it('runs git show with parsed rev/path and returns stdout', async () => {
    const run = vi.fn().mockResolvedValue({
      stdout: 'export const value = 1;',
      stderr: '',
      exitCode: 0
    });
    const provider = new GitContentProvider(() => ({ run } as any), { appendLine: vi.fn() } as any);

    const content = await provider.provideTextDocumentContent({
      query: 'rev=abc123&t=1',
      path: '/src/file.ts',
      toString: () => 'gitbit:/src/file.ts?rev=abc123&t=1'
    } as any);

    expect(run).toHaveBeenCalledWith(['show', 'abc123:src/file.ts']);
    expect(content).toBe('export const value = 1;');
  });

  it('throws a descriptive error when git show fails', async () => {
    const run = vi.fn().mockResolvedValue({
      stdout: '',
      stderr: 'fatal: path not found',
      exitCode: 128
    });
    const provider = new GitContentProvider(() => ({ run } as any), { appendLine: vi.fn() } as any);

    await expect(provider.provideTextDocumentContent({
      query: 'abc123',
      path: '/src/missing.ts',
      toString: () => 'gitbit:/src/missing.ts?abc123'
    } as any)).rejects.toThrow('Failed to get file content for abc123:src/missing.ts: fatal: path not found');
  });
});
