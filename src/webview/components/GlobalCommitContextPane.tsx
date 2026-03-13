import React from 'react';
import { Commit, GlobalCommitContextResponse } from '../../extension/protocol/types';
import { request, vscode } from '../state/vscode';
import { Graph } from './Graph';
import { GraphLayout } from '../state/GraphLayout';

export interface GlobalCommitSelection {
  repoRoot: string;
  repoLabel: string;
  commit: Commit;
}

interface GlobalCommitContextPaneProps {
  selection: GlobalCommitSelection | null;
  refreshKey: number;
}

export const GlobalCommitContextPane: React.FC<GlobalCommitContextPaneProps> = ({
  selection,
  refreshKey
}) => {
  const [baseBranch, setBaseBranch] = React.useState('');
  const [context, setContext] = React.useState<GlobalCommitContextResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selection) {
      setBaseBranch('');
      setContext(null);
      setError(null);
      setLoading(false);
      return;
    }
    const state = vscode.getState?.() || {};
    const byRepo = (state.globalBaseBranchByRepo || {}) as Record<string, string>;
    setBaseBranch(String(byRepo[selection.repoRoot] || ''));
  }, [selection]);

  React.useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    request<GlobalCommitContextResponse>('search/globalCommitContext', {
      repoRoot: selection.repoRoot,
      sha: selection.commit.sha,
      baseBranch: baseBranch || undefined
    })
      .then((res) => {
        if (cancelled) return;
        setContext(res);
        if (res.resolvedBaseBranch && res.resolvedBaseBranch !== baseBranch) {
          setBaseBranch(res.resolvedBaseBranch);
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setContext(null);
        setError(err?.message || 'Failed to load commit context');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection, baseBranch, refreshKey]);

  React.useEffect(() => {
    if (!selection || !baseBranch) return;
    const state = vscode.getState?.() || {};
    const byRepo = (state.globalBaseBranchByRepo || {}) as Record<string, string>;
    vscode.setState?.({
      ...state,
      globalBaseBranchByRepo: {
        ...byRepo,
        [selection.repoRoot]: baseBranch
      }
    });
  }, [selection, baseBranch]);

  const graphCommits = React.useMemo(() => GraphLayout.compute(context?.commits || []), [context?.commits]);

  if (!selection) {
    return (
      <div className="global-context-empty">
        Select a commit in global search to inspect branch placement.
      </div>
    );
  }

  return (
    <div className="global-context-pane">
      <div className="global-context-header">
        <div className="global-context-title">Commit Placement</div>
        <div className="global-context-repo" title={selection.repoRoot}>
          {selection.repoLabel}
        </div>
      </div>

      <div className="global-context-controls">
        <label>Base branch</label>
        <select
          value={baseBranch}
          onChange={(e) => setBaseBranch(e.target.value)}
          disabled={loading || !context || context.baseBranchOptions.length === 0}
          title="Choose which branch to treat as the mainline"
        >
          {(context?.baseBranchOptions || []).map(ref => (
            <option key={ref} value={ref}>{ref}</option>
          ))}
        </select>
      </div>

      <div className="global-context-meta">
        <div className={`global-context-status ${context?.containsBaseBranch ? 'on-base' : 'off-base'}`}>
          {context?.containsBaseBranch ? 'On base branch' : 'Not on base branch'}
        </div>
      </div>

      <div className="global-context-branches">
        <div>
          <strong>Local:</strong>{' '}
          {context?.containingLocalBranches.length ? context.containingLocalBranches.join(', ') : 'none'}
        </div>
        <div>
          <strong>Remote:</strong>{' '}
          {context?.containingRemoteBranches.length ? context.containingRemoteBranches.join(', ') : 'none'}
        </div>
      </div>

      {loading && <div className="global-context-loading">Loading commit placement...</div>}
      {error && <div className="global-context-error">{error}</div>}

      {!loading && !error && (
        <div className="global-context-graph">
          <div className="global-context-graph-hint">Latest at top</div>
          {graphCommits.length === 0 && (
            <div className="global-context-empty">No graph data available for this commit.</div>
          )}
          {graphCommits.map(gc => (
            <div
              key={gc.sha}
              className={`global-context-row ${gc.sha === selection.commit.sha ? 'is-selected' : ''}`}
              title={`${gc.sha}\n${gc.subject}`}
            >
              <div className="global-context-row-graph">
                <Graph commit={gc} />
              </div>
              <div className="global-context-row-body">
                <div className="global-context-row-title">
                  <span className="global-context-row-sha">{gc.sha.slice(0, 8)}</span>
                  <span className="global-context-row-subject">{gc.subject}</span>
                </div>
                <div className="global-context-row-meta">
                  {gc.authorName}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

