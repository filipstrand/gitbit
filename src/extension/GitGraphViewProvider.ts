import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GitRunner } from './git/GitRunner';
import { GitLogParser } from './git/GitLogParser';
import { RequestMessage, ResponseMessage, RepoInfo } from './protocol/types';
import { GitContentProvider } from './git/GitContentProvider';

export class GitGraphViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'gitbit.view';
  public static readonly UNCOMMITTED_SHA = 'UNCOMMITTED';

  private _view?: vscode.WebviewView;
  private _gitRunner?: GitRunner;
  private _gitRunnersByRoot = new Map<string, GitRunner>();
  private _reposCache: RepoInfo[] | null = null;
  private _selectedRepoRoot: string | null = null;
  private _outputChannel: vscode.OutputChannel;
  private _disposables: vscode.Disposable[] = [];
  private _startTime: string = new Date().toISOString();
  private _repoChangedTimer: NodeJS.Timeout | undefined;
  private _ephemeralDiffKeys = new Set<string>();
  private _ephemeralDiffCloser?: vscode.Disposable;
  private _moveModeActive = false;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._outputChannel = vscode.window.createOutputChannel('GitBit');
    this._outputChannel.appendLine('GitBit extension initialized.');
  }

  public get gitRunner() { return this._gitRunner; }
  public get outputChannel() { return this._outputChannel; }

  public getGitRunnerForUri(uri: vscode.Uri) {
    const params = new URLSearchParams(uri.query);
    const repo = params.get('repo');
    if (repo) {
      const root = decodeURIComponent(repo);
      const existing = this._gitRunnersByRoot.get(root);
      if (existing) return existing;
      const runner = new GitRunner(root);
      this._gitRunnersByRoot.set(root, runner);
      return runner;
    }
    return this._gitRunner;
  }

  private _currentRepoRoot() {
    return this._gitRunner?.cwd || this._selectedRepoRoot || undefined;
  }

  private _createContentUri(rev: string, p: string) {
    const root = this._currentRepoRoot();
    const query = `rev=${encodeURIComponent(rev)}${root ? `&repo=${encodeURIComponent(root)}` : ''}&t=${Date.now()}`;
    return vscode.Uri.from({
      scheme: GitContentProvider.scheme,
      authority: 'commit',
      path: '/' + p,
      query
    });
  }

  private _ensureEphemeralDiffCloser() {
    if (this._ephemeralDiffCloser) return;
    this._ephemeralDiffCloser = vscode.window.tabGroups.onDidChangeTabs(() => {
      void this._closeEphemeralDiffTabs();
    });
    this._disposables.push(this._ephemeralDiffCloser);
  }

  private async _closeEphemeralDiffTabs() {
    if (this._ephemeralDiffKeys.size === 0) return;

    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input;
        if (input instanceof vscode.TabInputTextDiff) {
          const key = `${input.original.toString()}@@${input.modified.toString()}`;
          if (this._ephemeralDiffKeys.has(key)) {
            try {
              // Close the tab without stealing focus.
              await vscode.window.tabGroups.close(tab, true);
            } catch (err: any) {
              this._outputChannel.appendLine(`Failed to auto-close returned diff tab: ${err?.message ?? String(err)}`);
            } finally {
              this._ephemeralDiffKeys.delete(key);
            }
          }
        }
      }
    }
  }

  private async _discoverRepos(): Promise<RepoInfo[]> {
    if (this._reposCache) return this._reposCache;

    const folders = vscode.workspace.workspaceFolders || [];
    const seen = new Set<string>();
    const repos: RepoInfo[] = [];

    const addRepo = (root: string, label: string) => {
      if (!root || seen.has(root)) return;
      seen.add(root);
      repos.push({ root, label });
    };

    for (const folder of folders) {
      // Include the workspace folder itself if it's a repo.
      const top = await GitRunner.getRepoRoot(folder.uri);
      if (top) addRepo(top, folder.name);

      // Find repos one level down (direct children only).
      // We avoid vscode.workspace.findFiles('**/.git/config') because many VS Code setups exclude `.git` from search.
      const folderFsPath = folder.uri.fsPath;
      let entries: fs.Dirent[] = [];
      try {
        entries = await fs.promises.readdir(folderFsPath, { withFileTypes: true });
      } catch {
        entries = [];
      }

      const ignoreNames = new Set(['node_modules', 'dist', '.git']);
      for (const ent of entries) {
        if (ignoreNames.has(ent.name)) continue;
        // Skip hidden folders to reduce noise (e.g. .Trash, .config, etc.)
        if (ent.name.startsWith('.')) continue;

        const childRoot = path.join(folderFsPath, ent.name);
        // On macOS, Desktop entries may be symlinks (e.g. iCloud Drive) — treat symlinked directories as candidates.
        if (!ent.isDirectory()) {
          if (!ent.isSymbolicLink()) continue;
          try {
            const st = await fs.promises.stat(childRoot);
            if (!st.isDirectory()) continue;
          } catch {
            continue;
          }
        }

        const gitMarker = path.join(childRoot, '.git');
        try {
          // `.git` can be a directory (normal repo) or a file (worktrees/submodules) — both count as repo markers.
          await fs.promises.stat(gitMarker);
        } catch {
          continue;
        }

        const childRepoRoot = await GitRunner.getRepoRoot(vscode.Uri.file(childRoot));
        if (childRepoRoot) {
          // Since we only scan one level down, label can just be the folder name.
          addRepo(childRepoRoot, ent.name);
        }
      }
    }

    this._reposCache = repos;
    return repos;
  }

  private async _getRepoMeta(root: string): Promise<Pick<RepoInfo, 'lastCommitUnix' | 'hasUncommittedChanges' | 'currentBranch'>> {
    try {
      const runner = this._gitRunnersByRoot.get(root) || new GitRunner(root);
      if (!this._gitRunnersByRoot.has(root)) this._gitRunnersByRoot.set(root, runner);

      const [logRes, statusRes, branchRes] = await Promise.all([
        runner.run(['log', '-1', '--format=%ct']),
        runner.run(['status', '--porcelain']),
        runner.run(['symbolic-ref', '--quiet', '--short', 'HEAD'])
      ]);

      const lastCommitUnix = logRes.exitCode === 0 ? Number(String(logRes.stdout || '').trim() || 0) : 0;
      const hasUncommittedChanges =
        statusRes.exitCode === 0 ? String(statusRes.stdout || '').trim().length > 0 : false;
      const currentBranch =
        branchRes.exitCode === 0 ? String(branchRes.stdout || '').trim() : 'detached';

      return {
        lastCommitUnix: Number.isFinite(lastCommitUnix) ? lastCommitUnix : 0,
        hasUncommittedChanges,
        currentBranch: currentBranch || 'detached'
      };
    } catch {
      return { lastCommitUnix: 0, hasUncommittedChanges: false, currentBranch: 'detached' };
    }
  }

  private _notifyRepoChanged(reason?: string) {
    if (this._repoChangedTimer) clearTimeout(this._repoChangedTimer);
    this._repoChangedTimer = setTimeout(() => {
      this._repoChangedTimer = undefined;
      if (!this._view) return;
      this._outputChannel.appendLine(`Repo change detected${reason ? ` (${reason})` : ''}, notifying webview...`);
      this._view.webview.postMessage({ type: 'event/repoChanged' });
    }, 300);
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    this._outputChannel.appendLine('Webview view resolved.');

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.onDidReceiveMessage(async (message: RequestMessage) => {
      this._outputChannel.appendLine(`Received message: ${message.type} (${message.requestId})`);
      try {
        switch (message.type) {
          case 'ui/moveMode': {
            this._moveModeActive = !!message.payload?.active;
            this._sendResponse(message.requestId, 'ok');
            break;
          }
          case 'repos/list': {
            const base = await this._discoverRepos();
            const enriched = await Promise.all(
              base.map(async r => {
                const meta = await this._getRepoMeta(r.root);
                return { ...r, ...meta };
              })
            );

            // Sort by "most recently updated" (latest commit), with a stable label tie-breaker.
            enriched.sort((a, b) => {
              const at = a.lastCommitUnix || 0;
              const bt = b.lastCommitUnix || 0;
              if (bt !== at) return bt - at;
              return a.label.localeCompare(b.label);
            });

            this._sendResponse(message.requestId, enriched);
            break;
          }
          case 'repo/select': {
            const requested = String(message.payload?.root || '');
            if (!requested) {
              this._sendError(message.requestId, 'No repo root provided');
              break;
            }

            const validate = await new GitRunner(requested).run(['rev-parse', '--show-toplevel']);
            if (validate.exitCode !== 0) {
              this._sendError(message.requestId, 'Not a git repository', validate.stderr);
              break;
            }

            const root = validate.stdout.trim();
            this._selectedRepoRoot = root;
            await this._updateRepo(root);
            // Best-effort: sync our selected repo with VS Code's native Git "active repository".
            // (This makes Source Control / SCM actions operate on the same repo the graph is showing.)
            try {
              const gitExt = vscode.extensions.getExtension('vscode.git');
              if (gitExt && !gitExt.isActive) {
                await gitExt.activate();
              }
              const git = (gitExt as any)?.exports?.getAPI?.(1);
              const repoUri = vscode.Uri.file(root);
              if (git?.openRepository) {
                await git.openRepository(repoUri);
              }
              // Some VS Code builds expose this command; ignore if missing.
              await vscode.commands.executeCommand('git.setSelectedRepository', repoUri);
            } catch {
              // ignore
            }
            this._notifyRepoChanged('repo selected');
            this._sendResponse(message.requestId, 'ok');
            break;
          }
          case 'repo/resolve':
            await this._resolveRepo();
            this._sendResponse(message.requestId, { root: this._gitRunner ? 'ok' : 'error' });
            break;
          case 'commits/list':
            if (!this._gitRunner) {
              await this._resolveRepo();
            }
            if (!this._gitRunner) {
              this._outputChannel.appendLine('Error: No repository found during commits/list');
              this._sendError(message.requestId, 'No repository found');
              return;
            }
            const limit = message.payload?.limit || 500;
            const branch = message.payload?.branch || 'HEAD';
            const logFormat = '%H%x09%P%x09%an%x09%ae%x09%ad%x09%s%x09%D';
            
            const args = [
              'log',
              '--topo-order',
              `-n`, `${limit}`,
              '--date=iso-strict',
              `--pretty=format:${logFormat}`
            ];

            if (branch === '--all') {
              args.push('--all');
            } else {
              // When filtering on a branch, show the full reachable history (including merged-in branches),
              // so merge commits expose the commits/branches that were integrated.
              args.push(branch);
            }

            this._outputChannel.appendLine(`Running git log: git ${args.join(' ')}`);
            const { stdout, exitCode, stderr } = await this._gitRunner.run(args);

            if (exitCode === 0) {
              const commits = GitLogParser.parseLog(stdout).map(c => ({
                ...c,
                refs: GitLogParser.parseDecorations(c.decorations)
              }));

              // Check for uncommitted changes
              if (branch === 'HEAD' || branch === '--all') {
                const statusRes = await this._gitRunner.run(['status', '--porcelain']);
                if (statusRes.exitCode === 0 && statusRes.stdout.trim().length > 0) {
                  const lines = statusRes.stdout.trim().split('\n');
                  commits.unshift({
                    sha: GitGraphViewProvider.UNCOMMITTED_SHA,
                    parents: ['HEAD'],
                    authorName: '*',
                    authorEmail: '',
                    authorDateIso: this._startTime,
                    subject: `Uncommitted Changes (${lines.length})`,
                    decorations: '',
                    refs: []
                  });
                }
              }

              this._outputChannel.appendLine(`Successfully fetched ${commits.length} commits.`);
              this._sendResponse(message.requestId, commits);
            } else {
              this._outputChannel.appendLine(`Git log failed: ${stderr}`);
              this._sendError(message.requestId, 'Failed to fetch commits', stderr);
            }
            break;
          case 'branches/list':
            if (!this._gitRunner) {
              await this._resolveRepo();
            }
            if (!this._gitRunner) {
              this._outputChannel.appendLine('Error: No repository found during branches/list');
              this._sendError(message.requestId, 'No repository found');
              return;
            }
            this._outputChannel.appendLine('Fetching branches...');
            const branchesRes = await this._gitRunner.run([
              'branch',
              '-a',
              '--sort=-committerdate',
              // Use full refname to correctly detect remotes (refname:short returns "origin/foo" for refs/remotes/origin/foo).
              '--format=%(refname)%09%(refname:short)%09%(HEAD)'
            ]);
            if (branchesRes.exitCode === 0) {
              const branches = branchesRes.stdout.split('\n')
                .filter(l => l.trim().length > 0)
                .map(line => {
                  const [refname, shortName, head] = line.split('\t');
                  return {
                    name: shortName,
                    remote: refname.startsWith('refs/remotes/'),
                    current: head.trim() === '*'
                  };
                });
              this._sendResponse(message.requestId, branches);
            } else {
              this._sendError(message.requestId, 'Failed to fetch branches');
            }
            break;
          case 'commit/details':
            if (!this._gitRunner) return;
            if (message.payload.sha === GitGraphViewProvider.UNCOMMITTED_SHA) {
              this._sendResponse(message.requestId, {
                sha: GitGraphViewProvider.UNCOMMITTED_SHA,
                authorName: '*',
                authorEmail: '',
                authorDateIso: this._startTime,
                parents: ['HEAD'],
                subject: 'Uncommitted Changes',
                message: 'Displaying all uncommitted changes.'
              });
              return;
            }
            const detailsResult = await this._gitRunner.run([
              'show',
              '-s',
              '--date=iso-strict',
              '--pretty=format:%H%n%an%n%ae%n%ad%n%P%n%B',
              message.payload.sha
            ]);
            if (detailsResult.exitCode === 0) {
              const [sha, authorName, authorEmail, authorDateIso, parentsRaw, ...messageBodyLines] = detailsResult.stdout.split('\n');
              this._sendResponse(message.requestId, {
                sha,
                authorName,
                authorEmail,
                authorDateIso,
                parents: parentsRaw ? parentsRaw.split(' ') : [],
                subject: messageBodyLines[0] || '',
                message: messageBodyLines.join('\n')
              });
            } else {
              this._sendError(message.requestId, 'Failed to fetch details');
            }
            break;
          case 'commit/changes':
            if (!this._gitRunner) return;
            if (message.payload.sha === GitGraphViewProvider.UNCOMMITTED_SHA) {
              const statusRes = await this._gitRunner.run(['status', '--porcelain', '--find-renames']);
              if (statusRes.exitCode === 0) {
                const changes = statusRes.stdout.split('\n')
                  .filter(l => l.trim().length > 0)
                  .map(line => {
                    const status = line.substring(0, 2).trim();
                    const rest = line.substring(3).trim();
                    if (status.startsWith('R')) {
                      const [oldPath, newPath] = rest.split(' -> ');
                      return { status: 'R' as const, oldPath, path: newPath };
                    }
                    // Porcelain status is XY, we just take X or Y.
                    // If X is not space, it's staged. If Y is not space, it's unstaged.
                    // For simplicity, we just take the first non-space character as status.
                    const char = status[0] !== ' ' ? status[0] : status[1];
                    return { status: char as any, path: rest };
                  });
                this._sendResponse(message.requestId, changes);
              } else {
                this._sendError(message.requestId, 'Failed to fetch uncommitted changes');
              }
              return;
            }
            // Use diff-tree (instead of `git show`) so merge commits reliably return changed files.
            // For merge commits, show changes against the first parent (what you typically want when inspecting a merge).
            const sha = String(message.payload.sha || '');
            const parentsRes = await this._gitRunner.run(['rev-list', '--parents', '-n', '1', sha]);
            const toks = parentsRes.exitCode === 0 ? parentsRes.stdout.trim().split(' ').filter(Boolean) : [];
            const parents = toks.length >= 2 ? toks.slice(1) : [];

            const baseArgs = [
              'diff-tree',
              '--no-commit-id',
              '--name-status',
              '-r',
              '-M', // detect renames
              '-C', // detect copies
            ];

            let changesResult;
            if (parents.length === 0) {
              // Root commit.
              changesResult = await this._gitRunner.run([...baseArgs, '--root', sha]);
            } else if (parents.length === 1) {
              // Normal commit.
              changesResult = await this._gitRunner.run([...baseArgs, sha]);
            } else {
              // Merge commit: compare first parent -> merge result.
              changesResult = await this._gitRunner.run([...baseArgs, parents[0], sha]);
            }
            if (changesResult.exitCode === 0) {
              const changes = this._parseChanges(changesResult.stdout);
              this._sendResponse(message.requestId, changes);
            } else {
              this._sendError(message.requestId, 'Failed to fetch changes');
            }
            break;
          case 'range/changes':
            if (!this._gitRunner) return;
            const targetRef = message.payload.target === GitGraphViewProvider.UNCOMMITTED_SHA ? '' : message.payload.target;
            const rangeArgs = [
              'diff',
              '--name-status',
              '--find-renames',
              message.payload.base
            ];
            if (targetRef) rangeArgs.push(targetRef);

            const rangeResult = await this._gitRunner.run(rangeArgs);
            if (rangeResult.exitCode === 0) {
              const changes = this._parseChanges(rangeResult.stdout);
              this._sendResponse(message.requestId, changes);
            } else {
              this._sendError(message.requestId, 'Failed to fetch range changes');
            }
            break;
          case 'file/diff':
            const { base, target, path: filePath, oldPath, status } = message.payload;
            
            const createUri = (rev: string, p: string) => this._createContentUri(rev, p);

            let leftUri: vscode.Uri;
            let rightUri: vscode.Uri;

            if (target === GitGraphViewProvider.UNCOMMITTED_SHA) {
              // For uncommitted changes, left is HEAD (or nothing if added), 
              // right is the actual file on disk.
              leftUri = status === 'A' || status === '?'
                ? createUri('EMPTY', filePath)
                : createUri('HEAD', oldPath || filePath);
              
              const fullPath = path.join(this._gitRunner!.cwd, filePath);
              rightUri = vscode.Uri.file(fullPath);
            } else {
              leftUri = status === 'A' 
                ? createUri('EMPTY', filePath)
                : createUri(base, oldPath || filePath);
              rightUri = status === 'D'
                ? createUri('EMPTY', filePath)
                : createUri(target, filePath);
            }
            
            this._outputChannel.appendLine(`Opening diff: ${leftUri.toString()} <-> ${rightUri.toString()}`);
            const diffKey = `${leftUri.toString()}@@${rightUri.toString()}`;
            
            // Find first diff line to jump to
            let diffSelection: vscode.Range | undefined;
            const diffArgs = ['diff', '--unified=0', base];
            if (target !== GitGraphViewProvider.UNCOMMITTED_SHA) {
              diffArgs.push(target);
            }
            diffArgs.push('--', filePath);

            const diffResForSelection = await this._gitRunner!.run(diffArgs);
            if (diffResForSelection.exitCode === 0) {
              const match = diffResForSelection.stdout.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/m);
              if (match) {
                const line = Math.max(0, parseInt(match[1]) - 1);
                diffSelection = new vscode.Range(line, 0, line, 0);
              }
            }

            await vscode.commands.executeCommand(
              'vscode.diff',
              leftUri,
              rightUri,
              `${path.basename(filePath)} (${status})`,
              {
                viewColumn: vscode.ViewColumn.Active,
                preview: false,
                selection: diffSelection
              }
            );

            // Attempt to move the diff to a new floating window
            try {
              await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
              // VS Code will "return" moved editors back into the original window when the floating window closes.
              // We track this diff and auto-close it if it reappears as a tab.
              this._ensureEphemeralDiffCloser();
              this._ephemeralDiffKeys.add(diffKey);
              setTimeout(() => this._ephemeralDiffKeys.delete(diffKey), 5 * 60 * 1000).unref?.();
            } catch (err) {
              this._outputChannel.appendLine(`Failed to move to new window: ${err}`);
              // Fallback: stay in the current column if moving fails
            }
            break;
          case 'file/revealInOS': {
            if (!this._gitRunner) return;
            const relPathRaw: unknown = message.payload?.path;
            const oldPathRaw: unknown = message.payload?.oldPath;
            const relPath = typeof relPathRaw === 'string' ? relPathRaw : '';
            const oldRelPath = typeof oldPathRaw === 'string' ? oldPathRaw : '';

            const repoRoot = this._gitRunner!.cwd;

            const exists = async (fsPath: string) => {
              try {
                await fs.promises.stat(fsPath);
                return true;
              } catch {
                return false;
              }
            };

            const revealPathOrParent = async (repoRelativePath: string) => {
              const full = path.join(repoRoot, repoRelativePath);
              if (await exists(full)) {
                await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(full));
                return true;
              }

              // If the file doesn't exist in the working tree (common when viewing older commits),
              // fall back to revealing the nearest existing parent folder.
              let dir = path.dirname(full);
              while (dir && dir !== repoRoot && dir.startsWith(repoRoot + path.sep)) {
                if (await exists(dir)) {
                  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dir));
                  return true;
                }
                const next = path.dirname(dir);
                if (next === dir) break;
                dir = next;
              }

              // Final fallback: reveal repo root.
              if (await exists(repoRoot)) {
                await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(repoRoot));
                return true;
              }

              return false;
            };

            if (!relPath) {
              vscode.window.showWarningMessage('Reveal in Finder: missing file path.');
              break;
            }

            // Prefer current path, fall back to old path (renames).
            const ok = await revealPathOrParent(relPath);
            if (!ok && oldRelPath) {
              const okOld = await revealPathOrParent(oldRelPath);
              if (okOld) break;
            }

            if (!ok) {
              vscode.window.showWarningMessage('Cannot reveal: failed to resolve a path to reveal.');
            }
            break;
          }
          case 'git/reword': {
            if (!this._gitRunner) {
              this._sendError(message.requestId, 'No repository found');
              break;
            }
            const rewordSha = message.payload.sha;
            let newMessage = message.payload.message;

            if (!newMessage) {
              // Fetch current message first
              const currentMsgRes = await this._gitRunner.run(['show', '-s', '--format=%s', rewordSha]);
              const currentMsg = currentMsgRes.stdout.trim();
              
              newMessage = await vscode.window.showInputBox({
                title: 'Rename Commit',
                prompt: 'Enter new commit message',
                value: currentMsg
              });
            }

            if (!newMessage) {
              this._sendError(message.requestId, 'Rename cancelled');
              break;
            }
            
            this._outputChannel.appendLine(`Attempting to reword commit ${rewordSha.substring(0, 8)} to: "${newMessage}"`);

            // Check if it's the latest commit (HEAD)
            const headRes = await this._gitRunner.run(['rev-parse', 'HEAD']);
            const headSha = headRes.stdout.trim();

            if (rewordSha === headSha) {
              // Simple amend
              const amendRes = await this._gitRunner.run(['commit', '--amend', '-m', newMessage]);
              if (amendRes.exitCode === 0) {
                this._sendResponse(message.requestId, 'ok');
              } else {
                this._sendError(message.requestId, 'Failed to rename commit', amendRes.stderr);
              }
            } else {
              // Older commit - needs rebase
              this._outputChannel.appendLine('Commit is not HEAD. Attempting non-interactive rebase reword...');
              
              const parentRes = await this._gitRunner.run(['rev-parse', `${rewordSha}^`]);
              const parentSha = parentRes.stdout.trim();
              const treeRes = await this._gitRunner.run(['rev-parse', `${rewordSha}^{tree}`]);
              const treeSha = treeRes.stdout.trim();
              
              const commitTreeRes = await this._gitRunner.run(['commit-tree', treeSha, '-p', parentSha, '-m', newMessage]);
              const newCommitSha = commitTreeRes.stdout.trim();
              
              if (commitTreeRes.exitCode === 0) {
                const rebaseOntoRes = await this._gitRunner.run(['rebase', '--onto', newCommitSha, rewordSha]);
                if (rebaseOntoRes.exitCode === 0) {
                  this._sendResponse(message.requestId, 'ok');
                } else {
                  // If rebase fails (conflicts), abort
                  await this._gitRunner.run(['rebase', '--abort']);
                  this._sendError(message.requestId, 'Failed to reword: conflicts occurred during rebase.', rebaseOntoRes.stderr);
                }
              } else {
                this._sendError(message.requestId, 'Failed to create reworded commit object');
              }
            }
            break;
          }
          case 'git/revert': {
            if (!this._gitRunner) return;
            const revertShas: string[] = message.payload.shas;
            this._outputChannel.appendLine(`Attempting to revert ${revertShas.length} commit(s)...`);

            // 1. Get the full log to determine chronological order (newest first)
            const logRes = await this._gitRunner.run(['log', '--format=%H']);
            if (logRes.exitCode !== 0) {
              this._sendError(message.requestId, 'Failed to fetch log for revert');
              return;
            }
            const allShas = logRes.stdout.trim().split('\n');
            const sortedShas = revertShas
              .filter(sha => allShas.includes(sha))
              .sort((a, b) => allShas.indexOf(a) - allShas.indexOf(b)); // newest first (lowest index in log)

            if (sortedShas.length === 0) {
              this._sendError(message.requestId, 'Invalid selection for revert');
              return;
            }

            const confirmRevert = await vscode.window.showWarningMessage(
              `Are you sure you want to revert ${sortedShas.length} commit(s)? This will create new commits undoing the changes.`,
              { modal: true },
              'Revert'
            );
            if (confirmRevert !== 'Revert') {
              this._sendError(message.requestId, 'Revert cancelled');
              return;
            }

            // Check if clean
            const statusRes = await this._gitRunner.run(['status', '--porcelain']);
            if (statusRes.exitCode === 0 && statusRes.stdout.trim().length > 0) {
              await vscode.window.showErrorMessage(
                `Cannot revert: You have uncommitted changes. Please commit or discard them before reverting.`,
                { modal: true }
              );
              this._sendError(message.requestId, 'Revert cancelled: uncommitted changes');
              return;
            }

            // Revert one by one
            for (const sha of sortedShas) {
              this._outputChannel.appendLine(`Reverting commit ${sha.substring(0, 8)}...`);
              // --no-edit to use default "Revert '...'" message
              const revertRes = await this._gitRunner.run(['revert', '--no-edit', sha]);
              if (revertRes.exitCode !== 0) {
                this._sendError(message.requestId, `Failed to revert ${sha.substring(0, 8)}: Conflicts occurred.`, revertRes.stderr);
                return; // Stop on first conflict
              }
            }

            this._sendResponse(message.requestId, 'ok');
            break;
          }
          case 'git/cherryPick': {
            if (!this._gitRunner) return;
            const shasRaw: unknown = message.payload?.shas;
            const shas = Array.isArray(shasRaw) ? shasRaw : [];
            const commits = shas
              .filter((s): s is string => typeof s === 'string')
              .filter(s => s && s !== GitGraphViewProvider.UNCOMMITTED_SHA);

            if (commits.length === 0) {
              this._sendError(message.requestId, 'No commits to cherry-pick');
              return;
            }

            const confirm = await vscode.window.showWarningMessage(
              `Cherry-pick ${commits.length} commit(s) onto your current branch?`,
              { modal: true },
              'Cherry-pick'
            );
            if (confirm !== 'Cherry-pick') {
              this._sendError(message.requestId, 'Cherry-pick cancelled');
              return;
            }

            if (!(await this._ensureClean('You have local changes. Cherry-picking might cause conflicts. Continue?'))) {
              this._sendError(message.requestId, 'Cherry-pick cancelled');
              return;
            }

            this._outputChannel.appendLine(`Cherry-picking ${commits.length} commit(s): ${commits.map(s => s.substring(0, 8)).join(', ')}`);
            const cherryRes = await this._gitRunner.run(['cherry-pick', ...commits], 120000);

            if (cherryRes.exitCode === 0) {
              this._notifyRepoChanged('cherry-pick');
              vscode.window.showInformationMessage(`Cherry-picked ${commits.length} commit(s).`);
              this._sendResponse(message.requestId, 'ok');
            } else {
              this._notifyRepoChanged('cherry-pick');
              await vscode.window.showErrorMessage(
                `Cherry-pick failed. If there are conflicts, resolve them and run "git cherry-pick --continue" (or "git cherry-pick --abort").`,
                { modal: true }
              );
              this._sendError(message.requestId, 'Cherry-pick failed', cherryRes.stderr);
            }
            break;
          }
          case 'git/tagAdd': {
            if (!this._gitRunner) return;
            const sha = String(message.payload?.sha || '').trim();
            if (!sha || sha === GitGraphViewProvider.UNCOMMITTED_SHA) {
              this._sendError(message.requestId, 'Add tag failed: invalid commit');
              break;
            }

            const name = await vscode.window.showInputBox({
              title: 'Add Tag',
              prompt: `Create a local tag pointing to ${sha.substring(0, 8)}`,
              placeHolder: 'v1.2.3',
              ignoreFocusOut: true,
              validateInput: (v) => {
                const s = v.trim();
                if (!s) return 'Tag name is required';
                if (/\s/.test(s)) return 'Tag names cannot contain spaces';
                return null;
              }
            });

            if (!name) {
              this._sendError(message.requestId, 'Add tag cancelled');
              break;
            }

            const tagName = name.trim();
            const res = await this._gitRunner.run(['tag', tagName, sha]);
            if (res.exitCode === 0) {
              this._notifyRepoChanged('tag add');
              vscode.window.showInformationMessage(`Created tag "${tagName}"`);
              this._sendResponse(message.requestId, 'ok');
            } else {
              this._sendError(message.requestId, 'Add tag failed', res.stderr);
            }
            break;
          }
          case 'git/tagDelete': {
            if (!this._gitRunner) return;
            const directTagsRaw: unknown = message.payload?.tags;
            const directTags = Array.isArray(directTagsRaw)
              ? directTagsRaw.map(t => String(t).trim()).filter(Boolean)
              : [];

            let picked: string[] = [];
            if (directTags.length > 0) {
              picked = directTags;
            } else {
              const sha = String(message.payload?.sha || '').trim();
              if (!sha || sha === GitGraphViewProvider.UNCOMMITTED_SHA) {
                this._sendError(message.requestId, 'Delete tags failed: invalid commit');
                break;
              }

              const tagsRes = await this._gitRunner.run(['tag', '--points-at', sha]);
              const tags = tagsRes.exitCode === 0
                ? tagsRes.stdout.split('\n').map(t => t.trim()).filter(Boolean)
                : [];

              if (tags.length === 0) {
                vscode.window.showInformationMessage('No tags point at this commit.');
                this._sendResponse(message.requestId, 'ok');
                break;
              }

              const pickRes = await vscode.window.showQuickPick(tags, {
                title: 'Delete Tag(s)',
                placeHolder: 'Select tag(s) to delete locally',
                canPickMany: true,
                ignoreFocusOut: true
              });

              if (!pickRes || pickRes.length === 0) {
                this._sendError(message.requestId, 'Delete tags cancelled');
                break;
              }
              picked = pickRes;
            }

            const confirm = await vscode.window.showWarningMessage(
              `Delete ${picked.length} local tag(s)? (This does not delete remote tags.)`,
              { modal: true, detail: picked.join('\n') },
              'Delete'
            );
            if (confirm !== 'Delete') {
              this._sendError(message.requestId, 'Delete tags cancelled');
              break;
            }

            const delRes = await this._gitRunner.run(['tag', '-d', ...picked]);
            if (delRes.exitCode === 0) {
              this._notifyRepoChanged('tag delete');
              vscode.window.showInformationMessage(`Deleted ${picked.length} tag(s) locally.`);
              this._sendResponse(message.requestId, 'ok');
            } else {
              this._sendError(message.requestId, 'Delete tags failed', delRes.stderr);
            }
            break;
          }
          case 'git/checkout': {
            if (!this._gitRunner) return;
            const checkoutTargetRaw = String(message.payload?.sha || '').trim();
            const checkoutTarget = checkoutTargetRaw.replace(/^remotes\//, '');
            
            // Check for uncommitted changes first
            const statusRes = await this._gitRunner.run(['status', '--porcelain']);
            if (statusRes.exitCode === 0 && statusRes.stdout.trim().length > 0) {
              await vscode.window.showErrorMessage(
                `Cannot switch: You have uncommitted changes. Please commit or discard them before switching branches or checking out.`,
                { modal: true }
              );
              this._sendError(message.requestId, 'Checkout cancelled: uncommitted changes');
              return;
            }

            // If it's a full SHA (40 chars), it's likely an "older commit" checkout, so ask for confirmation
            if (/^[0-9a-f]{40}$/.test(checkoutTarget)) {
              const confirmCheckout = await vscode.window.showWarningMessage(
                `Are you sure you want to checkout commit ${checkoutTarget.substring(0, 8)}? This will result in a detached HEAD state.`,
                { modal: true },
                'Checkout'
              );
              if (confirmCheckout !== 'Checkout') {
                this._sendError(message.requestId, 'Checkout cancelled');
                return;
              }
            }

            // For remote branches like "origin/feature", create a local tracking branch instead of detached HEAD.
            let res;
            if (!/^[0-9a-f]{40}$/.test(checkoutTarget)) {
              const localExists = await this._gitRunner.run(
                ['show-ref', '--verify', '--quiet', `refs/heads/${checkoutTarget}`]
              );
              if (localExists.exitCode === 0) {
                res = await this._gitRunner.run(['checkout', checkoutTarget]);
              } else {
                const remoteExists = await this._gitRunner.run(
                  ['show-ref', '--verify', '--quiet', `refs/remotes/${checkoutTarget}`]
                );
                if (remoteExists.exitCode === 0) {
                  const parts = checkoutTarget.split('/');
                  if (parts.length >= 2) {
                    const localName = parts.slice(1).join('/');
                    const localNameExists = await this._gitRunner.run(
                      ['show-ref', '--verify', '--quiet', `refs/heads/${localName}`]
                    );
                    if (localNameExists.exitCode === 0) {
                      res = await this._gitRunner.run(['checkout', localName]);
                    } else {
                      res = await this._gitRunner.run(['checkout', '-b', localName, '--track', checkoutTarget]);
                    }
                  } else {
                    // Unexpected, but fall back to vanilla checkout.
                    res = await this._gitRunner.run(['checkout', checkoutTarget]);
                  }
                } else {
                  // Could be a tag/other ref; fall back to vanilla checkout.
                  res = await this._gitRunner.run(['checkout', checkoutTarget]);
                }
              }
            } else {
              res = await this._gitRunner.run(['checkout', checkoutTarget]);
            }

            if (res.exitCode === 0) {
              this._sendResponse(message.requestId, 'ok');
            } else {
              this._sendError(message.requestId, 'Checkout failed', res.stderr);
            }
            break;
          }
          case 'git/reset': {
            if (!this._gitRunner) return;
            const resetSha = message.payload.sha;
            const isHard = message.payload.mode === 'hard';
            const resetMode = isHard ? '--hard' : '--soft';
            const buttonLabel = isHard ? 'Reset Hard' : 'Reset Soft';
            
            const confirmReset = await vscode.window.showWarningMessage(
              `Are you sure you want to perform a ${message.payload.mode} reset to ${resetSha.substring(0, 8)}?`,
              { modal: true },
              buttonLabel
            );
            if (confirmReset !== buttonLabel) return;

            if (isHard && !(await this._ensureClean('Hard reset will discard all local changes. Continue?'))) {
              return;
            }
            const resetRes = await this._gitRunner.run(['reset', resetMode, resetSha]);
            if (resetRes.exitCode === 0) {
              this._sendResponse(message.requestId, 'ok');
            } else {
              this._sendError(message.requestId, 'Reset failed', resetRes.stderr);
            }
            break;
          }
          case 'git/branchCreate': {
            if (!this._gitRunner) return;
            const branchSha = message.payload.sha;
            let branchName = message.payload.name;

            if (!branchName) {
              branchName = await vscode.window.showInputBox({
                title: 'Create New Branch',
                prompt: 'Enter branch name',
                placeHolder: 'feature/new-branch',
                ignoreFocusOut: true
              });
            }

            branchName = String(branchName || '').trim();
            if (!branchName) return;

            // Create + checkout in one command so the user immediately lands on the new branch.
            const bCreateRes = await this._gitRunner.run(['checkout', '-b', branchName, branchSha]);
            if (bCreateRes.exitCode === 0) {
              this._notifyRepoChanged('branch create');
              this._sendResponse(message.requestId, 'ok');
            } else {
              this._sendError(message.requestId, 'Branch creation failed', bCreateRes.stderr);
            }
            break;
          }
          case 'git/branchRename': {
            if (!this._gitRunner) return;
            const oldName = String(message.payload?.name || '').trim();
            if (!oldName) {
              this._sendError(message.requestId, 'Rename failed: missing branch name');
              return;
            }

            // Only allow renaming local branches (defensive; UI disables rename for remotes).
            const localCheck = await this._gitRunner.run(['show-ref', '--verify', '--quiet', `refs/heads/${oldName}`]);
            if (localCheck.exitCode !== 0) {
              await vscode.window.showErrorMessage(
                `Cannot rename "${oldName}": not a local branch.`,
                { modal: true }
              );
              this._sendError(message.requestId, 'Rename failed: not a local branch');
              return;
            }

            const newName = await vscode.window.showInputBox({
              title: 'Rename Branch',
              prompt: `Rename "${oldName}" to:`,
              value: oldName,
              validateInput: (value) => {
                const v = value.trim();
                if (!v) return 'Branch name is required';
                if (v === oldName) return 'New name must be different';
                return null;
              }
            });

            if (!newName) {
              this._sendError(message.requestId, 'Rename cancelled');
              return;
            }

            const renameRes = await this._gitRunner.run(['branch', '-m', oldName, newName.trim()]);
            if (renameRes.exitCode === 0) {
              this._notifyRepoChanged('branch rename');
              this._sendResponse(message.requestId, 'ok');
            } else {
              this._sendError(message.requestId, 'Branch rename failed', renameRes.stderr);
            }
            break;
          }
          case 'git/branchDelete': {
            if (!this._gitRunner) return;
            const branchName = String(message.payload?.name || '').trim();
            if (!branchName) {
              this._sendError(message.requestId, 'Delete failed: missing branch name');
              return;
            }

            // Only allow deleting local branches (defensive; UI hides this for remotes).
            const localCheck = await this._gitRunner.run(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]);
            if (localCheck.exitCode !== 0) {
              this._sendError(message.requestId, `Delete failed: "${branchName}" is not a local branch`);
              return;
            }

            // Prevent deleting the current branch
            const currentRes = await this._gitRunner.run(['rev-parse', '--abbrev-ref', 'HEAD']);
            const current = (currentRes.exitCode === 0 ? currentRes.stdout.trim() : '');
            if (current && current === branchName) {
              this._sendError(message.requestId, 'Delete cancelled: cannot delete the currently checked out branch');
              return;
            }

            const choice = await vscode.window.showWarningMessage(
              `Delete local branch "${branchName}"?`,
              { modal: true },
              'Delete',
              'Force Delete'
            );

            if (!choice) {
              this._sendError(message.requestId, 'Delete cancelled');
              return;
            }

            const args = choice === 'Force Delete' ? ['branch', '-D', branchName] : ['branch', '-d', branchName];
            const delRes = await this._gitRunner.run(args);
            if (delRes.exitCode === 0) {
              this._notifyRepoChanged('branch-delete');
              vscode.window.showInformationMessage(`Deleted branch "${branchName}".`);
              this._sendResponse(message.requestId, 'ok');
            } else {
              // If safe delete failed (e.g. not fully merged), offer force delete.
              if (choice === 'Delete') {
                const force = await vscode.window.showWarningMessage(
                  `Could not delete "${branchName}" (it may not be fully merged). Force delete?`,
                  { modal: true },
                  'Force Delete'
                );
                if (force === 'Force Delete') {
                  const forceRes = await this._gitRunner.run(['branch', '-D', branchName]);
                  if (forceRes.exitCode === 0) {
                    this._notifyRepoChanged('branch-delete');
                    vscode.window.showInformationMessage(`Force deleted branch "${branchName}".`);
                    this._sendResponse(message.requestId, 'ok');
                  } else {
                    this._sendError(message.requestId, 'Delete failed', forceRes.stderr);
                  }
                  return;
                }
              }
              this._sendError(message.requestId, 'Delete failed', delRes.stderr);
            }
            break;
          }
          case 'git/fetch': {
            if (!this._gitRunner) return;
            // Include tags so tag-heavy workflows stay in sync (fetch does not always fetch all tags by default).
            const fetchRes = await this._gitRunner.run(['fetch', '--all', '--prune', '--tags']);
            if (fetchRes.exitCode === 0) {
              // Treat fetch as a "manual refresh" as well.
              this._notifyRepoChanged('fetch');
              this._sendResponse(message.requestId, 'ok');
            } else {
              this._sendError(message.requestId, 'Fetch failed', fetchRes.stderr);
            }
            break;
          }
          case 'git/rebase': {
            if (!this._gitRunner) return;
            const onto = String(message.payload?.onto || '').trim();
            if (!onto) {
              this._sendError(message.requestId, 'Rebase failed: missing target branch');
              return;
            }

            if (!(await this._ensureClean('You have local changes. Rebasing might cause conflicts. Continue?'))) {
              this._sendError(message.requestId, 'Rebase cancelled');
              return;
            }

            const confirm = await vscode.window.showWarningMessage(
              `Rebase current branch onto "${onto}"?`,
              { modal: true },
              'Rebase'
            );
            if (confirm !== 'Rebase') {
              this._sendError(message.requestId, 'Rebase cancelled');
              return;
            }

            const rebaseRes = await this._gitRunner.run(['rebase', onto], 600000);
            if (rebaseRes.exitCode === 0) {
              this._notifyRepoChanged('rebase');
              this._sendResponse(message.requestId, 'ok');
            } else {
              await vscode.window.showErrorMessage(
                'Rebase failed (likely conflicts). Resolve conflicts and run `git rebase --continue`, or abort with `git rebase --abort`.',
                { modal: false }
              );
              this._sendError(message.requestId, 'Rebase failed', rebaseRes.stderr);
            }
            break;
          }
          case 'git/pull': {
            if (!this._gitRunner) return;
            if (await this._ensureClean('You have local changes. Pulling might cause conflicts. Continue?')) {
              // Include tags so tag-heavy workflows stay in sync.
              const pullRes = await this._gitRunner.run(['pull', '--tags']);
              if (pullRes.exitCode === 0) {
                // Treat pull as a "manual refresh" as well.
                this._notifyRepoChanged('pull');
                this._sendResponse(message.requestId, 'ok');
              } else {
                this._sendError(message.requestId, 'Pull failed', pullRes.stderr);
              }
            } else {
              this._sendError(message.requestId, 'Pull cancelled');
            }
            break;
          }
          case 'git/push': {
            if (!this._gitRunner) return;
            const isForce = message.payload?.force;
            
            // 1. Figure out what will be pushed
            let pushMessage = isForce 
              ? 'WARNING: You are about to FORCE PUSH. This will overwrite remote history. Continue?'
              : 'Are you sure you want to push your changes?';

            let currentBranchForPush: string | undefined;
            let defaultRemoteForPush: string | undefined;
            let hasUpstreamForPush: boolean | undefined;
            let trackingBranchForPush: string | undefined;
            let isUpToDateWithUpstream = false;
            let tagsToPushOnly: string[] | null = null;
            let remoteForTagsOnly: string | undefined;

            const branchRes = await this._gitRunner.run(['rev-parse', '--abbrev-ref', 'HEAD']);
            if (branchRes.exitCode === 0) {
              const currentBranch = branchRes.stdout.trim();
              currentBranchForPush = currentBranch;
              if (currentBranch === 'HEAD') {
                await vscode.window.showErrorMessage(
                  'Cannot push: you are in a detached HEAD state. Please checkout a branch first.',
                  { modal: true }
                );
                this._sendError(message.requestId, 'Push cancelled: detached HEAD');
                return;
              }

              // Pick a default remote: prefer origin, else the first configured remote.
              const remotesRes = await this._gitRunner.run(['remote']);
              const remotes = remotesRes.exitCode === 0
                ? remotesRes.stdout.split('\n').map(r => r.trim()).filter(Boolean)
                : [];
              const defaultRemote = remotes.includes('origin') ? 'origin' : remotes[0];
              defaultRemoteForPush = defaultRemote;
              if (!defaultRemote) {
                await vscode.window.showErrorMessage(
                  'Cannot push: no git remotes are configured for this repository.',
                  { modal: true }
                );
                this._sendError(message.requestId, 'Push cancelled: no remotes');
                return;
              }

              // Check if there's a remote tracking branch
              const trackingRes = await this._gitRunner.run(['rev-parse', '--abbrev-ref', '@{u}']);
              hasUpstreamForPush = trackingRes.exitCode === 0;
              if (trackingRes.exitCode === 0) {
                const trackingBranch = trackingRes.stdout.trim();
                trackingBranchForPush = trackingBranch;
                remoteForTagsOnly = trackingBranch.includes('/') ? trackingBranch.split('/')[0] : defaultRemoteForPush;
                // Get commits ahead of remote
                const aheadRes = await this._gitRunner.run(['log', '--oneline', `${trackingBranch}..HEAD`]);
                if (aheadRes.exitCode === 0) {
                  const aheadCommits = aheadRes.stdout.trim().split('\n').filter(l => l.length > 0);
                  if (aheadCommits.length > 0) {
                    const commitList = aheadCommits.slice(0, 5).join('\n');
                    const extraCount = aheadCommits.length > 5 ? `\n...and ${aheadCommits.length - 5} more` : '';
                    const prefix = isForce ? 'FORCE PUSHING' : 'Pushing';
                    pushMessage = `${prefix} ${aheadCommits.length} commit(s) to ${trackingBranch}:\n\n${commitList}${extraCount}\n\nAre you sure?`;
                  } else if (!isForce) {
                    isUpToDateWithUpstream = true;
                    pushMessage = `Your branch is up to date with ${trackingBranch}. Push anyway?`;
                  }
                }
              } else {
                pushMessage = `Branch "${currentBranch}" has no upstream branch. Push to create it on ${defaultRemote}?`;
              }
            } else {
              this._sendError(message.requestId, 'Push failed: could not determine current branch', branchRes.stderr);
              return;
            }

            // If there are no commits to push but there are local tags missing on the remote,
            // offer a "push tags only" path (common when users create a tag on an already-synced branch).
            if (!isForce && isUpToDateWithUpstream && remoteForTagsOnly) {
              const listLocalTagsRes = await this._gitRunner.run(['tag', '--list']);
              const localTags = listLocalTagsRes.exitCode === 0
                ? listLocalTagsRes.stdout.split('\n').map(t => t.trim()).filter(Boolean)
                : [];

              // Remote tags can be large; keep this reasonably tolerant.
              const remoteTagsRes = await this._gitRunner.run(['ls-remote', '--tags', '--refs', remoteForTagsOnly], 60000);
              const remoteTags = remoteTagsRes.exitCode === 0
                ? remoteTagsRes.stdout
                    .split('\n')
                    .map(l => l.trim())
                    .filter(Boolean)
                    .map(l => l.split('\t')[1] || '')
                    .filter(ref => ref.startsWith('refs/tags/'))
                    .map(ref => ref.substring('refs/tags/'.length))
                : [];

              const remoteSet = new Set(remoteTags);
              const missingTags = localTags.filter(t => !remoteSet.has(t));

              if (missingTags.length > 0) {
                const detail =
                  missingTags.length <= 12
                    ? missingTags.join('\n')
                    : `${missingTags.slice(0, 12).join('\n')}\n… and ${missingTags.length - 12} more`;

                const pick = await vscode.window.showWarningMessage(
                  `Your branch is up to date with ${trackingBranchForPush}.`,
                  { modal: true, detail: `${missingTags.length} local tag(s) are not on ${remoteForTagsOnly}.\n\n${detail}` },
                  'Push tags',
                  'Choose tags…',
                  'Push anyway'
                );

                if (pick === 'Push tags') {
                  tagsToPushOnly = missingTags;
                } else if (pick === 'Choose tags…') {
                  const chosen = await vscode.window.showQuickPick(missingTags, {
                    title: 'Push Tag(s)',
                    placeHolder: `Select tag(s) to push to ${remoteForTagsOnly}`,
                    canPickMany: true,
                    ignoreFocusOut: true
                  });
                  if (chosen && chosen.length > 0) {
                    tagsToPushOnly = chosen;
                  } else {
                    this._sendError(message.requestId, 'Push cancelled');
                    return;
                  }
                } else if (pick === 'Push anyway') {
                  // fall through to normal push (which will likely be a no-op for commits, but may push follow-tags).
                } else {
                  this._sendError(message.requestId, 'Push cancelled');
                  return;
                }
              }
            }

            if (!tagsToPushOnly) {
              const confirmPush = await vscode.window.showWarningMessage(
                pushMessage,
                { modal: true },
                isForce ? 'Force Push' : 'Push'
              );
              if (confirmPush !== (isForce ? 'Force Push' : 'Push')) {
                this._sendError(message.requestId, 'Push cancelled');
                return;
              }
            }

            this._outputChannel.appendLine(isForce ? 'Force pushing changes...' : 'Pushing changes...');
            let pushRes;
            if (tagsToPushOnly && remoteForTagsOnly) {
              const tagRefs = tagsToPushOnly.map(t => `refs/tags/${t}`);
              pushRes = await this._gitRunner.run(['push', remoteForTagsOnly, ...tagRefs], 60000);
            } else {
              // Include tags by default (safe variant: pushes annotated tags reachable from the pushed commits).
              const pushArgs = ['push', '--follow-tags'];
              if (isForce) pushArgs.push('--force-with-lease');
              
              const shouldSetUpstream = hasUpstreamForPush === false;
              const effectivePushArgs = shouldSetUpstream
                ? [...pushArgs, '--set-upstream', String(defaultRemoteForPush), String(currentBranchForPush)]
                : pushArgs;

              pushRes = await this._gitRunner.run(effectivePushArgs);
            }

            if (pushRes.exitCode === 0) {
              this._notifyRepoChanged('push');
              this._sendResponse(message.requestId, 'ok');
            } else {
              this._sendError(message.requestId, 'Push failed', pushRes.stderr);
            }
            break;
          }
          case 'app/copyToClipboard': {
            await vscode.env.clipboard.writeText(message.payload.text);
            vscode.window.showInformationMessage('Copied to clipboard');
            this._sendResponse(message.requestId, 'ok');
            break;
          }
          case 'file/open': {
            if (!this._gitRunner) return;
            const openPath = String(message.payload?.path || '');
            const sha = String(message.payload?.sha || GitGraphViewProvider.UNCOMMITTED_SHA);
            const base = String(message.payload?.base || 'HEAD');
            const target = String(message.payload?.target || sha);
            const oldPath = typeof message.payload?.oldPath === 'string' ? message.payload.oldPath : undefined;
            const status = String(message.payload?.status || '');

            const createUri = (rev: string, p: string) => this._createContentUri(rev, p);

            try {
              const openTextOrBinary = async (uri: vscode.Uri, opts?: { selection?: vscode.Range }) => {
                try {
                  const doc = await vscode.workspace.openTextDocument(uri);
                  await vscode.window.showTextDocument(doc, { preview: false, selection: opts?.selection });
                } catch {
                  // If it's not a text document (binary, too large, unknown scheme handler), fall back to VS Code's default opener.
                  await vscode.commands.executeCommand('vscode.open', uri, { preview: false });
                }
              };

              // Uncommitted: open the real file on disk (deleted opens the previous content at HEAD).
              if (sha === GitGraphViewProvider.UNCOMMITTED_SHA || target === GitGraphViewProvider.UNCOMMITTED_SHA) {
                const effectiveStatus = status.toUpperCase();
                if (effectiveStatus === 'D') {
                  // Can't open a deleted file from disk; open the last committed content.
                  const uri = createUri('HEAD', oldPath || openPath);
                  await openTextOrBinary(uri);
                  this._sendResponse(message.requestId, 'ok');
                  break;
                }

            const fullPath = path.join(this._gitRunner.cwd, openPath);
            
                // Find first diff line (against HEAD) to jump to.
            let selection: vscode.Range | undefined;
            const diffRes = await this._gitRunner.run(['diff', '--unified=0', 'HEAD', '--', openPath]);
            if (diffRes.exitCode === 0) {
              const match = diffRes.stdout.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/m);
              if (match) {
                const line = parseInt(match[1]) - 1;
                    if (line >= 0) selection = new vscode.Range(line, 0, line, 0);
                  }
                }

                await openTextOrBinary(vscode.Uri.file(fullPath), { selection });
                this._sendResponse(message.requestId, 'ok');
                break;
              }

              // Committed selection: prefer opening the working-tree file so it's editable.
              // (Opening a revision URI is read-only, which is not what we want for normal navigation/editing.)
              const effectiveStatus = status.toUpperCase();
              const tryOpenWorktreeFile = async (p: string) => {
                const fullPath = path.join(this._gitRunner!.cwd, p);
                try {
                  await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
                } catch {
                  return false;
                }
                await openTextOrBinary(vscode.Uri.file(fullPath));
                return true;
              };

              // Deleted in the selected commit: no working-tree file to open; open the last content (base).
              if (effectiveStatus === 'D') {
                const uri = createUri(base, oldPath || openPath);
                await openTextOrBinary(uri);
                this._sendResponse(message.requestId, 'ok');
                break;
              }

              // Prefer opening the new path, then old path (for renames/copies), otherwise fall back.
              const opened =
                (openPath ? await tryOpenWorktreeFile(openPath) : false) ||
                (oldPath ? await tryOpenWorktreeFile(oldPath) : false);

              if (opened) {
                this._sendResponse(message.requestId, 'ok');
                break;
              }

              // Fallback: open the file-at-revision (read-only) if it isn't present in the working tree.
              const openRev = effectiveStatus === 'D' ? base : target;
              const openAtPath = effectiveStatus === 'D' ? (oldPath || openPath) : openPath;
              const uri = createUri(openRev, openAtPath);
              await openTextOrBinary(uri);
              this._sendResponse(message.requestId, 'ok');
            } catch (err: any) {
              this._outputChannel.appendLine(`file/open failed: ${err?.message || String(err)}`);
              // IMPORTANT: never open diffs for file/open; diff is a dedicated action/button.
              this._sendError(message.requestId, 'Failed to open file', err?.message || String(err));
            }
            break;
          }
          case 'git/discard': {
            if (!this._gitRunner) return;
            const payload = (message.payload || {}) as { path?: string; paths?: string[] };
            const discardPaths = Array.from(
              new Set([...(Array.isArray(payload.paths) ? payload.paths : []), ...(payload.path ? [payload.path] : [])])
            ).filter(p => typeof p === 'string' && p.length > 0);

            if (discardPaths.length === 0) {
              this._sendError(message.requestId, 'Discard failed', 'No path(s) provided');
              break;
            }
            
            const detail =
              discardPaths.length <= 8
                ? discardPaths.map(p => path.basename(p)).join('\n')
                : `${discardPaths.slice(0, 8).map(p => path.basename(p)).join('\n')}\n… and ${discardPaths.length - 8} more`;
            
            const confirmDiscard = await vscode.window.showWarningMessage(
              discardPaths.length === 1
                ? `Are you sure you want to discard changes in ${path.basename(discardPaths[0])}?`
                : `Are you sure you want to discard changes in ${discardPaths.length} files?`,
              { modal: true, detail },
              'Discard'
            );
            if (confirmDiscard !== 'Discard') {
              this._sendError(message.requestId, 'Discard cancelled');
              break;
            }

            const errors: string[] = [];
            for (const discardPath of discardPaths) {
            // 1. Try to reset and checkout (works for tracked files, staged or unstaged)
            const discardRes = await this._gitRunner.run(['checkout', 'HEAD', '--', discardPath]);
            
            if (discardRes.exitCode !== 0) {
              // 2. If that failed, it might be an untracked file
              const cleanRes = await this._gitRunner.run(['clean', '-fd', '--', discardPath]);
                if (cleanRes.exitCode !== 0) {
                  errors.push(`${discardPath}: ${cleanRes.stderr || discardRes.stderr || 'failed'}`);
                }
              }
            }

            if (errors.length > 0) {
              this._sendError(message.requestId, 'Discard failed', errors.slice(0, 10).join('\n'));
            } else {
              this._sendResponse(message.requestId, 'ok');
            }
            break;
          }
          case 'git/discardAll': {
            if (!this._gitRunner) return;

            const confirm = await vscode.window.showWarningMessage(
              'Discard ALL uncommitted changes in this repository?',
              {
                modal: true,
                detail:
                  'This will permanently remove local modifications (staged and unstaged) and delete untracked files.\n\nThis cannot be undone.'
              },
              'Discard All'
            );
            if (confirm !== 'Discard All') {
              this._sendError(message.requestId, 'Discard cancelled');
              break;
            }

            // Tracked files (staged/unstaged)
            const resetRes = await this._gitRunner.run(['reset', '--hard']);
            if (resetRes.exitCode !== 0) {
              this._sendError(message.requestId, 'Discard failed', resetRes.stderr || resetRes.stdout || 'git reset --hard failed');
              break;
            }

            // Untracked files (but keep ignored files)
            const cleanRes = await this._gitRunner.run(['clean', '-fd']);
            if (cleanRes.exitCode !== 0) {
              this._sendError(message.requestId, 'Discard failed', cleanRes.stderr || cleanRes.stdout || 'git clean -fd failed');
              break;
            }

            this._sendResponse(message.requestId, 'ok');
            break;
          }
          case 'git/revertFile': {
            if (!this._gitRunner) return;
            const { sha, base, path: filePath, oldPath, status } = message.payload as {
              sha: string;
              base: string;
              path: string;
              oldPath?: string;
              status: string;
            };

            const fileLabel = path.basename(filePath);
            const confirm = await vscode.window.showWarningMessage(
              `Revert ${fileLabel} from ${sha.substring(0, 8)} into your working tree? This will create local (uncommitted) changes.`,
              { modal: true },
              'Revert'
            );
            if (confirm !== 'Revert') return;

            // If the target paths already have local modifications, warn again.
            const statusCheckTargets = [filePath, oldPath].filter(Boolean) as string[];
            if (statusCheckTargets.length > 0) {
              const localStatus = await this._gitRunner.run(['status', '--porcelain', '--', ...statusCheckTargets]);
              if (localStatus.exitCode === 0 && localStatus.stdout.trim().length > 0) {
                const overwrite = await vscode.window.showWarningMessage(
                  `You already have local changes affecting ${fileLabel}. Reverting may overwrite them. Continue?`,
                  { modal: true },
                  'Continue'
                );
                if (overwrite !== 'Continue') return;
              }
            }

            const restoreWorktree = async (ref: string, p: string) => {
              // Prefer restoring only the working tree (do not stage).
              const res = await this._gitRunner!.run(['restore', '--source', ref, '--worktree', '--', p]);
              if (res.exitCode === 0) return true;

              // Fallback: materialize file contents and write them to disk (also keeps it unstaged).
              const showRes = await this._gitRunner!.run(['show', `${ref}:${p}`]);
              if (showRes.exitCode !== 0) return false;

              const full = path.join(this._gitRunner!.cwd, p);
              const dir = path.dirname(full);
              await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
              await vscode.workspace.fs.writeFile(vscode.Uri.file(full), Buffer.from(showRes.stdout, 'utf8'));
              return true;
            };

            const deleteWorktree = async (p: string) => {
              const full = path.join(this._gitRunner!.cwd, p);
              try {
                await vscode.workspace.fs.delete(vscode.Uri.file(full), { useTrash: false });
              } catch {
                // ignore missing
              }
            };

            const effectiveStatus = String(status || '').toUpperCase();
            let ok = true;

            if (effectiveStatus === 'A') {
              // File was introduced by the commit; reverting means removing it from the working tree.
              await deleteWorktree(filePath);
            } else if (effectiveStatus === 'R' || effectiveStatus === 'C') {
              // Revert rename/copy by restoring the old path from base and removing the new path.
              if (oldPath) {
                ok = await restoreWorktree(base, oldPath);
              } else {
                ok = false;
              }
              await deleteWorktree(filePath);
            } else {
              // M / D / etc: restore to base version (the state before this commit).
              ok = await restoreWorktree(base, filePath);
            }

            if (!ok) {
              this._sendError(message.requestId, 'Failed to revert file into working tree');
              return;
            }

            // Notify UI to refresh (shows up under UNCOMMITTED changes).
            this._view?.webview.postMessage({ type: 'event/repoChanged' });
            this._sendResponse(message.requestId, 'ok');
            break;
          }
          case 'git/revertFiles': {
            if (!this._gitRunner) return;
            const { sha, base, files } = (message.payload || {}) as {
              sha: string;
              base: string;
              files: Array<{ path: string; oldPath?: string; status: string }>;
            };

            const normalizedFiles = Array.isArray(files)
              ? files
                  .map(f => ({
                    path: String((f as any)?.path || ''),
                    oldPath: (f as any)?.oldPath ? String((f as any).oldPath) : undefined,
                    status: String((f as any)?.status || '').toUpperCase()
                  }))
                  .filter(f => f.path.length > 0)
              : [];

            if (normalizedFiles.length === 0) {
              this._sendError(message.requestId, 'Failed to revert files into working tree', 'No files provided');
              break;
            }

            const detail =
              normalizedFiles.length <= 12
                ? normalizedFiles.map(f => path.basename(f.path)).join('\n')
                : `${normalizedFiles.slice(0, 12).map(f => path.basename(f.path)).join('\n')}\n… and ${normalizedFiles.length - 12} more`;

            const confirm = await vscode.window.showWarningMessage(
              normalizedFiles.length === 1
                ? `Revert ${path.basename(normalizedFiles[0].path)} from ${sha.substring(0, 8)} into your working tree? This will create local (uncommitted) changes.`
                : `Revert ${normalizedFiles.length} files from ${sha.substring(0, 8)} into your working tree? This will create local (uncommitted) changes.`,
              { modal: true, detail },
              'Revert'
            );
            if (confirm !== 'Revert') {
              this._sendError(message.requestId, 'Revert cancelled');
              break;
            }

            // If any target paths already have local modifications, warn again.
            const statusCheckTargets = Array.from(
              new Set(normalizedFiles.flatMap(f => [f.path, f.oldPath].filter(Boolean) as string[]))
            );
            if (statusCheckTargets.length > 0) {
              const localStatus = await this._gitRunner.run(['status', '--porcelain', '--', ...statusCheckTargets]);
              if (localStatus.exitCode === 0 && localStatus.stdout.trim().length > 0) {
                const overwrite = await vscode.window.showWarningMessage(
                  `You already have local changes affecting these files. Reverting may overwrite them. Continue?`,
                  { modal: true },
                  'Continue'
                );
                if (overwrite !== 'Continue') {
                  this._sendError(message.requestId, 'Revert cancelled');
                  break;
                }
              }
            }

            const restoreWorktree = async (ref: string, p: string) => {
              // Prefer restoring only the working tree (do not stage).
              const res = await this._gitRunner!.run(['restore', '--source', ref, '--worktree', '--', p]);
              if (res.exitCode === 0) return true;

              // Fallback: materialize file contents and write them to disk (also keeps it unstaged).
              const showRes = await this._gitRunner!.run(['show', `${ref}:${p}`]);
              if (showRes.exitCode !== 0) return false;

              const full = path.join(this._gitRunner!.cwd, p);
              const dir = path.dirname(full);
              await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
              await vscode.workspace.fs.writeFile(vscode.Uri.file(full), Buffer.from(showRes.stdout, 'utf8'));
              return true;
            };

            const deleteWorktree = async (p: string) => {
              const full = path.join(this._gitRunner!.cwd, p);
              try {
                await vscode.workspace.fs.delete(vscode.Uri.file(full), { useTrash: false });
              } catch {
                // ignore missing
              }
            };

            const errors: string[] = [];
            for (const f of normalizedFiles) {
              const effectiveStatus = String(f.status || '').toUpperCase();
              let ok = true;

              if (effectiveStatus === 'A') {
                // File was introduced by the commit; reverting means removing it from the working tree.
                await deleteWorktree(f.path);
              } else if (effectiveStatus === 'R' || effectiveStatus === 'C') {
                // Revert rename/copy by restoring the old path from base and removing the new path.
                if (f.oldPath) {
                  ok = await restoreWorktree(base, f.oldPath);
                } else {
                  ok = false;
                }
                await deleteWorktree(f.path);
              } else {
                // M / D / etc: restore to base version (the state before this commit).
                ok = await restoreWorktree(base, f.path);
              }

              if (!ok) {
                errors.push(`${f.path}: failed`);
              }
            }

            if (errors.length > 0) {
              this._sendError(message.requestId, 'Failed to revert file(s) into working tree', errors.slice(0, 10).join('\n'));
              break;
            }

            // Notify UI to refresh (shows up under UNCOMMITTED changes).
            this._view?.webview.postMessage({ type: 'event/repoChanged' });
            this._sendResponse(message.requestId, 'ok');
            break;
          }
          case 'git/commit':
            if (!this._gitRunner) return;
            {
              const commitMessage = String(message.payload?.message || '').trim();
              const amend = !!message.payload?.amend;
              const noVerify = !!message.payload?.noVerify;
              const selectedPaths = Array.isArray(message.payload?.paths)
                ? (message.payload.paths as any[]).map(p => String(p)).filter(p => p.length > 0)
                : undefined;

              if (!selectedPaths || selectedPaths.length === 0) {
                this._sendError(message.requestId, 'Select file(s) to commit first (use Select all to commit everything).');
                break;
              }

              if (!amend && !commitMessage) {
                this._sendError(message.requestId, 'Commit message is required');
                break;
              }

              const commitArgs = (opts?: { noEdit?: boolean }) => {
                const base: string[] = ['commit'];
                if (noVerify) base.push('--no-verify');

                if (!amend) return [...base, '-m', commitMessage];
                if (commitMessage) return [...base, '--amend', '-m', commitMessage];
                if (opts?.noEdit) return [...base, '--amend', '--no-edit'];
                return [...base, '--amend', '--no-edit'];
              };

              const parsePorcelainPaths = (stdout: string) => {
                return stdout
                  .split('\n')
                  .map(l => l.trimEnd())
                  .filter(l => l.length > 0)
                  .map(line => {
                    const rest = line.substring(3).trim();
                    if (rest.includes(' -> ')) {
                      const [oldPath, newPath] = rest.split(' -> ').map(s => s.trim());
                      return [oldPath, newPath].filter(Boolean);
                    }
                    return [rest];
                  })
                  .flat();
              };

              const isPathSelected = (p: string) => {
                if (!selectedPaths || selectedPaths.length === 0) return true;
                return selectedPaths.includes(p);
              };

              // Selected-file commit:
              // - Preserve any existing staged changes (best effort)
              // - Stage only selected paths
              // - Commit only those changes
              let stagedPatchFile: string | undefined;
              try {
                const stagedDiffRes = await this._gitRunner.run(['diff', '--cached', '--binary']);
                const stagedPatch = stagedDiffRes.exitCode === 0 ? stagedDiffRes.stdout : '';
                if (stagedPatch.trim().length > 0) {
                  stagedPatchFile = path.join(
                    os.tmpdir(),
                    `gitbit-staged-${Date.now()}-${Math.random().toString(16).slice(2)}.patch`
                  );
                  await fs.promises.writeFile(stagedPatchFile, stagedPatch, 'utf8');
                }

                const resetRes = await this._gitRunner.run(['reset']);
                if (resetRes.exitCode !== 0) {
                  this._sendError(message.requestId, 'Failed to prepare selected commit', resetRes.stderr);
                  break;
                }

                const addRes = await this._gitRunner.run(['add', '-A', '--', ...selectedPaths]);
                if (addRes.exitCode !== 0) {
                  this._sendError(message.requestId, 'Failed to stage selected files', addRes.stderr);
                  break;
                }

                const commitRes = await this._gitRunner.run(commitArgs({ noEdit: true }));
                if (commitRes.exitCode !== 0) {
                  this._sendError(message.requestId, 'Commit failed', commitRes.stderr);
                  break;
                }

                // If hooks modified files, only amend if the modified files intersect the selected set.
                const statusAfter = await this._gitRunner.run(['status', '--porcelain']);
                const dirtyPaths = parsePorcelainPaths(statusAfter.stdout);
                const shouldAmend = dirtyPaths.some(p => isPathSelected(p));
                if (shouldAmend) {
                  await this._gitRunner.run(['add', '-A', '--', ...selectedPaths]);
                  const amendArgs = ['commit'];
                  if (noVerify) amendArgs.push('--no-verify');
                  amendArgs.push('--amend', '--no-edit');
                  await this._gitRunner.run(amendArgs);
                  this._outputChannel.appendLine('Hooks modified selected files; automatically amended them into the commit.');
                }

                // Restore previously staged changes (best effort).
                if (stagedPatchFile) {
                  // First attempt: 3-way apply (more robust when history/index moved, e.g. after a soft reset).
                  let applyRes = await this._gitRunner.run(['apply', '--cached', '--3way', '--whitespace=nowarn', stagedPatchFile]);
                  if (applyRes.exitCode !== 0) {
                    // Fallback: plain apply (some patch types don't support 3-way).
                    applyRes = await this._gitRunner.run(['apply', '--cached', '--whitespace=nowarn', stagedPatchFile]);
                  }
                  if (applyRes.exitCode !== 0) {
                    this._outputChannel.appendLine(`Warning: failed to restore previously staged changes: ${applyRes.stderr}`);
                    vscode.window.showWarningMessage(
                      'Commit succeeded, but GitBit could not restore your previously staged changes. You may need to re-stage them manually.'
                    );
                  }
                }

              this._sendResponse(message.requestId, 'ok');
              } finally {
                if (stagedPatchFile) {
                  try {
                    await fs.promises.unlink(stagedPatchFile);
                  } catch {
                    // ignore
                  }
                }
              }
            }
            break;
          case 'git/squash':
            if (!this._gitRunner) return;
            {
              const squashShas: string[] = Array.isArray(message.payload?.shas)
                ? (message.payload.shas as any[]).map(s => String(s)).filter(s => s && s !== GitGraphViewProvider.UNCOMMITTED_SHA)
                : [];

              if (squashShas.length < 2) {
                this._sendError(message.requestId, 'Invalid selection for squash');
                break;
              }

              if (!(await this._ensureClean('Squashing rewrites history. You have local changes. Continue?'))) {
                this._sendError(message.requestId, 'Squash cancelled');
                break;
              }

              const branchRes = await this._gitRunner.run(['symbolic-ref', '--quiet', '--short', 'HEAD']);
              const originalBranch = branchRes.exitCode === 0 ? branchRes.stdout.trim() : null;
              const tipRes = await this._gitRunner.run(['rev-parse', 'HEAD']);
              const originalTip = tipRes.exitCode === 0 ? tipRes.stdout.trim() : '';

              if (!originalTip) {
                this._sendError(message.requestId, 'Failed to determine current HEAD');
                break;
              }

            this._outputChannel.appendLine(`Attempting to squash ${squashShas.length} commits...`);

              // 1) Use first-parent log for consistent ordering with the UI.
              const logRes = await this._gitRunner.run(['log', '--first-parent', '--format=%H']);
            if (logRes.exitCode !== 0) {
              this._sendError(message.requestId, 'Failed to fetch log for squash', logRes.stderr);
                break;
            }
              const allShas = logRes.stdout.trim().split('\n').filter(Boolean);
            const selectedIndices = squashShas
              .map(sha => allShas.indexOf(sha))
              .filter(idx => idx !== -1)
              .sort((a, b) => a - b);

            if (selectedIndices.length < 2) {
              this._sendError(message.requestId, 'Invalid selection for squash');
                break;
            }

            const newestSha = allShas[selectedIndices[0]];
            const oldestSha = allShas[selectedIndices[selectedIndices.length - 1]];

              // 2) Determine base (parent of oldest). If oldest is root, we currently don't support this.
              const parentsRes = await this._gitRunner.run(['rev-list', '--parents', '-n', '1', oldestSha]);
              const parts = parentsRes.exitCode === 0 ? parentsRes.stdout.trim().split(' ') : [];
              if (parts.length < 2) {
                this._sendError(message.requestId, 'Cannot squash a range that includes the root commit (not supported yet).');
                break;
              }
              const baseSha = parts[1];

              // 3) Selected range commits (oldest -> newest), first-parent.
              const rangeLogRes = await this._gitRunner.run([
                'log',
                '--first-parent',
                '--format=%H%x09%s',
                `${baseSha}..${newestSha}`
              ]);
            if (rangeLogRes.exitCode !== 0) {
              this._sendError(message.requestId, 'Failed to fetch range for squash', rangeLogRes.stderr);
                break;
              }
              const rangeCommitsNewestFirst = rangeLogRes.stdout
                .trim()
                .split('\n')
                .filter(Boolean)
                .map(line => {
              const [sha, subject] = line.split('\t');
                  return { sha, subject: subject || '' };
                });
              const rangeCommits = [...rangeCommitsNewestFirst].reverse();

              // 4) Identify commits after newest (middle-of-chain).
              const subsequentRes = await this._gitRunner.run(['rev-list', '--reverse', `${newestSha}..${originalTip}`]);
              const subsequent = subsequentRes.exitCode === 0
                ? subsequentRes.stdout.trim().split('\n').filter(Boolean)
                : [];

              // 5) Always prompt for a new commit message.
              const defaultTitle = rangeCommitsNewestFirst[0]?.subject || 'Squashed commit';
              const title = await vscode.window.showInputBox({
                title: 'Squash Commits',
                prompt: 'New squashed commit message',
                placeHolder: 'Enter the commit message for the squashed commit',
                value: defaultTitle,
                ignoreFocusOut: true
              });
              if (!title || !title.trim()) {
                this._sendError(message.requestId, 'Squash cancelled');
                break;
              }

              const confirmText =
                subsequent.length > 0
                  ? `Squash ${rangeCommits.length} commits into 1 and rebase ${subsequent.length} newer commit(s) on top?`
                  : `Squash ${rangeCommits.length} commits into 1?`;

              const confirmSquash = await vscode.window.showWarningMessage(confirmText, { modal: true }, 'Squash');
              if (confirmSquash !== 'Squash') {
                this._sendError(message.requestId, 'Squash cancelled');
                break;
              }

              const tmpBranch = `cgg-tmp-squash-${Date.now()}`;
              await this._gitRunner.run(['branch', tmpBranch, originalTip]);

              const restoreOriginal = async () => {
                if (originalBranch) {
                  await this._gitRunner!.run(['checkout', originalBranch]);
                  await this._gitRunner!.run(['reset', '--hard', originalTip]);
                } else {
                  await this._gitRunner!.run(['checkout', '--detach', originalTip]);
                }
              };

              try {
                // Create squashed commit on top of base by checking out newest, soft-reset to base, then committing.
                const checkoutNewest = await this._gitRunner.run(['checkout', '--detach', newestSha]);
                if (checkoutNewest.exitCode !== 0) {
                  this._sendError(message.requestId, 'Failed to checkout range tip for squash', checkoutNewest.stderr);
                  await restoreOriginal();
                  break;
                }

                const resetSoft = await this._gitRunner.run(['reset', '--soft', baseSha]);
                if (resetSoft.exitCode !== 0) {
                  this._sendError(message.requestId, 'Soft reset failed during squash', resetSoft.stderr);
                  await restoreOriginal();
                  break;
                }

                const body = rangeCommits
                  .map(c => `- ${c.subject} (${c.sha.substring(0, 8)})`)
                  .join('\n');

                const commitRes = await this._gitRunner.run(['commit', '-m', title.trim(), '-m', body]);
                if (commitRes.exitCode !== 0) {
                  this._sendError(message.requestId, 'Squash commit failed', commitRes.stderr);
                  await restoreOriginal();
                  break;
                }

                const squashedShaRes = await this._gitRunner.run(['rev-parse', 'HEAD']);
                const squashedSha = squashedShaRes.exitCode === 0 ? squashedShaRes.stdout.trim() : '';
                if (!squashedSha) {
                  this._sendError(message.requestId, 'Failed to resolve squashed commit SHA');
                  await restoreOriginal();
                  break;
                }

                if (originalBranch) {
                  const checkoutBranch = await this._gitRunner.run(['checkout', originalBranch]);
                  if (checkoutBranch.exitCode !== 0) {
                    this._sendError(message.requestId, 'Failed to return to branch after squash', checkoutBranch.stderr);
                    await restoreOriginal();
                    break;
                  }

                  const resetBranch = await this._gitRunner.run(['reset', '--hard', squashedSha]);
                  if (resetBranch.exitCode !== 0) {
                    this._sendError(message.requestId, 'Failed to move branch to squashed commit', resetBranch.stderr);
                    await restoreOriginal();
                    break;
                  }

                  if (subsequent.length > 0) {
                    const cherryRes = await this._gitRunner.run(['cherry-pick', ...subsequent]);
                    if (cherryRes.exitCode !== 0) {
                      await this._gitRunner.run(['cherry-pick', '--abort']);
                      await restoreOriginal();
                      this._sendError(
                        message.requestId,
                        'Squash failed due to conflicts while rebasing newer commits. Your branch was restored.',
                        cherryRes.stderr
                      );
                      break;
                    }
                  }
                } else {
                  // Detached HEAD: keep working in detached state.
                  if (subsequent.length > 0) {
                    const cherryRes = await this._gitRunner.run(['cherry-pick', ...subsequent]);
                    if (cherryRes.exitCode !== 0) {
                      await this._gitRunner.run(['cherry-pick', '--abort']);
                      await this._gitRunner.run(['checkout', '--detach', originalTip]);
                      this._sendError(
                        message.requestId,
                        'Squash failed due to conflicts while rebasing newer commits. Your HEAD was restored.',
                        cherryRes.stderr
                      );
                      break;
                    }
                  }
                }

              this._outputChannel.appendLine('Squash successful.');
                this._notifyRepoChanged('squash');
              this._sendResponse(message.requestId, 'ok');
              } finally {
                // Best-effort cleanup of temp branch.
                await this._gitRunner.run(['branch', '-D', tmpBranch]);
              }
            }
            break;
          case 'git/drop':
            if (!this._gitRunner) return;
            {
              const dropShas: string[] = Array.isArray(message.payload?.shas)
                ? (message.payload.shas as any[]).map(s => String(s)).filter(s => s && s !== GitGraphViewProvider.UNCOMMITTED_SHA)
                : [];

                

              if (dropShas.length < 1) {
                this._sendError(message.requestId, 'Invalid selection for drop');
                break;
              }

              if (!(await this._ensureClean('Dropping commits rewrites history. You have local changes. Continue?'))) {
                this._sendError(message.requestId, 'Drop cancelled');
                break;
              }

              const branchRes = await this._gitRunner.run(['symbolic-ref', '--quiet', '--short', 'HEAD']);
              const originalBranch = branchRes.exitCode === 0 ? branchRes.stdout.trim() : null;
              if (!originalBranch) {
                this._sendError(message.requestId, 'Drop is not supported in detached HEAD state. Checkout a branch first.');
                break;
              }

              const tipRes = await this._gitRunner.run(['rev-parse', 'HEAD']);
              const originalTip = tipRes.exitCode === 0 ? tipRes.stdout.trim() : '';
              if (!originalTip) {
                this._sendError(message.requestId, 'Failed to determine current HEAD');
                break;
              }

              // Use first-parent log for consistent ordering with the UI.
              const logRes = await this._gitRunner.run(['log', '--first-parent', '--format=%H']);
              if (logRes.exitCode !== 0) {
                this._sendError(message.requestId, 'Failed to fetch log for drop', logRes.stderr);
                break;
              }
              const allNewestFirst = logRes.stdout.trim().split('\n').filter(Boolean);
              const allOldestFirst = [...allNewestFirst].reverse();

              const selectedPositions = dropShas.map(sha => allOldestFirst.indexOf(sha));
              if (selectedPositions.some(p => p === -1)) {
                this._sendError(message.requestId, 'Drop failed: one or more selected commits are not on the current branch history.');
                break;
              }

              const startPos = Math.min(...selectedPositions);
              const rangeOldestFirst = allOldestFirst.slice(startPos);
              const startCommit = rangeOldestFirst[0];

              // Determine base (parent of range start). If range start is root, we currently don't support this.
              const parentsRes = await this._gitRunner.run(['rev-list', '--parents', '-n', '1', startCommit]);
              const parts = parentsRes.exitCode === 0 ? parentsRes.stdout.trim().split(' ') : [];
              if (parts.length < 2) {
                this._sendError(message.requestId, 'Cannot drop commits when the operation includes the root commit (not supported yet).');
                break;
              }
              const baseSha = parts[1];

              // For now, only support linear history (no merge commits) in the rewritten range.
              let hasMergeCommit = false;
              for (const sha of rangeOldestFirst) {
                const p = await this._gitRunner.run(['rev-list', '--parents', '-n', '1', sha]);
                const toks = p.exitCode === 0 ? p.stdout.trim().split(' ').filter(Boolean) : [];
                if (toks.length > 2) {
                  this._sendError(message.requestId, 'Drop is not supported for merge commits yet.');
                  hasMergeCommit = true;
                  break;
                }
              }
              if (hasMergeCommit) break;

              const selectedSet = new Set(dropShas);
              const remainingSeq = rangeOldestFirst.filter(sha => !selectedSet.has(sha));
              const dropCount = rangeOldestFirst.length - remainingSeq.length;

              if (dropCount <= 0) {
                this._sendResponse(message.requestId, { newHead: originalTip });
                break;
              }

              const confirm = await vscode.window.showWarningMessage(
                `Drop ${dropCount} commit(s) and rewrite history on ${originalBranch}? This will rewrite ${remainingSeq.length} commit(s) that come after the oldest dropped commit.`,
                { modal: true },
                'Drop'
              );
              if (confirm !== 'Drop') {
                this._sendError(message.requestId, 'Drop cancelled');
                break;
              }

              const tmpBranch = `cgg-tmp-drop-${Date.now()}`;
              await this._gitRunner.run(['branch', tmpBranch, originalTip]);

              const restoreOriginal = async () => {
                await this._gitRunner!.run(['checkout', originalBranch]);
                await this._gitRunner!.run(['reset', '--hard', originalTip]);
              };

              try {
                const checkoutBase = await this._gitRunner.run(['checkout', '--detach', baseSha]);
                if (checkoutBase.exitCode !== 0) {
                  this._sendError(message.requestId, 'Failed to checkout base for drop', checkoutBase.stderr);
                  await restoreOriginal();
                  break;
                }

                let cherryFailed = false;
                for (const sha of remainingSeq) {
                  const cherryRes = await this._gitRunner.run(['cherry-pick', sha], 600000);
                  if (cherryRes.exitCode !== 0) {
                    await this._gitRunner.run(['cherry-pick', '--abort']);
                    await restoreOriginal();
                    this._sendError(
                      message.requestId,
                      'Drop failed due to conflicts while rewriting history. Your branch was restored.',
                      cherryRes.stderr
                    );
                    cherryFailed = true;
                    break;
                  }
                }
                if (cherryFailed) break;

                const newTipRes = await this._gitRunner.run(['rev-parse', 'HEAD']);
                const newTip = newTipRes.exitCode === 0 ? newTipRes.stdout.trim() : '';
                if (!newTip) {
                  await restoreOriginal();
                  this._sendError(message.requestId, 'Drop failed: could not resolve new HEAD.');
                  break;
                }

                const checkoutBranch = await this._gitRunner.run(['checkout', originalBranch]);
                if (checkoutBranch.exitCode !== 0) {
                  await restoreOriginal();
                  this._sendError(message.requestId, 'Drop failed: could not return to branch.', checkoutBranch.stderr);
                  break;
                }

                const resetBranch = await this._gitRunner.run(['reset', '--hard', newTip]);
                if (resetBranch.exitCode !== 0) {
                  await restoreOriginal();
                  this._sendError(message.requestId, 'Drop failed: could not move branch to new history.', resetBranch.stderr);
                  break;
                }

                this._notifyRepoChanged('drop');
                this._sendResponse(message.requestId, { newHead: newTip });
              } finally {
                // Best-effort cleanup of temp branch.
                await this._gitRunner.run(['branch', '-D', tmpBranch]);
              }
            }
            break;
          case 'git/moveCommits':
            if (!this._gitRunner) return;
            {
              const shas: string[] = Array.isArray(message.payload?.shas)
                ? (message.payload.shas as any[]).map(s => String(s)).filter(s => s && s !== GitGraphViewProvider.UNCOMMITTED_SHA)
                : [];
              const beforeSha: string | null =
                message.payload?.beforeSha === null || message.payload?.beforeSha === undefined
                  ? null
                  : String(message.payload.beforeSha);

              if (shas.length < 1) {
                this._sendError(message.requestId, 'Invalid selection for move');
                break;
              }

              if (!(await this._ensureClean('Moving commits rewrites history. You have local changes. Continue?'))) {
                this._sendError(message.requestId, 'Move cancelled');
                break;
              }

              const branchRes = await this._gitRunner.run(['symbolic-ref', '--quiet', '--short', 'HEAD']);
              const originalBranch = branchRes.exitCode === 0 ? branchRes.stdout.trim() : null;
              if (!originalBranch) {
                this._sendError(message.requestId, 'Move is not supported in detached HEAD state. Checkout a branch first.');
                break;
              }

              const tipRes = await this._gitRunner.run(['rev-parse', 'HEAD']);
              const originalTip = tipRes.exitCode === 0 ? tipRes.stdout.trim() : '';
              if (!originalTip) {
                this._sendError(message.requestId, 'Failed to determine current HEAD');
                break;
              }

              // Use first-parent log for consistent ordering with the UI.
              const logRes = await this._gitRunner.run(['log', '--first-parent', '--format=%H']);
              if (logRes.exitCode !== 0) {
                this._sendError(message.requestId, 'Failed to fetch log for move', logRes.stderr);
                break;
              }
              const allNewestFirst = logRes.stdout.trim().split('\n').filter(Boolean);
              const allOldestFirst = [...allNewestFirst].reverse();

              const selectedPositions = shas.map(sha => allOldestFirst.indexOf(sha));
              if (selectedPositions.some(p => p === -1)) {
                this._sendError(message.requestId, 'Move failed: one or more selected commits are not on the current branch history.');
                break;
              }

              const beforePos = beforeSha ? allOldestFirst.indexOf(beforeSha) : -1;
              if (beforeSha && beforePos === -1) {
                this._sendError(message.requestId, 'Move failed: drop target commit is not on the current branch history.');
                break;
              }

              const startPos = Math.min(...selectedPositions, ...(beforePos >= 0 ? [beforePos] : []));
              const rangeOldestFirst = allOldestFirst.slice(startPos);
              const startCommit = rangeOldestFirst[0];

              // Determine base (parent of range start). If range start is root, we currently don't support this.
              const parentsRes = await this._gitRunner.run(['rev-list', '--parents', '-n', '1', startCommit]);
              const parts = parentsRes.exitCode === 0 ? parentsRes.stdout.trim().split(' ') : [];
              if (parts.length < 2) {
                this._sendError(message.requestId, 'Cannot move commits when the operation includes the root commit (not supported yet).');
                break;
              }
              const baseSha = parts[1];

              // For now, only support linear history (no merge commits) in the rewritten range.
              let hasMergeCommit = false;
              for (const sha of rangeOldestFirst) {
                const p = await this._gitRunner.run(['rev-list', '--parents', '-n', '1', sha]);
                const toks = p.exitCode === 0 ? p.stdout.trim().split(' ').filter(Boolean) : [];
                if (toks.length > 2) {
                  this._sendError(message.requestId, 'Move is not supported for merge commits yet.');
                  hasMergeCommit = true;
                  break;
                }
              }
              if (hasMergeCommit) break;

              const selectedSet = new Set(shas);
              const selectedInOrder = rangeOldestFirst.filter(s => selectedSet.has(s));
              const remaining = rangeOldestFirst.filter(s => !selectedSet.has(s));

              if (selectedInOrder.length === 0) {
                this._sendError(message.requestId, 'Move failed: selection is empty after filtering.');
                break;
              }

              // IMPORTANT: The webview uses newest-first ordering. "beforeSha" represents the commit BELOW the
              // visible insertion gap in the UI (i.e. "insert before this commit" in newest-first).
              // Our replay order is oldest-first, so inserting "beforeSha" in newest-first maps to inserting
              // AFTER that same SHA in oldest-first.
              //
              // Example (newest-first): A, B, C. Move C above B => drop gap before B => beforeSha=B.
              // Oldest-first original: C, B, A. Desired oldest-first: B, C, A (C inserted after B).
              let newSeq: string[] = [];
              if (!beforeSha) {
                // Drop to end of newest-first list (bottom / oldest): becomes oldest in history replay.
                newSeq = [...selectedInOrder, ...remaining];
              } else if (selectedSet.has(beforeSha)) {
                // Dropping "inside" the moved group is a no-op.
                this._sendResponse(message.requestId, 'ok');
                break;
            } else {
                let inserted = false;
                for (const sha of rangeOldestFirst) {
                  if (selectedSet.has(sha)) continue;
                  newSeq.push(sha);
                  if (sha === beforeSha) {
                    newSeq.push(...selectedInOrder);
                    inserted = true;
                  }
                }
                if (!inserted) {
                  this._sendError(message.requestId, 'Move failed: drop target is outside the rewritten range.');
                  break;
                }
              }

              // No-op
              if (newSeq.length === rangeOldestFirst.length && newSeq.every((s, i) => s === rangeOldestFirst[i])) {
                this._sendResponse(message.requestId, 'ok');
                break;
              }

              const confirm = await vscode.window.showWarningMessage(
                `Move ${selectedInOrder.length} commit(s) and rewrite history on ${originalBranch}?`,
              { modal: true },
                'Move'
              );
              if (confirm !== 'Move') {
                this._sendError(message.requestId, 'Move cancelled');
                break;
              }

              const tmpBranch = `cgg-tmp-move-${Date.now()}`;
              await this._gitRunner.run(['branch', tmpBranch, originalTip]);

              const restoreOriginal = async () => {
                await this._gitRunner!.run(['checkout', originalBranch]);
                await this._gitRunner!.run(['reset', '--hard', originalTip]);
              };

              try {
                const checkoutBase = await this._gitRunner.run(['checkout', '--detach', baseSha]);
                if (checkoutBase.exitCode !== 0) {
                  this._sendError(message.requestId, 'Failed to checkout base for move', checkoutBase.stderr);
                  await restoreOriginal();
                  break;
                }

                // Map old commit SHAs -> new commit SHAs produced by cherry-pick, for UI animation.
                // Note: ALL commits in the rewritten range get new SHAs, so we return a mapping for every replayed commit.
                const oldToNew: Record<string, string> = {};

                let cherryFailed = false;
                for (const sha of newSeq) {
                  const cherryRes = await this._gitRunner.run(['cherry-pick', sha], 600000);
                  if (cherryRes.exitCode !== 0) {
                    await this._gitRunner.run(['cherry-pick', '--abort']);
                    await restoreOriginal();
                    this._sendError(
                      message.requestId,
                      'Move failed due to conflicts while rewriting history. Your branch was restored.',
                      cherryRes.stderr
                    );
                    cherryFailed = true;
                    break;
                  }

                  const headRes = await this._gitRunner.run(['rev-parse', 'HEAD']);
                  const newSha = headRes.exitCode === 0 ? headRes.stdout.trim() : '';
                  if (newSha) oldToNew[sha] = newSha;
                }
                if (cherryFailed) break;

                const newTipRes = await this._gitRunner.run(['rev-parse', 'HEAD']);
                const newTip = newTipRes.exitCode === 0 ? newTipRes.stdout.trim() : '';
                if (!newTip) {
                  await restoreOriginal();
                  this._sendError(message.requestId, 'Move failed: could not resolve new HEAD.');
                  break;
                }

                const checkoutBranch = await this._gitRunner.run(['checkout', originalBranch]);
                if (checkoutBranch.exitCode !== 0) {
                  await restoreOriginal();
                  this._sendError(message.requestId, 'Move failed: could not return to branch.', checkoutBranch.stderr);
                  break;
                }

                const resetBranch = await this._gitRunner.run(['reset', '--hard', newTip]);
                if (resetBranch.exitCode !== 0) {
                  await restoreOriginal();
                  this._sendError(message.requestId, 'Move failed: could not move branch to new history.', resetBranch.stderr);
                  break;
                }

                this._notifyRepoChanged('move');
                this._sendResponse(message.requestId, { movedOldToNew: oldToNew });
              } finally {
                // Best-effort cleanup of temp branch.
                await this._gitRunner.run(['branch', '-D', tmpBranch]);
              }
            }
            break;
        }
      } catch (err: any) {
        this._outputChannel.appendLine(`Error processing message: ${err.message}`);
        this._sendError(message.requestId, err.message);
      }
    });

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.onDidDispose(() => {
      this._disposables.forEach(d => d.dispose());
      this._disposables = [];
    });
  }

  private async _ensureClean(message = 'You have local changes. Continue?'): Promise<boolean> {
    if (!this._gitRunner) return false;
    const status = await this._gitRunner.run(['status', '--porcelain']);
    if (status.stdout.trim().length > 0) {
      const result = await vscode.window.showWarningMessage(message, { modal: true }, 'Continue');
      return result === 'Continue';
    }
    return true;
  }

  private _parseChanges(stdout: string) {
    const lines = stdout.split('\n').filter(l => l.trim().length > 0);
    return lines.map(line => {
      const parts = line.split('\t');
      const status = parts[0][0] as any;
      if (status === 'R' || status === 'C') {
        return { status, oldPath: parts[1], path: parts[2] };
      }
      return { status, path: parts[1] };
    });
  }

  private async _resolveRepo() {
    this._outputChannel.appendLine('Resolving repository...');

    // 0. If user already selected a repo, prefer it.
    if (this._selectedRepoRoot) {
      this._outputChannel.appendLine(`Using selected repo: ${this._selectedRepoRoot}`);
      await this._updateRepo(this._selectedRepoRoot);
      return;
    }

    // 0b. Prefer VS Code's native Git "active" repository if available.
    // The Git extension generally keeps the currently selected repository first.
    try {
      const gitExt = vscode.extensions.getExtension('vscode.git');
      if (gitExt && !gitExt.isActive) {
        await gitExt.activate();
      }
      const git = (gitExt as any)?.exports?.getAPI?.(1);
      const repo0 = git?.repositories?.[0];
      const nativeRoot = repo0?.rootUri?.fsPath;
      if (nativeRoot) {
        this._outputChannel.appendLine(`Resolved repo root from VS Code Git API: ${nativeRoot}`);
        await this._updateRepo(nativeRoot);
        return;
      }
    } catch {
      // ignore
    }
    
    // 1. Try active text editor first
    if (vscode.window.activeTextEditor) {
      const uri = vscode.window.activeTextEditor.document.uri;
      this._outputChannel.appendLine(`Checking active editor: ${uri.fsPath}`);
      const root = await GitRunner.getRepoRoot(uri);
      if (root) {
        this._outputChannel.appendLine(`Resolved repo root from active editor: ${root}`);
        await this._updateRepo(root);
        return;
      }
    }

    // 2. Fallback: Try all workspace folders
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        this._outputChannel.appendLine(`Checking workspace folder: ${folder.uri.fsPath}`);
        const root = await GitRunner.getRepoRoot(folder.uri);
        if (root) {
          this._outputChannel.appendLine(`Resolved repo root from workspace folder: ${root}`);
          await this._updateRepo(root);
          return;
        }
      }
    }

    this._outputChannel.appendLine('No git repository found in active editor or any workspace folders.');
    this._gitRunner = undefined;
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }

  private async _updateRepo(root: string) {
    if (this._gitRunner && this._gitRunner.cwd === root) {
      return;
    }

    this._gitRunner = new GitRunner(root);
    this._gitRunnersByRoot.set(root, this._gitRunner);
    
    // Setup file watchers and listeners for refresh
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];

    const notify = (reason?: string) => this._notifyRepoChanged(reason);

    const normalizePath = (p: string) => {
      try {
        p = fs.realpathSync(p);
      } catch {
        // ignore
      }
      // Ensure no trailing separator + consistent resolution
      return path.resolve(p);
    };
    const rootNorm = normalizePath(root);

    const isRelevantFsPath = (fsPath: string) => {
      if (!fsPath) return false;
      const abs = normalizePath(fsPath);
      const rel = path.relative(rootNorm, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
      const parts = rel.split(path.sep);
      const top = parts[0];
      return top !== 'dist' && top !== 'node_modules' && top !== '.git';
    };

    // 1. Prefer VS Code's built-in Git extension events for working tree / index changes.
    // This is much more accurate than watching the filesystem, and lets us ignore noisy build output.
    try {
      const gitExt = vscode.extensions.getExtension('vscode.git');
      if (gitExt && !gitExt.isActive) {
        await gitExt.activate();
      }
      const git = gitExt?.exports?.getAPI?.(1);
      if (git) {
        const findBestRepo = () => {
          const repos = (git.repositories || [])
            .map((r: any) => {
              const p = r?.rootUri?.fsPath;
              if (!p) return null;
              const repoRootNorm = normalizePath(p);
              return { repo: r, repoRootNorm };
            })
            .filter(Boolean) as Array<{ repo: any; repoRootNorm: string }>;

          // Prefer exact match, else prefer the deepest repo whose root is a parent of our root.
          const exact = repos.find(r => r.repoRootNorm === rootNorm);
          if (exact) return exact.repo;

          const parents = repos
            .filter(r => rootNorm === r.repoRootNorm || rootNorm.startsWith(r.repoRootNorm + path.sep))
            .sort((a, b) => b.repoRootNorm.length - a.repoRootNorm.length);
          return parents[0]?.repo;
        };

        const attach = (repo: any) => {
          // Only notify if the change set includes something other than dist/node_modules churn.
          const shouldNotify = () => {
            const changes = [
              ...(repo?.state?.workingTreeChanges || []),
              ...(repo?.state?.indexChanges || []),
              ...(repo?.state?.mergeChanges || [])
            ];
            if (changes.length === 0) return true; // branch/HEAD updates can still matter
            return changes.some((c: any) => isRelevantFsPath(c?.uri?.fsPath || ''));
          };

          this._disposables.push(repo.state.onDidChange(() => {
            if (shouldNotify()) notify('git api');
          }));
        };

        const repo = findBestRepo();
        if (repo) {
          attach(repo);
        }

        if (git.onDidOpenRepository) {
          this._disposables.push(git.onDidOpenRepository((r: any) => {
            const p = r?.rootUri?.fsPath;
            if (p && normalizePath(p) === rootNorm) attach(r);
          }));
        }
      }
    } catch {
      // Ignore: we'll fall back to .git watchers below.
    }

    // 1b. Low-cost workspace events for working tree changes (no polling, no keystroke spam).
    // This improves reliability when the Git extension isn't available / doesn't attach cleanly.
    this._disposables.push(vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.uri.scheme === 'file' && isRelevantFsPath(doc.uri.fsPath)) notify('save');
    }));
    this._disposables.push(vscode.workspace.onDidCreateFiles(e => {
      if (e.files.some(u => u.scheme === 'file' && isRelevantFsPath(u.fsPath))) notify('create');
    }));
    this._disposables.push(vscode.workspace.onDidDeleteFiles(e => {
      if (e.files.some(u => u.scheme === 'file' && isRelevantFsPath(u.fsPath))) notify('delete');
    }));
    this._disposables.push(vscode.workspace.onDidRenameFiles(e => {
      if (e.files.some(f =>
        (f.oldUri.scheme === 'file' && isRelevantFsPath(f.oldUri.fsPath)) ||
        (f.newUri.scheme === 'file' && isRelevantFsPath(f.newUri.fsPath))
      )) notify('rename');
    }));
    this._disposables.push(vscode.window.onDidChangeWindowState(e => {
      // When the window regains focus, refresh to pick up external git operations / file changes.
      if (e.focused) notify('focus');
    }));

    // If the user clicks in an editor, treat it as Escape in the webview.
    // Used to cancel transient UI states (e.g. move mode, commit error banner).
    this._disposables.push(vscode.window.onDidChangeTextEditorSelection(e => {
      if (!this._view?.visible) return;
      if (e.kind !== vscode.TextEditorSelectionChangeKind.Mouse) return;
      this._view?.webview.postMessage({ type: 'ui/escape' });
    }));

    // 2. Watch .git changes (HEAD, refs, index) as a fallback / for non-working-tree events.
    // Note: we intentionally do NOT watch the entire workspace. Dev builds commonly write to `dist/`
    // on every save, which would otherwise cause a noisy refresh loop.
    const gitPattern = new vscode.RelativePattern(root, '.git/{HEAD,packed-refs,refs/**,index}');
    const repoWatcher = vscode.workspace.createFileSystemWatcher(gitPattern);
    this._disposables.push(repoWatcher);
    repoWatcher.onDidChange(() => notify('git metadata'));
    repoWatcher.onDidCreate(() => notify('git metadata'));
    repoWatcher.onDidDelete(() => notify('git metadata'));
  }

  private _sendResponse(requestId: string, data: any) {
    this._view?.webview.postMessage({
      type: 'ok',
      requestId,
      data
    } as ResponseMessage);
  }

  private _sendError(requestId: string, message: string, details?: string) {
    this._view?.webview.postMessage({
      type: 'error',
      requestId,
      message,
      details
    } as ResponseMessage);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css')
    );
    const codiconsUri = webview.asWebviewUri(
      // NOTE: Do not reference codicons from node_modules at runtime; packaged VSIX may not include it.
      // We copy the minimal codicons assets into dist/ during packaging.
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'codicons', 'codicon.css')
    );
    const iconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'icons')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <link href="${codiconsUri}" rel="stylesheet">
    <script nonce="${nonce}">
        window.iconsUri = "${iconsUri}";
    </script>
    <title>GitBit</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
