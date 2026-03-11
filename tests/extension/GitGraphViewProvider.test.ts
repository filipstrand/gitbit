import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitGraphViewProvider } from '../../src/extension/GitGraphViewProvider';

const outputAppendLine = vi.fn();

vi.mock('vscode', () => {
  const disposable = { dispose: () => {} };
  return {
    window: {
      createOutputChannel: () => ({
        appendLine: outputAppendLine,
        dispose: () => {}
      }),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      onDidChangeWindowState: () => disposable,
      onDidChangeTextEditorSelection: () => disposable,
      tabGroups: {
        all: [],
        onDidChangeTabs: () => disposable,
        close: vi.fn()
      }
    },
    workspace: {
      workspaceFolders: [],
      onDidSaveTextDocument: () => disposable,
      onDidCreateFiles: () => disposable,
      onDidDeleteFiles: () => disposable,
      onDidRenameFiles: () => disposable,
      createFileSystemWatcher: () => ({
        onDidChange: () => disposable,
        onDidCreate: () => disposable,
        onDidDelete: () => disposable,
        dispose: () => {}
      })
    },
    extensions: {
      getExtension: () => undefined
    },
    commands: {
      executeCommand: vi.fn()
    },
    TextEditorSelectionChangeKind: {
      Mouse: 2
    },
    RelativePattern: class {
      constructor(public base: string, public pattern: string) {}
    },
    Uri: {
      joinPath: (...parts: any[]) => ({ parts }),
      file: (fsPath: string) => ({ fsPath }),
      from: (v: any) => v
    }
  };
});

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
    outputAppendLine.mockReset();
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
});

