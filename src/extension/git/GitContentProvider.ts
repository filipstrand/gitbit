import * as vscode from 'vscode';
import { GitRunner } from './GitRunner';

export class GitContentProvider implements vscode.TextDocumentContentProvider {
  public static readonly scheme = 'gitbit';

  constructor(
    private readonly _getGitRunner: (uri: vscode.Uri) => GitRunner | undefined,
    private readonly _outputChannel: vscode.OutputChannel
  ) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    this._outputChannel.appendLine(`[ContentProvider] Providing content for: ${uri.toString()}`);
    
    // Parse query: rev=<rev>&t=<timestamp>
    const params = new URLSearchParams(uri.query);
    const rev = params.get('rev') || uri.query;
    const path = uri.path.startsWith('/') ? uri.path.substring(1) : uri.path;

    if (!rev || rev === 'EMPTY' || rev === '4b825dc642cb6eb9a060e54bf8d69288fbee4904') {
      this._outputChannel.appendLine(`[ContentProvider] Returning empty content for EMPTY revision`);
      return '\n'; // Return a newline instead of empty string
    }

    const runner = this._getGitRunner(uri);
    if (!runner) {
      this._outputChannel.appendLine(`[ContentProvider] Error: No git runner available`);
      throw new Error('No git runner available for this URI');
    }

    const { stdout, exitCode, stderr } = await runner.run(['show', `${rev}:${path}`]);
    if (exitCode === 0) {
      const firstBytes = Array.from(stdout.substring(0, 10)).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
      this._outputChannel.appendLine(`[ContentProvider] Successfully fetched content (${stdout.length} bytes). First bytes: ${firstBytes}`);
      return stdout;
    }

    this._outputChannel.appendLine(`[ContentProvider] Error: git show failed: ${stderr}`);
    throw new Error(`Failed to get file content for ${rev}:${path}: ${stderr}`);
  }
}
