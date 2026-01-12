import React from 'react';
import { Commit } from '../../extension/protocol/types';
import { Graph } from './Graph';
import { vscode } from '../state/vscode';
import { GraphCommit, GraphLayout } from '../state/GraphLayout';

interface CommitRowProps {
  commit: GraphCommit;
  isSelected: boolean;
  onSelect: (sha: string, isMulti: boolean, isShift: boolean) => void;
  onContextMenu: (sha: string, x: number, y: number) => void;
  onDiscardAllUncommitted?: () => void;
  rowRef?: (el: HTMLDivElement | null) => void;
  getDragDirection?: () => 'up' | 'down' | null;
  getCurrentDropTarget?: () => string | null;
  nextSha?: string | null;
  moveMode?: boolean;
  draggedShas?: string[];
  isDropTarget?: boolean;
  movePending?: boolean;
  moveFailed?: boolean;
  onBeginDrag?: (sha: string) => string[];
  onDropBefore?: (beforeSha: string | null, draggedShas: string[]) => void;
  onHoverDropTarget?: (sha: string | null) => void;
  onDragFinished?: () => void;
}

export const CommitRow: React.FC<CommitRowProps> = ({
  commit,
  isSelected,
  onSelect,
  onContextMenu,
  onDiscardAllUncommitted,
  rowRef,
  getDragDirection,
  getCurrentDropTarget,
  nextSha = null,
  moveMode = false,
  draggedShas = [],
  isDropTarget = false,
  movePending = false,
  moveFailed = false,
  onBeginDrag,
  onDropBefore,
  onHoverDropTarget,
  onDragFinished
}) => {
  const handleClick = (e: React.MouseEvent) => {
    onSelect(commit.sha, e.metaKey || e.ctrlKey, e.shiftKey);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(commit.sha, e.clientX, e.clientY);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}, ${hh}:${mm}`;
  };

  const isUncommitted = commit.sha === 'UNCOMMITTED';
  const isMain = !isUncommitted && commit.refs?.some(ref => ref.name === 'main' || ref.name === 'origin/main' || ref.name === 'master' || ref.name === 'origin/master');
  const laneColor = GraphLayout.getLaneColor(commit.lane);

  const draggable = moveMode && !isUncommitted && !movePending;
  const isDragSource = draggedShas.includes(commit.sha);

  const wiggleStyle = React.useMemo(() => {
    if (!moveMode || isUncommitted) return undefined;
    const s = commit.sha || '';
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;

    const delayMs = (h % 140); // phase offset per row
    const durMs = 120 + (h % 70); // 120..189ms
    const ampDeg = 0.12 + ((h % 10) / 100); // 0.12..0.21deg (more subtle)

    return {
      ['--wiggle-delay' as any]: `-${delayMs}ms`,
      ['--wiggle-duration' as any]: `${durMs}ms`,
      ['--wiggle-amp' as any]: `${ampDeg}deg`,
    } as React.CSSProperties;
  }, [moveMode, isUncommitted, commit.sha]);

  const handleCopySha = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUncommitted) return;
    vscode.postMessage({
      type: 'app/copyToClipboard',
      payload: { text: commit.sha }
    });
  };

  const handleDiscardAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDiscardAllUncommitted?.();
  };

  return (
    <div 
      className={`commit-row ${isSelected ? 'selected' : ''} ${isMain ? 'special-branch' : ''} ${isUncommitted ? 'uncommitted' : ''} ${moveMode ? 'move-mode' : ''} ${isDropTarget ? 'drop-target' : ''} ${isDragSource ? 'drag-source' : ''} ${moveFailed ? 'move-failed' : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      data-sha={commit.sha}
      style={wiggleStyle}
      ref={rowRef}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = 'move';
        const shas = onBeginDrag?.(commit.sha) ?? [commit.sha];
        // Required by some browsers to initiate a drag.
        e.dataTransfer.setData('text/plain', shas.join(','));

        // Provide a drag image that looks like the actual row (some webviews/platforms render the default ghost poorly).
        try {
          const src = e.currentTarget as HTMLDivElement;
          const rect = src.getBoundingClientRect();
          const offsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const offsetY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

          const ghost = src.cloneNode(true) as HTMLDivElement;
          ghost.classList.remove('move-mode', 'drag-source');
          ghost.style.position = 'fixed';
          ghost.style.left = '-10000px';
          ghost.style.top = '0';
          ghost.style.width = `${Math.ceil(rect.width)}px`;
          ghost.style.height = `${Math.ceil(rect.height)}px`;
          ghost.style.opacity = '1';
          ghost.style.pointerEvents = 'none';
          ghost.style.margin = '0';
          ghost.style.transform = 'none';

          // Ensure the ghost doesn't wiggle.
          const srcInner = src.querySelector('.commit-row-inner') as HTMLElement | null;
          const ghostInner = ghost.querySelector('.commit-row-inner') as HTMLElement | null;
          if (ghostInner) {
            ghostInner.style.animation = 'none';
            ghostInner.style.transform = 'none';
            // Copy computed columns so hash/author/date widths match even outside the app container CSS vars.
            if (srcInner) {
              ghostInner.style.gridTemplateColumns = window.getComputedStyle(srcInner).gridTemplateColumns;
            }
          }

          // If moving multiple commits, add a small badge.
          if (shas.length > 1) {
            ghost.style.position = 'fixed';
            ghost.style.overflow = 'visible';
            const badge = document.createElement('div');
            badge.textContent = `×${shas.length}`;
            badge.style.position = 'absolute';
            badge.style.right = '8px';
            badge.style.top = '4px';
            badge.style.padding = '2px 6px';
            badge.style.borderRadius = '999px';
            badge.style.fontSize = '11px';
            badge.style.fontFamily = 'system-ui, -apple-system, Segoe UI, sans-serif';
            badge.style.background = 'rgba(0,0,0,0.65)';
            badge.style.color = '#fff';
            badge.style.border = '1px solid rgba(255,255,255,0.15)';
            badge.style.pointerEvents = 'none';
            ghost.appendChild(badge);
          }

          document.body.appendChild(ghost);
          e.dataTransfer.setDragImage(ghost, offsetX, offsetY);
          window.setTimeout(() => {
            try { document.body.removeChild(ghost); } catch {}
          }, 0);
        } catch {
          // ignore
        }
      }}
      onDragOver={(e) => {
        if (!moveMode || isUncommitted) return;
        if (draggedShas.includes(commit.sha)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        // Trigger "between row" insertion (direction-aware):
        // - Moving down: flip early after entering from the top.
        // - Moving up: flip early after entering from the bottom.
        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const y = e.clientY - r.top;
        const flipThreshold = 0.15;
        const dir = getDragDirection?.() ?? 'down';
        const after = nextSha ?? '__END__';
        const before = commit.sha;

        const flipToBeforeWhenMovingUp = y < r.height * (1 - flipThreshold);
        const flipToAfterWhenMovingDown = y > r.height * flipThreshold;
        const target = dir === 'up'
          ? (flipToBeforeWhenMovingUp ? before : after)
          : (flipToAfterWhenMovingDown ? after : before);

        onHoverDropTarget?.(target);
      }}
      onDrop={(e) => {
        if (!moveMode || isUncommitted) return;
        e.preventDefault();
        e.stopPropagation();
        if (draggedShas.includes(commit.sha)) return;
        // Use the already-rendered drop slot target to avoid mismatch between "what you see" and
        // what a final mouse-up over a row might compute.
        const target = getCurrentDropTarget?.();
        const beforeSha = target === '__END__' ? null : (target || null);
        onDropBefore?.(beforeSha, draggedShas);
        onHoverDropTarget?.(null);
        onDragFinished?.();
      }}
      onDragEnd={() => {
        onHoverDropTarget?.(null);
        onDragFinished?.();
      }}
    >
      <div className="commit-row-inner">
      <div 
        className="cell cell-hash" 
        title={isUncommitted ? '' : "Click to copy SHA"}
        onClick={handleCopySha}
      >
        {isUncommitted ? '*' : commit.sha.substring(0, 8)}
      </div>
      <div className="cell cell-author" title={commit.authorName}>
        {commit.authorName}
      </div>
      <div className="cell cell-date">
        {formatDate(commit.authorDateIso)}
      </div>
      <div className="cell cell-graph">
        <div className="graph-container">
          <Graph commit={commit} />
        </div>
      </div>
      <div className="cell cell-subject" title={commit.subject}>
        <div className="subject-text">
          {commit.refs && commit.refs.map((ref, i) => (
            <span key={i} className={`ref-badge ref-${ref.type}`}>
              {ref.name}
            </span>
          ))}
          <span className="subject-message">{commit.subject}</span>
          {isUncommitted && (
            <span className="commit-row-actions">
              <span
                className="codicon codicon-discard"
                title="Discard all uncommitted changes"
                onClick={handleDiscardAll}
              />
            </span>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};
