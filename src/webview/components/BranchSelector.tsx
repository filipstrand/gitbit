import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { Branch } from '../../extension/protocol/types';
import { vscode } from '../state/vscode';

type BranchHoverAction = 'checkout' | 'rebase' | 'rename' | 'delete';
type BranchGroupType = 'important' | 'local' | 'remote';
type BranchListItem = Branch & { type: BranchGroupType; label?: string; isFavorite?: boolean; fixedImportant?: boolean };
const DEFAULT_FAVORITES = ['main', 'origin/main'];

interface BranchSelectorProps {
  branches: Branch[];
  selectedBranch: string;
  onSelect: (branch: string) => void;
  label?: string;
  showAllOption?: boolean;
  showHeadOption?: boolean;
  className?: string;
  enableHoverActions?: boolean;
  autoSizeTrigger?: boolean;
  onHoverAction?: (action: BranchHoverAction, branch: Branch) => void;
  disabled?: boolean;
}

export const BranchSelector: React.FC<BranchSelectorProps> = ({ 
  branches, 
  selectedBranch, 
  onSelect,
  label = '',
  showAllOption = true,
  showHeadOption = true,
  className = '',
  enableHoverActions = false,
  autoSizeTrigger = false,
  onHoverAction,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredBranch, setHoveredBranch] = useState<Branch | null>(null);
  const [flyoutTop, setFlyoutTop] = useState<number>(0);
  const [isFlyoutHovered, setIsFlyoutHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [triggerWidthPx, setTriggerWidthPx] = useState<number | null>(null);
  const hoveredElRef = useRef<HTMLDivElement | null>(null);
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const clearHoverTimerRef = useRef<number | null>(null);
  const [favoriteBranches, setFavoriteBranches] = useState<Set<string>>(() => {
    const state = vscode.getState?.() || {};
    const saved = Array.isArray(state.favoriteBranches) ? state.favoriteBranches : [];
    return new Set<string>([...DEFAULT_FAVORITES, ...saved.filter((v: unknown) => typeof v === 'string')]);
  });

  const computeFlyoutTop = () => {
    const list = listRef.current;
    const el = hoveredElRef.current;
    const flyout = flyoutRef.current;
    if (!list || !el || !flyout) return;

    const flyoutHeight = flyout.offsetHeight || 0;
    const desiredTop =
      (el.offsetTop - list.scrollTop) + (el.offsetHeight / 2) - (flyoutHeight / 2);

    const contentEl = list.parentElement as HTMLElement | null; // .branch-popup-content
    if (!contentEl) {
      setFlyoutTop(desiredTop);
      return;
    }

    const contentRect = contentEl.getBoundingClientRect();
    const margin = 8;

    // Absolute Y in viewport if we place the flyout at desiredTop.
    const absoluteTop = contentRect.top + desiredTop;
    let nextTop = desiredTop;

    // If the flyout would go off the bottom, shift it up.
    const maxBottom = window.innerHeight - margin;
    if (absoluteTop + flyoutHeight > maxBottom) {
      nextTop = maxBottom - contentRect.top - flyoutHeight;
    }

    // If it would go off the top, clamp down.
    const minTop = margin;
    if (contentRect.top + nextTop < minTop) {
      nextTop = minTop - contentRect.top;
    }

    setFlyoutTop(Math.max(0, nextTop));
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setHoveredBranch(null);
  }, [isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!hoveredBranch) {
      hoveredElRef.current = null;
      setFlyoutTop(0);
      return;
    }

    // Defer until after render so refs/DOM are up to date.
    const t = window.setTimeout(computeFlyoutTop, 0);
    window.addEventListener('resize', computeFlyoutTop);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', computeFlyoutTop);
    };
  }, [hoveredBranch]);

  useEffect(() => {
    const state = vscode.getState?.() || {};
    vscode.setState?.({
      ...state,
      favoriteBranches: Array.from(favoriteBranches)
    });
  }, [favoriteBranches]);

  const currentBranchName = useMemo(() => {
    return branches.find(b => b.current)?.name || '';
  }, [branches]);

  const filteredBranches = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const headLabel = currentBranchName ? `HEAD (${currentBranchName})` : 'HEAD';
    const existingBranchNames = new Set(branches.map(b => b.name));
    const activeFavorites = new Set(
      Array.from(favoriteBranches).filter(name => existingBranchNames.has(name))
    );

    const fixedImportant: BranchListItem[] = [
      ...(showHeadOption ? [{ name: 'HEAD', remote: false, current: false, type: 'important' as const, label: headLabel, fixedImportant: true }] : []),
      ...(showAllOption ? [{ name: '--all', remote: false, current: false, type: 'important' as const, label: 'All Branches', fixedImportant: true }] : []),
    ];

    const importantFromFavorites: BranchListItem[] = branches
      .filter(b => activeFavorites.has(b.name))
      .map(b => ({ ...b, type: 'important' as const, isFavorite: true }));

    const localAndRemote: BranchListItem[] = branches
      .filter(b => !activeFavorites.has(b.name))
      .map(b => ({ ...b, type: (b.remote ? 'remote' : 'local') as BranchGroupType, isFavorite: false }));

    const allItems: BranchListItem[] = [...fixedImportant, ...importantFromFavorites, ...localAndRemote];

    if (!query) return allItems;

    return allItems.filter(b =>
      b.name.toLowerCase().includes(query) || 
      (b.label && b.label.toLowerCase().includes(query))
    );
  }, [branches, searchQuery, showAllOption, showHeadOption, currentBranchName, favoriteBranches]);

  const groups = useMemo(() => {
    const important = filteredBranches.filter(b => b.type === 'important');
    const local = filteredBranches.filter(b => b.type === 'local' && !important.some(i => i.name === b.name));
    const remote = filteredBranches.filter(b => b.type === 'remote' && !important.some(i => i.name === b.name));
    
    return [
      { label: 'Important', items: important },
      { label: 'Local Branches', items: local },
      { label: 'Remote Branches', items: remote }
    ].filter(g => g.items.length > 0);
  }, [filteredBranches]);

  const handleSelect = (name: string) => {
    onSelect(name);
    setIsOpen(false);
    setSearchQuery('');
    setHoveredBranch(null);
  };

  const handleAction = (action: BranchHoverAction, branch: Branch) => {
    if (!onHoverAction) return;
    onHoverAction(action, branch);
    setIsOpen(false);
    setSearchQuery('');
    setHoveredBranch(null);
  };

  const currentLabel = selectedBranch === '--all' 
    ? 'All Branches' 
    : (selectedBranch === 'HEAD' && currentBranchName ? `HEAD (${currentBranchName})` : selectedBranch);

  // Optional: shrink the trigger to match the selected label (RepoSelector-style measuring).
  useLayoutEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    if (!autoSizeTrigger) {
      setTriggerWidthPx(null);
      return;
    }

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

    const textWidth = ctx.measureText(currentLabel || '').width;
    const paddingLeft = parseFloat(style.paddingLeft || '0') || 0;
    const paddingRight = parseFloat(style.paddingRight || '0') || 0;
    const borderLeft = parseFloat(style.borderLeftWidth || '0') || 0;
    const borderRight = parseFloat(style.borderRightWidth || '0') || 0;

    // Arrow affordance + a touch of breathing room.
    const arrow = 16;
    const extra = paddingLeft + paddingRight + borderLeft + borderRight + arrow;
    const desired = Math.ceil(textWidth + extra);
    const clamped = Math.max(70, Math.min(280, desired));
    setTriggerWidthPx(clamped);
  }, [autoSizeTrigger, currentLabel]);

  return (
    <div className={`branch-selector-container ${className} ${disabled ? 'is-disabled' : ''}`} ref={containerRef}>
      {!!label && <span className="toolbar-label">{label}</span>}
      <div 
        ref={triggerRef}
        className="branch-selector-trigger" 
        onClick={() => {
          if (disabled) return;
          setIsOpen(!isOpen);
        }}
        title={currentLabel}
        style={triggerWidthPx ? { width: `${triggerWidthPx}px` } : undefined}
      >
        {currentLabel}
      </div>

      {isOpen && !disabled && (
        <div className="branch-selector-popup">
          <div className="branch-search-container">
            <span className="branch-search-icon">🔍</span>
            <input 
              ref={inputRef}
              type="text" 
              className="branch-search-input" 
              placeholder="Search branches..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <span className="branch-search-clear" onClick={() => setSearchQuery('')}>&times;</span>
            )}
          </div>
          <div className="branch-popup-content">
            <div
              className="branch-list"
              ref={listRef}
              onScroll={() => {
                if (!enableHoverActions) return;
                computeFlyoutTop();
              }}
              onMouseLeave={() => {
                if (!enableHoverActions) return;
                if (clearHoverTimerRef.current) window.clearTimeout(clearHoverTimerRef.current);
                clearHoverTimerRef.current = window.setTimeout(() => {
                  if (!isFlyoutHovered) setHoveredBranch(null);
                }, 120);
              }}
            >
              {groups.map(group => (
                <React.Fragment key={group.label}>
                  <div className="branch-group-label">{group.label}</div>
                  {group.items.map(branch => (
                    <div 
                      key={branch.name}
                      className={`branch-item ${enableHoverActions ? 'no-click' : ''} ${selectedBranch === branch.name ? 'selected' : ''} ${branch.current ? 'active-branch' : ''} ${enableHoverActions && hoveredBranch?.name === branch.name ? 'hovered' : ''}`}
                      onClick={() => {
                        // When hover-actions are enabled, we only want actions via the right-side flyout (macOS submenu style).
                        if (!enableHoverActions) handleSelect(branch.name);
                      }}
                      onMouseEnter={(e) => {
                        if (!enableHoverActions) return;
                        if (clearHoverTimerRef.current) {
                          window.clearTimeout(clearHoverTimerRef.current);
                          clearHoverTimerRef.current = null;
                        }
                        hoveredElRef.current = e.currentTarget;
                        setHoveredBranch(branch);
                        // Initial positioning; will be refined by the effect once flyout is rendered.
                        window.setTimeout(computeFlyoutTop, 0);
                      }}
                    >
                      {branch.current && (
                        <span className="branch-item-active-indicator">●</span>
                      )}
                      <span className="branch-item-name">{branch.label || branch.name.replace('remotes/', '')}</span>
                      {branch.name !== 'HEAD' && branch.name !== '--all' && (
                        <button
                          className={`branch-item-star-toggle ${branch.isFavorite ? 'is-favorite' : ''}`}
                          title={branch.isFavorite ? 'Remove from important' : 'Add to important'}
                          aria-label={branch.isFavorite ? `Unstar ${branch.name}` : `Star ${branch.name}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFavoriteBranches(prev => {
                              const next = new Set(prev);
                              if (next.has(branch.name)) {
                                next.delete(branch.name);
                              } else {
                                next.add(branch.name);
                              }
                              return next;
                            });
                          }}
                        >
                          {branch.isFavorite ? '★' : '☆'}
                        </button>
                      )}
                    </div>
                  ))}
                </React.Fragment>
              ))}
              {filteredBranches.length === 0 && (
                <div style={{ padding: '8px 12px', opacity: 0.5 }}>No branches found</div>
              )}
            </div>

            {enableHoverActions && hoveredBranch && hoveredBranch.name !== 'HEAD' && hoveredBranch.name !== '--all' && (
              <div
                className="branch-actions-flyout"
                style={{ top: flyoutTop }}
                ref={flyoutRef}
                onMouseEnter={() => {
                  if (clearHoverTimerRef.current) {
                    window.clearTimeout(clearHoverTimerRef.current);
                    clearHoverTimerRef.current = null;
                  }
                  setIsFlyoutHovered(true);
                }}
                onMouseLeave={() => {
                  setIsFlyoutHovered(false);
                  setHoveredBranch(null);
                }}
              >
                <div className="branch-actions-title" title={hoveredBranch.name}>
                  {hoveredBranch.name.replace('remotes/', '')}
                </div>
                <button className="branch-action-item" onClick={() => handleAction('checkout', hoveredBranch)}>
                  <span className="codicon codicon-git-branch branch-action-icon" />
                  Checkout
                </button>
                <button className="branch-action-item" onClick={() => handleAction('rebase', hoveredBranch)}>
                  <span className="codicon codicon-git-pull-request branch-action-icon" />
                  Rebase onto
                </button>
                <button
                  className="branch-action-item"
                  onClick={() => handleAction('rename', hoveredBranch)}
                  disabled={hoveredBranch.remote}
                  title={hoveredBranch.remote ? 'Cannot rename remote branches' : 'Rename branch'}
                >
                  <span className="codicon codicon-edit branch-action-icon" />
                  Rename
                </button>
                {!hoveredBranch.remote && (
                  <button
                    className="branch-action-item danger"
                    onClick={() => handleAction('delete', hoveredBranch)}
                    disabled={hoveredBranch.current}
                    title={hoveredBranch.current ? 'Cannot delete the currently checked out branch' : 'Delete branch'}
                  >
                    <span className="codicon codicon-trash branch-action-icon" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
