const disposable = { dispose: () => {} };

export const window = {
  createOutputChannel: () => ({
    appendLine: () => {},
    dispose: () => {}
  }),
  showWarningMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  onDidChangeWindowState: () => disposable,
  onDidChangeTextEditorSelection: () => disposable,
  tabGroups: {
    all: [],
    onDidChangeTabs: () => disposable,
    close: async () => {}
  }
};

export const workspace = {
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
};

export const extensions = {
  getExtension: () => undefined
};

export const commands = {
  executeCommand: async () => undefined
};

export const TextEditorSelectionChangeKind = {
  Mouse: 2
};

export class RelativePattern {
  constructor(public base: string, public pattern: string) {}
}

export const Uri = {
  joinPath: (...parts: any[]) => ({ parts }),
  file: (fsPath: string) => ({ fsPath }),
  from: (v: any) => v
};

