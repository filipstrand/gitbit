import React, { useEffect, useMemo, useState } from 'react';
import { useCommitDetails } from '../state/useCommitDetails';
import { FileTree } from './FileTree';
import { Change } from '../../extension/protocol/types';
import { request, vscode } from '../state/vscode';

interface DetailsPaneProps {
  sha: string | null;
}

export const DetailsPane: React.FC<DetailsPaneProps> = ({ sha }) => {
  const { details, changes, loading } = useCommitDetails(sha);
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [revertSelectedPaths, setRevertSelectedPaths] = useState<Set<string>>(new Set());
  const [commitSubmitting, setCommitSubmitting] = useState(false);
  const [commitError, setCommitError] = useState<{ title: string; details?: string; isRuff?: boolean } | null>(null);
  const [showFullMessage, setShowFullMessage] = useState(false);

  if (!sha) return <div style={{ padding: '16px', opacity: 0.6 }}>Select a commit to see details</div>;

  const performCommit = async (opts?: { amend?: boolean }) => {
    if (commitSubmitting) return;
    const amend = !!opts?.amend;
    const message = commitMessage.trim();
    if (!amend && !message) return;

    if (selectedPaths.size === 0) return;
    const paths = Array.from(selectedPaths);

    setCommitSubmitting(true);
    setCommitError(null);
    try {
      await request('git/commit', { message, paths, amend });
      setCommitMessage('');
      setSelectedPaths(new Set());
    } catch (e: any) {
      const details = typeof e?.details === 'string' ? e.details : undefined;
      const title = e?.message || 'Commit failed';
      const isRuff = /(^|\b)ruff(\b|:|-)/i.test(`${title}\n${details || ''}`);
      setCommitError({ title, details, isRuff });
    } finally {
      setCommitSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      performCommit();
    }
  };

  const handleFileDiff = (change: Change) => {
    if (!details) return;
    const isRoot = details.parents.length === 0;
    const base = details.sha === 'UNCOMMITTED' ? 'HEAD' : (isRoot ? '4b825dc642cb6eb9a060e54bf8d69288fbee4904' : `${details.sha}^`);
    
    vscode.postMessage({
      type: 'file/diff',
      requestId: `diff-${Date.now()}`,
      payload: {
        base,
        target: details.sha,
        path: change.path,
        oldPath: change.oldPath,
        status: change.status
      }
    });
  };

  const handleFileClick = (change: Change) => {
    if (!details) return;
    
    const isRoot = details.parents.length === 0;
    const base = details.sha === 'UNCOMMITTED'
      ? 'HEAD'
      : (isRoot ? '4b825dc642cb6eb9a060e54bf8d69288fbee4904' : `${details.sha}^`);
    
    vscode.postMessage({
      type: 'file/open',
      requestId: `open-${Date.now()}`,
      payload: {
        sha: details.sha,
        base,
        target: details.sha,
        path: change.path,
        oldPath: change.oldPath,
        status: change.status
      }
    });
  };

  const handleDiscard = (paths: string[]) => {
    vscode.postMessage({
      type: 'git/discard',
      requestId: `discard-${Date.now()}`,
      payload: { paths }
    });
  };

  const handleRevertCommitted = (changesToRevert: Change[]) => {
    if (!details || details.sha === 'UNCOMMITTED') return;
    const isRoot = details.parents.length === 0;
    const base = isRoot ? '4b825dc642cb6eb9a060e54bf8d69288fbee4904' : `${details.sha}^`;

    vscode.postMessage({
      type: 'git/revertFiles',
      requestId: `revert-files-${Date.now()}`,
      payload: {
        sha: details.sha,
        base,
        files: changesToRevert.map(c => ({
          path: c.path,
          oldPath: c.oldPath,
          status: c.status
        }))
      }
    });
  };

  const copySha = () => {
    if (details && details.sha !== 'UNCOMMITTED') {
      vscode.postMessage({
        type: 'app/copyToClipboard',
        payload: { text: details.sha }
      });
    }
  };

  const isUncommitted = details?.sha === 'UNCOMMITTED';
  const allFilePaths = isUncommitted ? changes.map(c => c.path) : [];
  const hasExtendedMessage = !!details && !isUncommitted && details.message.trim() !== details.subject.trim();

  // Collapse the full message when switching commits.
  useEffect(() => {
    setShowFullMessage(false);
    setRevertSelectedPaths(new Set());
  }, [details?.sha]);

  // Clear stale uncommitted commit errors whenever the working tree changes.
  // This prevents old hook output from reappearing after the user reverts / edits files.
  const uncommittedChangesKey = useMemo(() => {
    if (!isUncommitted) return '';
    return changes
      .map(c => `${c.status}:${c.path}:${c.oldPath || ''}`)
      .sort()
      .join('|');
  }, [isUncommitted, changes]);

  useEffect(() => {
    if (!isUncommitted) {
      if (commitError) setCommitError(null);
      return;
    }
    if (commitError) setCommitError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uncommittedChangesKey]);

  const selectAll = () => setSelectedPaths(new Set(allFilePaths));
  const clearSelection = () => setSelectedPaths(new Set());
  const toggleSelect = (path: string, selected: boolean) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (selected) next.add(path);
      else next.delete(path);
      return next;
    });
  };

  const toggleRevertSelect = (path: string, selected: boolean) => {
    setRevertSelectedPaths(prev => {
      const next = new Set(prev);
      if (selected) next.add(path);
      else next.delete(path);
      return next;
    });
  };

  const commitSelectionLabel = useMemo(() => {
    if (selectedPaths.size > 0) return `Committing ${selectedPaths.size} selected file(s)`;
    return 'No files selected';
  }, [selectedPaths.size]);

  const hasCommitBox = isUncommitted || (hasExtendedMessage && showFullMessage);

  const formatDateYYYYMMDD = (iso: string) => {
    if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10);
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  return (
    <div className={`details-pane ${hasCommitBox ? 'has-commit-box' : ''} ${isUncommitted ? 'uncommitted' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {loading && !details ? (
        <div style={{ padding: '16px' }}>Loading...</div>
      ) : !details ? (
        <div style={{ padding: '16px' }}>Failed to load details</div>
      ) : (
        <>
          <div className={`details-header ${isUncommitted ? 'uncommitted' : ''}`}>
            <div className="subject">
              {hasExtendedMessage && (
                <span
                  className={`codicon ${showFullMessage ? 'codicon-chevron-down' : 'codicon-chevron-right'} commit-message-toggle`}
                  role="button"
                  tabIndex={0}
                  title={showFullMessage ? 'Hide commit message' : 'Show commit message'}
                  onClick={() => setShowFullMessage(v => !v)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setShowFullMessage(v => !v);
                    }
                  }}
                />
              )}
              <span>{details.subject}</span>
            </div>
            {!isUncommitted && (
              <div className="meta">
                <div style={{ marginBottom: '2px' }}>
                  <span style={{ fontWeight: 'bold' }}>{details.authorName}</span>
                  <span style={{ margin: '0 4px', opacity: 0.6 }}>&lt;{details.authorEmail}&gt;</span>
                </div>
                <div style={{ opacity: 0.6 }}>
                  <span 
                    style={{ cursor: 'pointer', textDecoration: 'underline' }} 
                    title="Click to copy SHA"
                    onClick={copySha}
                  >
                    {details.sha.substring(0, 8)}
                  </span> • {formatDateYYYYMMDD(details.authorDateIso)}
                </div>
              </div>
            )}
          </div>
          <div className="details-body" style={{ flex: 1, overflowY: 'auto' }}>
            {isUncommitted ? (
              <div className="commit-box-container">
                <textarea
                  className="commit-message-input"
                  placeholder="Commit message..."
                  value={commitMessage}
                  onChange={(e) => {
                    setCommitMessage(e.target.value);
                    if (commitError) setCommitError(null);
                  }}
                  onKeyDown={handleKeyDown}
                />
                <div className="commit-selection-row">
                  <div style={{ opacity: 0.7 }}>
                    <span>{commitSelectionLabel}</span>
                  </div>
                </div>
                {commitError && (
                  <div className={`commit-error-banner ${commitError.isRuff ? 'ruff' : ''}`}>
                    <span
                      className="codicon codicon-copy commit-error-copy"
                      title="Copy error to clipboard"
                      onClick={() => {
                        const title = commitError.isRuff ? 'Commit blocked by ruff hook' : commitError.title;
                        const text = `${title}${commitError.details ? `\n\n${commitError.details.trim()}` : ''}`;
                        vscode.postMessage({ type: 'app/copyToClipboard', payload: { text } });
                      }}
                    />
                    <div style={{ fontWeight: 600 }}>{commitError.isRuff ? 'Commit blocked by ruff hook' : commitError.title}</div>
                    {commitError.details && (
                      <pre className="commit-error-details">{commitError.details.trim()}</pre>
                    )}
                  </div>
                )}
                <div className="commit-actions-row">
                  <button
                    className={`toolbar-button commit-button ${commitError?.isRuff ? 'commit-error' : ''}`}
                    onClick={() => performCommit()}
                    disabled={selectedPaths.size === 0 || !commitMessage.trim() || commitSubmitting}
                  >
                    {commitSubmitting ? 'Committing…' : 'Commit'}
                  </button>
                  <button
                    className="toolbar-button commit-button amend-button"
                    onClick={() => performCommit({ amend: true })}
                    disabled={selectedPaths.size === 0 || commitSubmitting}
                    title={commitMessage.trim() ? 'Amend last commit (update message and include staged changes)' : 'Amend last commit (keep message and include staged changes)'}
                  >
                    Amend
                  </button>
                </div>
              </div>
            ) : (
              hasExtendedMessage && showFullMessage && (
                <div className="commit-box-container">
                  <div className="commit-message-display">
                    {details.message}
                  </div>
                </div>
              )
            )}
            <div className="changed-files-header">
              <div className="changed-files-title">Changed Files</div>
              {isUncommitted && (
                <div className="changed-files-actions">
                  <button className="toolbar-button secondary" onClick={selectAll} disabled={allFilePaths.length === 0}>
                    Select all
                  </button>
                  <button className="toolbar-button secondary" onClick={clearSelection} disabled={selectedPaths.size === 0}>
                    Clear
                  </button>
                </div>
              )}
            </div>
            <FileTree 
              changes={changes} 
              onFileClick={handleFileClick} 
              onSecondaryAction={handleFileDiff}
              onRevertCommitted={isUncommitted ? undefined : handleRevertCommitted}
              onDiscard={isUncommitted ? handleDiscard : undefined} 
              selectable={isUncommitted}
              multiSelect={!isUncommitted}
              selectedPaths={isUncommitted ? selectedPaths : revertSelectedPaths}
              onToggleSelect={isUncommitted ? toggleSelect : toggleRevertSelect}
            />
          </div>
        </>
      )}
    </div>
  );
};
