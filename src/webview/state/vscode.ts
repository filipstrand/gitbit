declare const acquireVsCodeApi: () => any;

let vscodeApi: any;
try {
  vscodeApi = acquireVsCodeApi();
} catch (e) {
  // Fallback for browser testing if needed
  vscodeApi = {
    postMessage: (msg: any) => console.log('VSCode PostMessage:', msg),
    getState: () => ({}),
    setState: (s: any) => {}
  };
}

export const vscode = vscodeApi;

export function request<T>(type: string, payload?: any): Promise<T> {
  const requestId = Math.random().toString(36).substring(2);
  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.requestId === requestId) {
        window.removeEventListener('message', handler);
        if (message.type === 'ok') {
          resolve(message.data);
        } else {
          const err: any = new Error(message.message || 'Unknown error');
          err.details = message.details;
          err.data = message.data;
          reject(err);
        }
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type, requestId, payload });
  });
}
