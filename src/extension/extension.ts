import * as vscode from 'vscode';
import { GitGraphViewProvider } from './GitGraphViewProvider';
import { GitContentProvider } from './git/GitContentProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new GitGraphViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      GitGraphViewProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      GitContentProvider.scheme,
      new GitContentProvider((uri) => provider.getGitRunnerForUri(uri), provider.outputChannel)
    )
  );
}

export function deactivate() {}
