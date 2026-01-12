import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RepoInfo } from '../../extension/protocol/types';

interface RepoSelectorProps {
  repos: RepoInfo[];
  selectedRoot: string;
  onSelect: (root: string) => void;
  onOpen?: () => void;
  label?: string;
  className?: string;
}

export const RepoSelector: React.FC<RepoSelectorProps> = ({
  repos,
  selectedRoot,
  onSelect,
  onOpen,
  label = 'Repo:',
  className = ''
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

  const getBranch = (repo: RepoInfo) => (repo.currentBranch || '').trim();
  const formatRepoLabelForSearch = (repo: RepoInfo) => {
    const branch = getBranch(repo);
    return branch ? `${repo.label} (${branch})` : repo.label;
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

  const filteredRepos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return repos;
    // In the dropdown, allow searching by either repo name or branch.
    return repos.filter(r => formatRepoLabelForSearch(r).toLowerCase().includes(q));
  }, [repos, searchQuery]);

  // If there's exactly one repo, don't show a dropdown — just display the repo name.
  if (repos.length === 1) {
    return (
      <div className={`branch-selector-container ${className}`} ref={containerRef}>
        {!!label && <span className="toolbar-label">{label}</span>}
        <span
          className={`branch-selector-trigger repo-selector-static ${selectedRepoIsDirty ? 'repo-dirty' : ''}`}
          title={repos[0].root}
        >
          {currentLabel}
        </span>
      </div>
    );
  }

  return (
    <div className={`branch-selector-container ${className}`} ref={containerRef}>
      {!!label && <span className="toolbar-label">{label}</span>}
      <button
        className={`branch-selector-trigger ${selectedRepoIsDirty ? 'repo-dirty' : ''}`}
        onClick={() => {
          const next = !isOpen;
          if (next) onOpen?.();
          setIsOpen(next);
        }}
        title={selectedRoot || ''}
        disabled={repos.length === 0}
      >
        {currentLabel}
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
                  <span>{repo.label}</span>
                  {!!getBranch(repo) && (() => {
                    const branch = getBranch(repo);
                    const branchLower = branch.toLowerCase();
                    const isNonMain = branchLower !== 'main';
                    const nonMainColor =
                      'color-mix(in srgb, var(--vscode-charts-yellow, #f9d65c) 55%, var(--vscode-descriptionForeground) 45%)';
                    return (
                    <span
                      style={{
                        marginLeft: '8px',
                        color: isNonMain ? nonMainColor : 'var(--vscode-descriptionForeground)',
                        opacity: 0.8
                      }}
                    >
                      ({branch})
                    </span>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

