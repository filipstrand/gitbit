import React, { useState, useEffect, useCallback } from 'react';
import { Change } from '../../extension/protocol/types';
import { request, vscode } from '../state/vscode';
import { FileTree } from './FileTree';

interface SquashPreviewProps {
  shas: string[];
  commits: any[];
}

export const SquashPreview: React.FC<SquashPreviewProps> = ({ shas, commits }) => {
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(false);
  const [rangeInfo, setRangeInfo] = useState<{ base: string, target: string } | null>(null);

  const fetch = useCallback(async (silent = false) => {
    if (shas.length < 2) return;

    const indices = shas.map(sha => commits.findIndex(c => c.sha === sha)).sort((a, b) => a - b);
    const newestIdx = indices[0];
    const oldestIdx = indices[indices.length - 1];

    if (newestIdx === -1 || oldestIdx === -1) return;

    const newestSha = commits[newestIdx].sha;
    const oldestCommit = commits[oldestIdx];
    const oldestSha = oldestCommit.sha;
    const isRoot = oldestCommit.parents.length === 0;
    const baseSha = isRoot ? '4b825dc642cb6eb9a060e54bf8d69288fbee4904' : `${oldestSha}^`;
    
    setRangeInfo({ base: baseSha, target: newestSha });

    if (!silent) setLoading(true);
    try {
      const data = await request<Change[]>('range/changes', { base: baseSha, target: newestSha });
      setChanges(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [shas, commits]);

  useEffect(() => {
    fetch(changes.length > 0); // Silent if we already have data
  }, [fetch]);

  useEffect(() => {
    let timer: any;
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'event/repoChanged' && shas.length >= 2) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          fetch(true); // Silent refresh for auto-updates
        }, 250);
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      clearTimeout(timer);
    };
  }, [fetch, shas]);

  const handleFileClick = (change: Change) => {
    vscode.postMessage({
      type: 'file/open',
      requestId: `open-${Date.now()}`,
      payload: { path: change.path }
    });
  };

  const handleFileDiff = (change: Change) => {
    if (!rangeInfo) return;
    vscode.postMessage({
      type: 'file/diff',
      requestId: `diff-${Date.now()}`,
      payload: {
        base: rangeInfo.base,
        target: rangeInfo.target,
        path: change.path,
        oldPath: change.oldPath,
        status: change.status
      }
    });
  };

  const handleSquash = () => {
    const selected = shas.filter(s => s && s !== 'UNCOMMITTED');
    if (selected.length < 2) return;
    vscode.postMessage({
      type: 'git/squash',
      requestId: `squash-${Date.now()}`,
      payload: { shas: selected }
    });
  };

  return (
    <div className="squash-preview" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="details-header" style={{ padding: '16px 16px 12px 16px', borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '15px' }}>Squash Preview</div>
            <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '4px' }}>{shas.length} commits selected</div>
          </div>
          <button 
            className="toolbar-button commit-button"
            style={{ width: 'auto', padding: '4px 12px' }}
            onClick={handleSquash}
          >
            <span className="codicon codicon-combine" />
            Squash
          </button>
        </div>
      </div>
      <div className="details-body" style={{ flex: 1, overflowY: 'auto' }}>
        {loading && changes.length === 0 ? (
          <div style={{ padding: '16px' }}>Computing squash preview...</div>
        ) : (
          <>
            <div style={{ padding: '16px 12px 8px 12px', fontWeight: 'bold', fontSize: '11px', color: 'var(--vscode-descriptionForeground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Combined Changes
            </div>
            <FileTree 
              changes={changes} 
              onFileClick={handleFileClick} 
              onSecondaryAction={handleFileDiff}
            />
          </>
        )}
      </div>
    </div>
  );
};
