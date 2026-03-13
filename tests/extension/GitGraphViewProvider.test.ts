import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitGraphViewProvider } from '../../src/extension/GitGraphViewProvider';
import * as vscode from 'vscode';

type ReceiveHandler = (message: any) => Promise<void>;

function setupHarness() {
  const posted: any[] = [];
  let onReceive: ReceiveHandler | null = null;
  const webviewView: any = {
    visible: true,
    webview: {
      options: {},
      html: '',
      asWebviewUri: (u: any) => u,
      postMessage: (message: any) => {
        posted.push(message);
        return Promise.resolve(true);
      },
      onDidReceiveMessage: (cb: ReceiveHandler) => {
        onReceive = cb;
        return { dispose: () => {} };
      }
    },
    onDidDispose: () => ({ dispose: () => {} })
  };

  const provider = new GitGraphViewProvider({} as any);
  (provider as any)._getHtmlForWebview = () => '<html></html>';

  return {
    provider,
    posted,
    webviewView,
    getReceiver: () => onReceive
  };
}

describe('GitGraphViewProvider message handling', () => {
  beforeEach(() => {
    (vscode.window as any).showWarningMessage = vi.fn(async () => undefined);
    (vscode.window as any).showErrorMessage = vi.fn(async () => undefined);
  });

  it('passes force flag to repos/list discovery and returns sorted repos', async () => {
    const { provider, posted, webviewView, getReceiver } = setupHarness();
    (provider as any)._discoverRepos = vi.fn().mockResolvedValue([
      { root: '/b', label: 'beta' },
      { root: '/a', label: 'alpha' }
    ]);
    (provider as any)._getRepoMeta = vi.fn(async (root: string) => ({
      lastCommitUnix: root === '/a' ? 200 : 100,
      hasUncommittedChanges: false,
      currentBranch: 'main'
    }));

    await provider.resolveWebviewView(webviewView, {} as any, {} as any);
    await getReceiver()!({ type: 'repos/list', requestId: 'r1', payload: { force: true } });

    expect((provider as any)._discoverRepos).toHaveBeenCalledWith(true);
    expect(posted[posted.length - 1]).toEqual({
      type: 'ok',
      requestId: 'r1',
      data: [
        { root: '/a', label: 'alpha', lastCommitUnix: 200, hasUncommittedChanges: false, currentBranch: 'main' },
        { root: '/b', label: 'beta', lastCommitUnix: 100, hasUncommittedChanges: false, currentBranch: 'main' }
      ]
    });
  });

  it('uses cached discovery path when repos/list force flag is omitted', async () => {
    const { provider, posted, webviewView, getReceiver } = setupHarness();
    (provider as any)._discoverRepos = vi.fn().mockResolvedValue([
      { root: '/z', label: 'zeta' },
      { root: '/a', label: 'alpha' }
    ]);
    (provider as any)._getRepoMeta = vi.fn().mockResolvedValue({
      lastCommitUnix: 100,
      hasUncommittedChanges: false,
      currentBranch: 'main'
    });

    await provider.resolveWebviewView(webviewView, {} as any, {} as any);
    await getReceiver()!({ type: 'repos/list', requestId: 'r2', payload: {} });

    expect((provider as any)._discoverRepos).toHaveBeenCalledWith(false);
    expect(posted[posted.length - 1]).toEqual({
      type: 'ok',
      requestId: 'r2',
      data: [
        { root: '/a', label: 'alpha', lastCommitUnix: 100, hasUncommittedChanges: false, currentBranch: 'main' },
        { root: '/z', label: 'zeta', lastCommitUnix: 100, hasUncommittedChanges: false, currentBranch: 'main' }
      ]
    });
  });

  it('runs fetch with prune/tags and responds ok', async () => {
    const { provider, posted, webviewView, getReceiver } = setupHarness();
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    (provider as any)._gitRunner = { cwd: '/repo', run };
    (provider as any)._notifyRepoChanged = vi.fn();

    await provider.resolveWebviewView(webviewView, {} as any, {} as any);
    await getReceiver()!({ type: 'git/fetch', requestId: 'f1', payload: {} });

    expect(run).toHaveBeenCalledWith(['fetch', '--all', '--prune', '--tags']);
    expect(posted[posted.length - 1]).toEqual({ type: 'ok', requestId: 'f1', data: 'ok' });
  });

  it('runs pull with tags when working tree is clean', async () => {
    const { provider, posted, webviewView, getReceiver } = setupHarness();
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    (provider as any)._gitRunner = { cwd: '/repo', run };
    (provider as any)._ensureClean = vi.fn().mockResolvedValue(true);
    (provider as any)._notifyRepoChanged = vi.fn();

    await provider.resolveWebviewView(webviewView, {} as any, {} as any);
    await getReceiver()!({ type: 'git/pull', requestId: 'p1', payload: {} });

    expect((provider as any)._ensureClean).toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith(['pull', '--tags']);
    expect(posted[posted.length - 1]).toEqual({ type: 'ok', requestId: 'p1', data: 'ok' });
  });

  it('cancels pull when _ensureClean rejects operation', async () => {
    const { provider, posted, webviewView, getReceiver } = setupHarness();
    const run = vi.fn();
    (provider as any)._gitRunner = { cwd: '/repo', run };
    (provider as any)._ensureClean = vi.fn().mockResolvedValue(false);

    await provider.resolveWebviewView(webviewView, {} as any, {} as any);
    await getReceiver()!({ type: 'git/pull', requestId: 'p2', payload: {} });

    expect(run).not.toHaveBeenCalled();
    expect(posted[posted.length - 1]).toEqual({
      type: 'error',
      requestId: 'p2',
      message: 'Pull cancelled',
      details: undefined
    });
  });

  it('parses uncommitted commit changes with full untracked-file expansion', async () => {
    const { provider, posted, webviewView, getReceiver } = setupHarness();
    const run = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: '?? pipelines/fibo_bbq/examples/\n M src/extension/GitGraphViewProvider.ts',
      stderr: ''
    });
    (provider as any)._gitRunner = { cwd: '/repo', run };

    await provider.resolveWebviewView(webviewView, {} as any, {} as any);
    await getReceiver()!({
      type: 'commit/changes',
      requestId: 'c1',
      payload: { sha: GitGraphViewProvider.UNCOMMITTED_SHA }
    });

    expect(run).toHaveBeenCalledWith([
      'status',
      '--porcelain',
      '--find-renames',
      '--untracked-files=all'
    ]);
    expect(posted[posted.length - 1]).toEqual({
      type: 'ok',
      requestId: 'c1',
      data: [
        { status: '?', path: 'pipelines/fibo_bbq/examples' },
        { status: 'M', path: 'src/extension/GitGraphViewProvider.ts' }
      ]
    });
  });

  it('returns fetch error when git command fails', async () => {
    const { provider, posted, webviewView, getReceiver } = setupHarness();
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'network error' });
    (provider as any)._gitRunner = { cwd: '/repo', run };

    await provider.resolveWebviewView(webviewView, {} as any, {} as any);
    await getReceiver()!({ type: 'git/fetch', requestId: 'f2', payload: {} });

    expect(posted[posted.length - 1]).toEqual({
      type: 'error',
      requestId: 'f2',
      message: 'Fetch failed',
      details: 'network error'
    });
  });

  it('returns rebase error when target branch is missing', async () => {
    const { provider, posted, webviewView, getReceiver } = setupHarness();
    (provider as any)._gitRunner = { cwd: '/repo', run: vi.fn() };

    await provider.resolveWebviewView(webviewView, {} as any, {} as any);
    await getReceiver()!({ type: 'git/rebase', requestId: 'rb1', payload: {} });

    expect(posted[posted.length - 1]).toEqual({
      type: 'error',
      requestId: 'rb1',
      message: 'Rebase failed: missing target branch',
      details: undefined
    });
  });

  it('cancels rebase when user does not confirm modal', async () => {
    const { provider, posted, webviewView, getReceiver } = setupHarness();
    const run = vi.fn();
    (provider as any)._gitRunner = { cwd: '/repo', run };
    (provider as any)._ensureClean = vi.fn().mockResolvedValue(true);
    ((vscode.window as any).showWarningMessage as any).mockResolvedValue('Cancel');

    await provider.resolveWebviewView(webviewView, {} as any, {} as any);
    await getReceiver()!({ type: 'git/rebase', requestId: 'rb2', payload: { onto: 'main' } });

    expect(run).not.toHaveBeenCalledWith(['rebase', 'main'], 600000);
    expect(posted[posted.length - 1]).toEqual({
      type: 'error',
      requestId: 'rb2',
      message: 'Rebase cancelled',
      details: undefined
    });
  });

  it('passes pagination skip when fetching commits list', async () => {
    const { provider, posted, webviewView, getReceiver } = setupHarness();
    const run = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: ''
    });
    (provider as any)._gitRunner = { cwd: '/repo', run };

    await provider.resolveWebviewView(webviewView, {} as any, {} as any);
    await getReceiver()!({
      type: 'commits/list',
      requestId: 'cl1',
      payload: { branch: 'feature/test', limit: 100, skip: 500 }
    });

    expect(run).toHaveBeenCalledWith([
      'log',
      '--topo-order',
      '-n',
      '100',
      '--date=iso-strict',
      '--pretty=format:%H%x09%P%x09%an%x09%ae%x09%ad%x09%s%x09%D',
      '--skip',
      '500',
      'feature/test'
    ]);
    expect(posted[posted.length - 1]).toEqual({
      type: 'ok',
      requestId: 'cl1',
      data: []
    });
  });
});

