import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RepoInfo } from '../../extension/protocol/types';

interface RepoSelectorProps {
  repos: RepoInfo[];
  selectedRoot: string;
  onSelect: (root: string) => void;
  onOpen?: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export const RepoSelector: React.FC<RepoSelectorProps> = ({
  repos,
  selectedRoot,
  onSelect,
  onOpen,
  label = '',
  className = '',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setSearchQuery('');
  }, [isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  const getBranch = (repo: RepoInfo) => (repo.currentBranch || '').trim();
  const formatRepoLabelForSearch = (repo: RepoInfo) => {
    const branch = getBranch(repo);
    return branch ? `${repo.label} | ${branch}` : repo.label;
  };

  const currentLabel = useMemo(() => {
    // Only show the repo name in the trigger; the branch is shown separately in the Branch dropdown.
    if (repos.length === 1) return repos[0].label;
    const selected = repos.find(r => r.root === selectedRoot);
    return selected ? selected.label : (repos.length > 0 ? 'Select repo…' : 'No repos found');
  }, [repos, selectedRoot]);

  const selectedRepoIsDirty = useMemo(() => {
    if (repos.length === 1) return !!repos[0].hasUncommittedChanges;
    return !!repos.find(r => r.root === selectedRoot)?.hasUncommittedChanges;
  }, [repos, selectedRoot]);

  const selectedRepoHasUpstreamUpdates = useMemo(() => {
    if (repos.length === 1) return !!repos[0].hasUpstreamUpdates;
    return !!repos.find(r => r.root === selectedRoot)?.hasUpstreamUpdates;
  }, [repos, selectedRoot]);

  const filteredRepos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return repos;
    // In the dropdown, allow searching by either repo name or branch.
    return repos.filter(r => formatRepoLabelForSearch(r).toLowerCase().includes(q));
  }, [repos, searchQuery]);

  // If there's exactly one repo, don't show a dropdown — just display the repo name.
  if (repos.length === 1) {
    return (
      <div className={`branch-selector-container ${className} ${disabled ? 'is-disabled' : ''}`} ref={containerRef}>
        {!!label && <span className="toolbar-label">{label}</span>}
        <span
          className={`branch-selector-trigger repo-selector-static ${selectedRepoIsDirty ? 'repo-dirty' : ''}`}
          title={repos[0].root}
        >
          <span className="repo-selector-current-label">{currentLabel}</span>
          {selectedRepoHasUpstreamUpdates && (
            <span
              className="repo-upstream-indicator"
              title="Upstream has newer commits"
              aria-label="Upstream has newer commits"
            >
              <span className="codicon codicon-arrow-down" />
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className={`branch-selector-container ${className} ${disabled ? 'is-disabled' : ''}`} ref={containerRef}>
      {!!label && <span className="toolbar-label">{label}</span>}
      <button
        className={`branch-selector-trigger ${selectedRepoIsDirty ? 'repo-dirty' : ''}`}
        onClick={() => {
          if (disabled) return;
          const next = !isOpen;
          if (next) onOpen?.();
          setIsOpen(next);
        }}
        title={selectedRoot || ''}
        disabled={disabled || repos.length === 0}
      >
        <span className="repo-selector-current-label">{currentLabel}</span>
        {selectedRepoHasUpstreamUpdates && (
          <span
            className="repo-upstream-indicator"
            title="Upstream has newer commits"
            aria-label="Upstream has newer commits"
          >
            <span className="codicon codicon-arrow-down" />
          </span>
        )}
      </button>

      {isOpen && (
        <div className="branch-selector-popup">
          <div className="branch-search-container">
            <input
              ref={inputRef}
              className="branch-search-input"
              type="text"
              placeholder="Search repos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="branch-popup-content">
            <div className="branch-list">
              {filteredRepos.map(repo => (
                <div
                  key={repo.root}
                  className={`branch-item ${repo.root === selectedRoot ? 'selected' : ''} ${repo.hasUncommittedChanges ? 'repo-dirty' : ''}`}
                  title={repo.root}
                  onClick={() => {
                    onSelect(repo.root);
                    setIsOpen(false);
                  }}
                >
                  <span className="repo-item-main">
                    <span className="repo-item-label" title={repo.label}>{repo.label}</span>
                    <span className="repo-item-sep">|</span>
                    <span
                      className={`repo-item-branch ${(getBranch(repo) || '').toLowerCase() !== 'main' ? 'repo-item-branch-non-main' : ''}`}
                      title={getBranch(repo) || ''}
                    >
                      {getBranch(repo) || '—'}
                    </span>
                  </span>
                  {repo.hasUpstreamUpdates && (
                    <span
                      className="repo-upstream-indicator"
                      title="Upstream has newer commits"
                      aria-label="Upstream has newer commits"
                    >
                      <span className="codicon codicon-arrow-down" />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

