import React, { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useCommits } from './state/useCommits';
import { CommitRow } from './components/CommitRow';
import { DetailsPane } from './components/DetailsPane';
import { SquashPreview } from './components/SquashPreview';
import { ContextMenu } from './components/ContextMenu';
import { BranchSelector } from './components/BranchSelector';


import { RepoSelector } from './components/RepoSelector';
import { vscode, request } from './state/vscode';
import { RepoInfo } from '../extension/protocol/types';
import './styles/main.css';

const App = () => {
  const { 
    commits, 
    maxLanes,
    branches, 
    loading, 
    error, 
    hasUncommitted,
    selectedBranch, 
    setSelectedBranch, 
    searchQuery,
    setSearchQuery,
    refresh 
  } = useCommits();

  // Dynamic graph width based on max lanes
  const graphWidth = Math.max(40, 20 + (maxLanes * 12) + 10); // min 40px, or based on lanes

  const currentBranchName = branches.find(b => b.current)?.name || 'HEAD';

  // Commit list column widths (px). Persisted in webview state.
  const initialWebviewState = vscode.getState?.() || {};
  const [colWidths, setColWidths] = useState<{
    hash: number;
    author: number;
    date: number;
    graph: number;
  }>(() => initialWebviewState.colWidths || {
    hash: 55,
    author: 120,
    date: 140,
    graph: graphWidth
  });
  const [graphWidthLocked, setGraphWidthLocked] = useState<boolean>(() => !!initialWebviewState.graphWidthLocked);

  // Keep graph column default in sync with lane count until the user resizes it manually.
  useEffect(() => {
    if (!graphWidthLocked) {
      setColWidths(prev => ({ ...prev, graph: graphWidth }));
    }
  }, [graphWidth, graphWidthLocked]);

  useEffect(() => {
    vscode.setState?.({
      ...(vscode.getState?.() || {}),
      colWidths,
      graphWidthLocked
    });
  }, [colWidths, graphWidthLocked]);

  const handleBranchSwitch = async (name: string) => {
    if (name === 'HEAD' || name === '--all') return;
    await gitAction('git/checkout', { sha: name });
  };

  const [selectedShas, setSelectedShas] = useState<string[]>([]);
  const [anchorSha, setAnchorSha] = useState<string | null>(null);
  const [activeSha, setActiveSha] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ sha: string, x: number, y: number } | null>(null);
  const hasInitiallySelected = useRef(false);
  const hadUncommittedRef = useRef<boolean | null>(null);
  const [actionStatus, setActionStatus] = useState<Record<string, 'idle' | 'running' | 'success'>>({});
  const [moveMode, setMoveMode] = useState(false);
  const [draggedShas, setDraggedShas] = useState<string[]>([]);
  const [dropTargetSha, setDropTargetSha] = useState<string | null>(null);
  const [movePending, setMovePending] = useState(false);
  const [moveFailedShas, setMoveFailedShas] = useState<string[]>([]);
  const commitListRef = useRef<HTMLDivElement>(null);
  const commitRowElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const moveFlipPrevPositionsRef = useRef<Map<string, number> | null>(null);
  const movePostDropPrevPositionsRef = useRef<Map<string, number> | null>(null);
  const moveDragLastClientYRef = useRef<number | null>(null);
  const moveDragDirectionRef = useRef<'up' | 'down' | null>(null);

  useEffect(() => {
    if (!moveMode || draggedShas.length === 0) return;
    const handler = (e: DragEvent) => {
      if (typeof e.clientY !== 'number') return;
      const prev = moveDragLastClientYRef.current;
      if (prev !== null) {
        moveDragDirectionRef.current = e.clientY > prev ? 'down' : (e.clientY < prev ? 'up' : moveDragDirectionRef.current);
      }
      moveDragLastClientYRef.current = e.clientY;
    };
    window.addEventListener('dragover', handler);
    return () => {
      window.removeEventListener('dragover', handler);
    };
  }, [moveMode, draggedShas.length]);

  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [selectedRepoRoot, setSelectedRepoRoot] = useState<string>(() => initialWebviewState.selectedRepoRoot || '');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchWidthPx, setSearchWidthPx] = useState<number | null>(null);
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const refreshRepos = useCallback(async () => {
    try {
      const list = await request<RepoInfo[]>('repos/list');
      setRepos(list);

      // If we don't have a saved selection (or it no longer exists), default to first repo.
      if ((!selectedRepoRoot || !list.some(r => r.root === selectedRepoRoot)) && list.length > 0) {
        setSelectedRepoRoot(list[0].root);
      }

      // If there are no repos discovered, fall back to legacy resolve.
      if (list.length === 0) {
        await request('repo/resolve');
        refresh(true);
      }
    } catch {
      // ignore (extension will still resolve via commits/list / branches/list)
    }
  }, [refresh, selectedRepoRoot]);

  useEffect(() => {
    refreshRepos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep repo list "live" so dirty/clean highlighting updates immediately.
  // This covers both directions: dirty -> clean and clean -> dirty.
  useEffect(() => {
    refreshRepos();
  }, [hasUncommitted, refreshRepos]);

  useEffect(() => {
    vscode.setState?.({
      ...(vscode.getState?.() || {}),
      selectedRepoRoot
    });
  }, [selectedRepoRoot]);

  useEffect(() => {
    if (!selectedRepoRoot) return;
    (async () => {
      try {
        await request('repo/select', { root: selectedRepoRoot });
        // Reset Filter to HEAD when switching repos (keeps UI consistent, avoids dangling filters).
        setSelectedBranch('HEAD');
        refreshRef.current(true);
      } catch {
        // ignore; keep whatever repo the extension resolved
      }
    })();
  }, [selectedRepoRoot, setSelectedBranch]);

  // Compact search input: size to current text (not placeholder) to save horizontal space.
  useLayoutEffect(() => {
    const el = searchInputRef.current;
    if (!el) return;

    const value = searchQuery || '';
    const style = window.getComputedStyle(el);

    const font = style.font || [
      style.fontStyle,
      style.fontVariant,
      style.fontWeight,
      style.fontSize,
      style.fontFamily
    ].filter(Boolean).join(' ');

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = font;

    // When empty, keep it compact (don't size to the long placeholder).
    const text = value.length > 0 ? value : 'Search';
    const textWidth = ctx.measureText(text).width;

    const paddingLeft = parseFloat(style.paddingLeft || '0') || 0;
    const paddingRight = parseFloat(style.paddingRight || '0') || 0;
    const borderLeft = parseFloat(style.borderLeftWidth || '0') || 0;
    const borderRight = parseFloat(style.borderRightWidth || '0') || 0;

    // Reserve space for the clear "×" affordance when there's text.
    const clearAffordance = value.length > 0 ? 18 : 0;
    const extra = paddingLeft + paddingRight + borderLeft + borderRight + clearAffordance + 6;

    const desired = Math.ceil(textWidth + extra);
    const clamped = Math.max(120, Math.min(240, desired));
    setSearchWidthPx(clamped);
  }, [searchQuery]);

  // Auto-focus the latest commit or uncommitted changes on initial load
  useEffect(() => {
    if (commits.length > 0 && !hasInitiallySelected.current) {
      const latestSha = commits[0].sha;
      setSelectedShas([latestSha]);
      setAnchorSha(latestSha);
      setActiveSha(latestSha);
      hasInitiallySelected.current = true;
    }
  }, [commits]);

  // Auto-focus UNCOMMITTED when we transition from clean -> dirty (new local changes detected).
  // Only auto-switch if the user currently has a single commit selected (avoid fighting multi-select/history browsing).
  useEffect(() => {
    const visibleHasUncommitted = commits.some(c => c.sha === 'UNCOMMITTED');

    if (hadUncommittedRef.current === null) {
      hadUncommittedRef.current = hasUncommitted;
      return;
    }

    const becameDirty = hasUncommitted && !hadUncommittedRef.current;
    const becameClean = !hasUncommitted && !!hadUncommittedRef.current;
    hadUncommittedRef.current = hasUncommitted;
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
    if (selectedShas.length !== 1) return;

    if (becameDirty) {
      if (!visibleHasUncommitted) return; // e.g. search filter hides it
      if (selectedShas[0] === 'UNCOMMITTED') return;

      setSelectedShas(['UNCOMMITTED']);
      setAnchorSha('UNCOMMITTED');
      setActiveSha('UNCOMMITTED');

      setTimeout(() => {
        const el = document.querySelector(`[data-sha="UNCOMMITTED"]`);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'auto' });
      }, 0);
      return;
    }

    // When the working tree becomes clean again, jump back to the latest commit
    // (but only if the user was currently focused on UNCOMMITTED).
    if (becameClean) {
      if (selectedShas[0] !== 'UNCOMMITTED') return;
      const latestSha = commits[0]?.sha;
      if (!latestSha) return;

      setSelectedShas([latestSha]);
      setAnchorSha(latestSha);
      setActiveSha(latestSha);

      setTimeout(() => {
        const el = document.querySelector(`[data-sha="${latestSha}"]`);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'auto' });
      }, 0);
    }
  }, [commits, hasUncommitted, selectedShas]);
  
  // Resizable panes state
  const [ratio, setRatio] = useState(0.7);
  const [isResizing, setIsResizing] = useState(false);
  const [isOptionPressed, setIsOptionPressed] = useState(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);

  // Column resizing state (separate from pane resizing)
  const [isColResizing, setIsColResizing] = useState(false);
  const colResizeRef = useRef<{
    col: 'hash' | 'author' | 'date' | 'graph';
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !mainContentRef.current) return;
      
      const containerRect = mainContentRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      const newRatio = newWidth / containerRect.width;
      
      // Enforce min/max constraints (approx 300px min for left, 200px min for right)
      const minLeftRatio = 300 / containerRect.width;
      const maxLeftRatio = (containerRect.width - 200) / containerRect.width;

      if (newRatio > minLeftRatio && newRatio < maxLeftRatio) {
        setRatio(newRatio);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isColResizing || !colResizeRef.current) return;

      const { col, startX, startWidth } = colResizeRef.current;
      const dx = e.clientX - startX;

      const min = col === 'hash' ? 48 : col === 'author' ? 80 : col === 'date' ? 120 : 40;
      const containerWidth = leftPaneRef.current?.clientWidth || 0;
      const minMessage = 220;
      const otherSum =
        (col === 'hash' ? 0 : colWidths.hash) +
        (col === 'author' ? 0 : colWidths.author) +
        (col === 'date' ? 0 : colWidths.date) +
        (col === 'graph' ? 0 : colWidths.graph);
      const max = containerWidth > 0 ? Math.max(min, containerWidth - otherSum - minMessage) : 1000;

      const nextWidth = Math.min(max, Math.max(min, startWidth + dx));
      setColWidths(prev => ({ ...prev, [col]: nextWidth }));
    };

    const handleMouseUp = () => {
      setIsColResizing(false);
      colResizeRef.current = null;
      document.body.style.cursor = 'default';
    };

    if (isColResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isColResizing, colWidths]);

  const startColResize = (col: 'hash' | 'author' | 'date' | 'graph') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    colResizeRef.current = { col, startX: e.clientX, startWidth: colWidths[col] };
    setIsColResizing(true);
    if (col === 'graph') setGraphWidthLocked(true);
  };

  const handleSelect = useCallback((sha: string, isMulti: boolean, isShift: boolean) => {
    setActiveSha(sha);
    if (isShift && anchorSha) {
      const anchorIndex = commits.findIndex((c: any) => c.sha === anchorSha);
      const targetIndex = commits.findIndex((c: any) => c.sha === sha);
      if (anchorIndex !== -1 && targetIndex !== -1) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        setSelectedShas(commits.slice(start, end + 1).map((c: any) => c.sha));
      }
    } else if (isMulti) {
      setSelectedShas((prev: string[]) => {
        if (prev.includes(sha)) {
          const next = prev.filter((s: string) => s !== sha);
          return next;
        } else {
          const targetIndex = commits.findIndex((c: any) => c.sha === sha);
          if (prev.length === 0) return [sha];
          
          const indices = prev.map((s: string) => commits.findIndex((c: any) => c.sha === s)).sort((a: number, b: number) => a - b);
          const minIdx = indices[0];
          const maxIdx = indices[indices.length - 1];
          
          if (targetIndex < minIdx) {
            return commits.slice(targetIndex, maxIdx + 1).map((c: any) => c.sha);
          } else {
            return commits.slice(minIdx, targetIndex + 1).map((c: any) => c.sha);
          }
        }
      });
      setAnchorSha(sha);
    } else {
      setSelectedShas([sha]);
      setAnchorSha(sha);
    }
  }, [commits, anchorSha]);

  const handleKeyboardNavigation = useCallback((e: KeyboardEvent) => {
    if (commits.length === 0) return;
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      
      const currentSha = activeSha || anchorSha || (selectedShas.length > 0 ? selectedShas[0] : commits[0].sha);
      const currentIndex = commits.findIndex(c => c.sha === currentSha);
      if (currentIndex === -1) return;

      let nextIndex = currentIndex + (e.key === 'ArrowDown' ? 1 : -1);
      if (nextIndex < 0) nextIndex = 0;
      if (nextIndex >= commits.length) nextIndex = commits.length - 1;

      const nextSha = commits[nextIndex].sha;
      handleSelect(nextSha, false, e.shiftKey);

      // Scroll into view if needed
      setTimeout(() => {
        const element = document.querySelector(`[data-sha="${nextSha}"]`);
        if (element) {
          element.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
      }, 0);
    }
  }, [commits, activeSha, anchorSha, selectedShas, handleSelect]);

  const cancelMoveMode = useCallback(() => {
    setMoveMode(false);
    setDraggedShas([]);
    setDropTargetSha(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setIsOptionPressed(true);
      if (e.key === 'Escape' && moveMode) {
        cancelMoveMode();
        return;
      }
      handleKeyboardNavigation(e);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setIsOptionPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    // Also clear if window loses focus
    window.addEventListener('blur', () => setIsOptionPressed(false));
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', () => setIsOptionPressed(false));
    };
  }, [handleKeyboardNavigation, moveMode, cancelMoveMode]);

  // Allow extension host to cancel move mode (equivalent to pressing Escape).
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'ui/escape') {
        if (moveMode) cancelMoveMode();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [moveMode, cancelMoveMode]);

  // Tell extension host when move mode is active so it can cancel on outside clicks.
  useEffect(() => {
    const requestId = `ui-moveMode-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    vscode.postMessage({ type: 'ui/moveMode', requestId, payload: { active: moveMode } });
  }, [moveMode]);

  const handleContextMenu = (sha: string, x: number, y: number) => {
    // If right-clicking outside current selection, switch to single selection for predictable actions.
    if (!selectedShas.includes(sha)) {
      setSelectedShas([sha]);
      setAnchorSha(sha);
      setActiveSha(sha);
    }
    setContextMenu({ sha, x, y });
  };

  const gitAction = async <T = any>(type: string, payload: any): Promise<T | undefined> => {
    if (actionStatus[type] === 'running') return;
    setActionStatus(prev => ({ ...prev, [type]: 'running' }));
    try {
      const res = await request<T>(type, payload);
      refresh();
      setActionStatus(prev => ({ ...prev, [type]: 'success' }));
      window.setTimeout(() => {
        setActionStatus(prev => ({ ...prev, [type]: 'idle' }));
      }, 900);
      return res;
    } catch (err: any) {
      // Errors are handled by the extension host showing messages
      setActionStatus(prev => ({ ...prev, [type]: 'idle' }));
      return undefined;
    }
  };

  const beginMoveDrag = useCallback((sha: string) => {
    // If the user drags a non-selected commit, treat it as single-select.
    const cleanSelected = selectedShas.filter(s => s && s !== 'UNCOMMITTED');
    const shasToDrag = cleanSelected.includes(sha) ? cleanSelected : [sha];
    setSelectedShas(shasToDrag);
    setAnchorSha(sha);
    setActiveSha(sha);
    setDraggedShas(shasToDrag);
    return shasToDrag;
  }, [selectedShas]);

  const captureMoveFlipPositions = useCallback(() => {
    const container = commitListRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const scrollTop = container.scrollTop;
    const map = new Map<string, number>();
    for (const [sha, el] of commitRowElsRef.current.entries()) {
      if (sha === 'UNCOMMITTED') continue; // sticky row; don't animate
      const r = el.getBoundingClientRect();
      map.set(sha, r.top - containerTop + scrollTop);
    }
    moveFlipPrevPositionsRef.current = map;
  }, []);

  const setDropTarget = useCallback((sha: string | null) => {
    setDropTargetSha(prev => {
      if (prev === sha) return prev;
      // Only animate slot movement while actually dragging in move mode.
      if (moveMode && draggedShas.length > 0) {
        captureMoveFlipPositions();
      }
      return sha;
    });
  }, [moveMode, draggedShas.length, captureMoveFlipPositions]);

  // FLIP animate rows when the between-row drop slot moves.
  useLayoutEffect(() => {
    if (!moveMode || draggedShas.length === 0) return;
    const container = commitListRef.current;
    const prev = moveFlipPrevPositionsRef.current;
    if (!container || !prev) return;

    const containerTop = container.getBoundingClientRect().top;
    const scrollTop = container.scrollTop;

    for (const [sha, el] of commitRowElsRef.current.entries()) {
      if (sha === 'UNCOMMITTED') continue;
      const r = el.getBoundingClientRect();
      const nextTop = r.top - containerTop + scrollTop;
      const prevTop = prev.get(sha);
      if (prevTop === undefined) continue;
      const delta = prevTop - nextTop;
      if (Math.abs(delta) < 0.5) continue;

      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      // Force reflow
      void el.offsetHeight;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 160ms cubic-bezier(0.2, 0.0, 0.0, 1.0)';
        el.style.transform = 'translateY(0px)';
      });
    }

    // Clear snapshot so we only animate when we intentionally captured.
    moveFlipPrevPositionsRef.current = null;
  }, [dropTargetSha, moveMode, draggedShas.length]);

  const endMoveDrag = useCallback(() => {
    setDraggedShas([]);
    setDropTargetSha(null);
    moveDragLastClientYRef.current = null;
    moveDragDirectionRef.current = null;
  }, []);

  const dropMoveBefore = useCallback(async (beforeSha: string | null, shas: string[]) => {
    if (!moveMode) return;
    if (movePending) return;
    const clean = (shas || []).map(String).filter(s => s && s !== 'UNCOMMITTED');
    if (clean.length === 0) return;

    // Capture pre-move positions for *all* currently rendered commit rows.
    // We'll remap them to new SHAs and FLIP-animate after refresh, which looks like a replay of the drag reflow.
    try {
      const container = commitListRef.current;
      if (container) {
        const containerTop = container.getBoundingClientRect().top;
        const scrollTop = container.scrollTop;
        const map = new Map<string, number>();
        for (const [sha, el] of commitRowElsRef.current.entries()) {
          if (sha === 'UNCOMMITTED') continue;
          const r = el.getBoundingClientRect();
          map.set(sha, r.top - containerTop + scrollTop);
        }
        movePostDropPrevPositionsRef.current = map.size > 0 ? map : null;
      } else {
        movePostDropPrevPositionsRef.current = null;
      }
    } catch {
      movePostDropPrevPositionsRef.current = null;
    }

    const type = 'git/moveCommits';
    if (actionStatus[type] === 'running') return;
    setActionStatus(prev => ({ ...prev, [type]: 'running' }));
    setMovePending(true);
    try {
      const res = await request<{ movedOldToNew?: Record<string, string> }>(type, { shas: clean, beforeSha });
      const mapping = res?.movedOldToNew || {};

      // Remap captured positions from old SHAs -> new SHAs (history rewrite changes SHAs).
      const oldPositions = movePostDropPrevPositionsRef.current;
      if (oldPositions && Object.keys(mapping).length > 0) {
        const remapped = new Map<string, number>();
        for (const [oldSha, prevTop] of oldPositions.entries()) {
          const newSha = mapping[oldSha];
          if (newSha) remapped.set(newSha, prevTop);
        }
        movePostDropPrevPositionsRef.current = remapped.size > 0 ? remapped : null;
      } else {
        movePostDropPrevPositionsRef.current = null;
      }

      refresh();
      setActionStatus(prev => ({ ...prev, [type]: 'success' }));
      window.setTimeout(() => {
        setActionStatus(prev => ({ ...prev, [type]: 'idle' }));
      }, 900);
      // Keep move mode enabled so the user can continue reordering.
      endMoveDrag();
      setMovePending(false);
    } catch {
      setActionStatus(prev => ({ ...prev, [type]: 'idle' }));
      // Keep move mode enabled so the user can try again, but show a quick "snap back" cue.
      setMoveFailedShas(clean);
      window.setTimeout(() => setMoveFailedShas([]), 420);
      endMoveDrag();
      movePostDropPrevPositionsRef.current = null;
      setMovePending(false);
    }
  }, [moveMode, actionStatus, movePending, endMoveDrag]);

  // Replay-like post-drop animation: FLIP animate the rewritten rows into their new positions.
  useLayoutEffect(() => {
    const container = commitListRef.current;
    const prev = movePostDropPrevPositionsRef.current;
    if (!container || !prev || prev.size === 0) return;

    const containerTop = container.getBoundingClientRect().top;
    const scrollTop = container.scrollTop;

    for (const [sha, prevTop] of prev.entries()) {
      const el = commitRowElsRef.current.get(sha);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const nextTop = r.top - containerTop + scrollTop;
      const delta = prevTop - nextTop;
      if (Math.abs(delta) < 0.5) continue;

      el.animate(
        [
          { transform: `translateY(${delta}px)` },
          { transform: 'translateY(0px)' }
        ],
        {
          duration: 340,
          easing: 'cubic-bezier(0.2, 0.0, 0.0, 1.0)',
          fill: 'both'
        }
      );
    }

    movePostDropPrevPositionsRef.current = null;
  }, [commits]);

  return (
    <div
      className="app-container"
      style={{
        '--graph-width': `${graphWidth}px`,
        '--col-hash': `${colWidths.hash}px`,
        '--col-author': `${colWidths.author}px`,
        '--col-date': `${colWidths.date}px`,
        '--col-graph': `${colWidths.graph}px`,
      } as React.CSSProperties}
    >
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="toolbar-actions">
            <button 
              className={`toolbar-button secondary ${actionStatus['git/fetch'] === 'success' ? 'action-success' : ''}`}
              onClick={() => gitAction('git/fetch', {})}
              title="Fetch all branches and prune"
              disabled={actionStatus['git/fetch'] === 'running'}
            >
              <span className={`button-icon ${actionStatus['git/fetch'] === 'running' ? 'spin' : ''}`}>
                {actionStatus['git/fetch'] === 'success' ? '✓' : '↻'}
              </span>
              {actionStatus['git/fetch'] === 'running' ? 'Fetching…' : 'Fetch'}
            </button>
            <button 
              className={`toolbar-button secondary ${actionStatus['git/pull'] === 'success' ? 'action-success' : ''}`}
              onClick={() => gitAction('git/pull', {})}
              title="Pull changes from upstream"
              disabled={actionStatus['git/pull'] === 'running'}
            >
              <span className="button-icon">↓</span>
              {actionStatus['git/pull'] === 'running' ? 'Pulling…' : 'Pull'}
            </button>
            <button 
              className={`toolbar-button secondary push-button ${isOptionPressed ? 'force-push' : ''} ${actionStatus['git/push'] === 'success' ? 'action-success' : ''}`} 
              onClick={() => gitAction('git/push', { force: isOptionPressed })}
              title={isOptionPressed ? 'Force push changes (overwrites remote!)' : 'Push changes to upstream'}
              disabled={actionStatus['git/push'] === 'running'}
            >
              <span className="button-icon">↑</span>
              {actionStatus['git/push'] === 'running'
                ? (isOptionPressed ? 'Force Pushing…' : 'Pushing…')
                : (isOptionPressed ? 'Force Push' : 'Push')}
            </button>
          </div>

          <RepoSelector
            label="Repo:"
            className="repo-switcher"
            repos={repos}
            selectedRoot={selectedRepoRoot}
            onSelect={setSelectedRepoRoot}
            onOpen={refreshRepos}
          />
          <BranchSelector 
            label="Branch:"
            className="branch-switcher"
            branches={branches}
            selectedBranch={currentBranchName}
            onSelect={handleBranchSwitch}
            showAllOption={false}
            showHeadOption={false}
            enableHoverActions
            onHoverAction={(action, branch) => {
              if (action === 'checkout') {
                gitAction('git/checkout', { sha: branch.name });
              } else if (action === 'rebase') {
                gitAction('git/rebase', { onto: branch.name });
              } else if (action === 'rename') {
                gitAction('git/branchRename', { name: branch.name });
              } else if (action === 'delete') {
                gitAction('git/branchDelete', { name: branch.name });
              }
            }}
          />
          <BranchSelector 
            label="Filter:"
            branches={branches}
            selectedBranch={selectedBranch}
            onSelect={setSelectedBranch}
          />
          <div className="search-container">
            <input 
              ref={searchInputRef}
              type="text" 
              className="search-input" 
              placeholder="Search message, hash..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={searchWidthPx ? { width: `${searchWidthPx}px` } : undefined}
            />
            {searchQuery && (
              <span className="search-clear" onClick={() => setSearchQuery('')}>&times;</span>
            )}
          </div>
        </div>
      </div>
      <div className="main-content" ref={mainContentRef}>
        <div className="left-pane" ref={leftPaneRef} style={{ width: `${ratio * 100}%`, flex: 'none' }}>
          <div style={{ width: 'fit-content', minWidth: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="list-header">
              <div className="header-cell">
                Hash
                <div className="col-resizer" onMouseDown={startColResize('hash')} />
              </div>
              <div className="header-cell">
                Author
                <div className="col-resizer" onMouseDown={startColResize('author')} />
              </div>
              <div className="header-cell">
                Date
                <div className="col-resizer" onMouseDown={startColResize('date')} />
              </div>
              <div className="header-cell header-graph" title="Graph">
                <div className="col-resizer" onMouseDown={startColResize('graph')} />
              </div>
              <div className="header-cell">Message</div>
            </div>
            <div className="commit-list" ref={commitListRef}>
              {loading && commits.length === 0 && <div style={{ padding: '10px' }}>Loading...</div>}
              {error && <div style={{ padding: '10px', color: 'var(--vscode-errorForeground)' }}>{error}</div>}
              {(() => {
                const gapCss = 'calc(var(--row-height) * 3)';
                const showSlots = moveMode && draggedShas.length > 0;

                return commits.flatMap((commit, index) => {
                  const nextSha = commits[index + 1]?.sha ?? null;
                  const isTarget = dropTargetSha === commit.sha;
                  const slot = showSlots && isTarget ? (
                    <div
                      key={`slot-${commit.sha}`}
                      className="commit-drop-slot"
                      style={{ ['--drop-gap' as any]: gapCss } as React.CSSProperties}
                      onDragOver={(e) => {
                        if (draggedShas.length === 0) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDropTarget(commit.sha);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dropMoveBefore(commit.sha, draggedShas);
                        endMoveDrag();
                      }}
                      title="Drop between commits"
                    />
                  ) : null;

                  return [
                    slot,
                <CommitRow 
                  key={commit.sha}
                  commit={commit}
                  isSelected={selectedShas.includes(commit.sha)}
                  onSelect={handleSelect}
                  onContextMenu={handleContextMenu}
                      onDiscardAllUncommitted={commit.sha === 'UNCOMMITTED' ? (() => gitAction('git/discardAll', {})) : undefined}
                      rowRef={(el) => {
                        const map = commitRowElsRef.current;
                        if (!el) {
                          map.delete(commit.sha);
                          return;
                        }
                        map.set(commit.sha, el);
                      }}
                      getDragDirection={() => moveDragDirectionRef.current}
                      getCurrentDropTarget={() => dropTargetSha}
                      nextSha={nextSha}
                      moveMode={moveMode}
                      draggedShas={draggedShas}
                      isDropTarget={isTarget}
                      onBeginDrag={beginMoveDrag}
                      onDropBefore={(before, shas) => dropMoveBefore(before, shas)}
                      onHoverDropTarget={setDropTarget}
                      onDragFinished={endMoveDrag}
                      movePending={movePending}
                      moveFailed={moveFailedShas.includes(commit.sha)}
                    />
                  ].filter(Boolean) as any[];
                });
              })()}
              {moveMode && (
                <div
                  className={`commit-drop-end ${dropTargetSha === '__END__' ? 'drop-target' : ''}`}
                  style={{ ['--drop-gap' as any]: 'calc(var(--row-height) * 3)' } as React.CSSProperties}
                  onDragOver={(e) => {
                    if (draggedShas.length === 0) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDropTarget('__END__');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropMoveBefore(null, draggedShas);
                    endMoveDrag();
                  }}
                >
                  Drop here to move to the end
                </div>
              )}
            </div>
          </div>
        </div>
        <div 
          className={`resizer ${isResizing ? 'is-resizing' : ''}`} 
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
        />
        <div className={`right-pane ${selectedShas.length === 1 && selectedShas[0] === 'UNCOMMITTED' ? 'uncommitted' : ''}`}>
          {moveMode ? (
            <div style={{ padding: '16px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>Move mode</div>
              <div style={{ fontSize: '12px', opacity: 0.75, lineHeight: 1.4 }}>
                Drag commits in the list to reorder history. Multi-select works the same as Squash Preview.
                <br />
                Press <span style={{ fontFamily: 'monospace' }}>Esc</span> to exit.
              </div>
            </div>
          ) : selectedShas.length === 1 ? (
            <DetailsPane sha={selectedShas[0]} />
          ) : selectedShas.length > 1 ? (
            <SquashPreview shas={selectedShas} commits={commits} />
          ) : (
            <div style={{ padding: '16px', opacity: 0.6 }}>
              Select a commit to see details
            </div>
          )}
        </div>
      </div>
      {contextMenu && (
        <ContextMenu 
          x={contextMenu.x} 
          y={contextMenu.y} 
          onClose={() => setContextMenu(null)}
          actions={[
            ...(() => {
              const isMultiContext = selectedShas.length > 1 && selectedShas.includes(contextMenu.sha);
              const contextShas = (isMultiContext ? selectedShas : [contextMenu.sha]).filter(s => s && s !== 'UNCOMMITTED');
              const hasMulti = contextShas.length >= 2;

              const orderedForCherryPick = [...contextShas].sort((a, b) => {
                  const ia = commits.findIndex(c => c.sha === a);
                  const ib = commits.findIndex(c => c.sha === b);
                  if (ia === -1 || ib === -1) return 0;
                return ib - ia; // higher index = older commit (newest-first list)
              });

              // When multiple commits are selected, make Squash the primary action.
              if (isMultiContext && hasMulti) {
                return [
                  {
                    label: 'Squash…',
                    icon: 'codicon-combine',
                    primary: true,
                    onClick: () => gitAction('git/squash', { shas: contextShas })
                  },
                  {
                    label: moveMode ? 'Done moving' : 'Move…',
                    icon: moveMode ? 'codicon-check' : 'codicon-move',
                    onClick: () => setMoveMode(v => !v)
                  },
                  {
                    label: 'Revert',
                    icon: 'codicon-reply',
                    onClick: () => gitAction('git/revert', { shas: contextShas })
                  },
                  { separator: true },
                  {
                    label: 'Cherry-pick',
                    icon: 'codicon-merge-into',
                    onClick: () => gitAction('git/cherryPick', { shas: orderedForCherryPick })
                  },
                  { separator: true },
                  {
                    label: 'Drop…',
                    icon: 'codicon-trash',
                    danger: true,
                    onClick: async () => {
                      const res = await gitAction<{ newHead?: string }>('git/drop', { shas: contextShas });
                      const newHead = res?.newHead;
                      if (newHead) {
                        setSelectedShas([newHead]);
                        setAnchorSha(newHead);
                        setActiveSha(newHead);
                      }
                    }
                  },
                ];
              }

              // Single selection menu (default)
              if (contextMenu.sha === 'UNCOMMITTED') {
                return [
                  {
                    label: 'Discard',
                    icon: 'codicon-discard',
                    danger: true,
                    onClick: () => gitAction('git/discardAll', {})
                  }
                ];
              }

              const singleSha = contextShas[0];
              const singleCommit: any | undefined = commits.find(c => c.sha === singleSha);
              const tagNames: string[] = (singleCommit?.refs || [])
                .filter((r: any) => r?.type === 'tag' && typeof r?.name === 'string' && r.name.length > 0)
                .map((r: any) => String(r.name));
              return [
                {
                  label: 'Rename',
                  icon: 'codicon-edit',
                  onClick: () => gitAction('git/reword', { sha: singleSha })
                },
                {
                  label: moveMode ? 'Done moving' : 'Move…',
                  icon: moveMode ? 'codicon-check' : 'codicon-move',
                  onClick: () => setMoveMode(v => !v)
                },
                {
                  label: 'Revert',
                  icon: 'codicon-reply',
                  onClick: () => gitAction('git/revert', { shas: [singleSha] })
                },
                { separator: true },
                {
                  label: 'Cherry-pick',
                  icon: 'codicon-merge-into',
                  onClick: () => gitAction('git/cherryPick', { shas: [singleSha] })
                },
                { separator: true },
                {
                  label: 'Add tag…',
                  icon: 'codicon-tag',
                  onClick: async () => { await gitAction('git/tagAdd', { sha: singleSha }); }
                },
                ...(tagNames.length > 0 ? [{
                  label: 'Delete tag(s)',
                  icon: 'codicon-tag',
                  submenu: [
                    ...tagNames.map(tag => ({
                      label: tag,
                      icon: 'codicon-tag',
                      onClick: async () => { await gitAction('git/tagDelete', { tags: [tag] }); }
                    })),
                    ...(tagNames.length > 1 ? [
                      { separator: true },
                      {
                        label: 'Delete multiple…',
                        icon: 'codicon-list-selection',
                        onClick: async () => { await gitAction('git/tagDelete', { sha: singleSha }); }
                      }
                    ] : [])
                  ]
                }] : []),
                { separator: true },
                {
                  label: 'New Branch…',
                  icon: 'codicon-git-branch-create',
                  tone: 'warning' as const,
                  onClick: async () => { await gitAction('git/branchCreate', { sha: singleSha }); }
                },
                {
                  label: 'Checkout commit',
                  icon: 'codicon-git-branch',
                  tone: 'warning' as const,
                  onClick: async () => { await gitAction('git/checkout', { sha: singleSha }); }
                },
                { separator: true },
                { label: 'Reset Soft', icon: 'codicon-history', tone: 'success' as const, onClick: async () => { await gitAction('git/reset', { sha: singleSha, mode: 'soft' }); } },
                { label: 'Reset Hard', icon: 'codicon-warning', onClick: async () => { await gitAction('git/reset', { sha: singleSha, mode: 'hard' }); }, danger: true },
                { separator: true },
                {
                  label: 'Drop…',
                  icon: 'codicon-trash',
                  danger: true,
                  onClick: async () => {
                    const res = await gitAction<{ newHead?: string }>('git/drop', { shas: [singleSha] });
                    const newHead = res?.newHead;
                    if (newHead) {
                      setSelectedShas([newHead]);
                      setAnchorSha(newHead);
                      setActiveSha(newHead);
                    }
                  }
                }
              ];
            })()
          ]}
        />
      )}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
