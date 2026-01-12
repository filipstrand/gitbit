import * as cp from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export class GitRunner {
  constructor(private readonly _cwd: string) {}

  public get cwd() { return this._cwd; }

  public async run(args: string[], timeout = 10000): Promise<GitResult> {
    const fullArgs = ['--no-pager', ...args];
    console.log(`[GitRunner] Running: git ${fullArgs.join(' ')} in ${this._cwd}`);
    return new Promise((resolve, reject) => {
      const child = cp.spawn('git', fullArgs, { cwd: this._cwd });
      const stdoutBuffers: Buffer[] = [];
      const stderrBuffers: Buffer[] = [];

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Command 'git ${fullArgs.join(' ')}' timed out after ${timeout}ms`));
      }, timeout);

      child.stdout.on('data', (data: Buffer) => {
        stdoutBuffers.push(data);
      });

      child.stderr.on('data', (data: Buffer) => {
        stderrBuffers.push(data);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        let stdout = Buffer.concat(stdoutBuffers).toString('utf8');
        let stderr = Buffer.concat(stderrBuffers).toString('utf8');
        
        // Remove UTF-8 BOM if present
        if (stdout.startsWith('\uFEFF')) {
          stdout = stdout.substring(1);
        }
        
        resolve({ stdout, stderr, exitCode: code });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  public static async getRepoRoot(uri: vscode.Uri): Promise<string | undefined> {
    try {
      // IMPORTANT:
      // Do NOT default to the workspace folder root as the git cwd. If the user opens a non-repo folder
      // (e.g. ~/Desktop) that contains repos one level down, using the workspace root will cause
      // `git rev-parse` to always fail, making nested repo discovery impossible.
      //
      // Instead, run git in the actual target directory (or the file's parent directory).
      let fsPath = uri.fsPath;
      let cwd = fsPath;

      try {
        const st = await fs.promises.stat(fsPath);
        if (st.isFile()) {
          cwd = path.dirname(fsPath);
        }
      } catch {
        // If stat fails (e.g. virtual doc), fall back to dirname.
        cwd = path.dirname(fsPath);
      }

      // Resolve symlinks when possible (macOS Desktop/iCloud can contain symlinked entries).
      try {
        cwd = fs.realpathSync(cwd);
      } catch {
        // ignore
      }

      const { stdout, exitCode } = await new GitRunner(cwd).run(['rev-parse', '--show-toplevel']);
      if (exitCode === 0) {
        return stdout.trim();
      }
    } catch (e) {
      console.error('Failed to get repo root:', e);
    }
    return undefined;
  }
}
