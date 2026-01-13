import React, { useState, useMemo, useEffect } from 'react';
import { Change } from '../../extension/protocol/types';
import { iconTheme } from '../state/iconTheme';

declare global {
  interface Window {
    iconsUri: string;
  }
}

interface FileTreeProps {
  changes: Change[];
  onFileClick: (change: Change) => void;
  onSecondaryAction?: (change: Change) => void;
  onRevertCommitted?: (changes: Change[]) => void;
  onDiscard?: (paths: string[]) => void;
  selectable?: boolean;
  multiSelect?: boolean;
  selectedPaths?: Set<string>;
  onToggleSelect?: (path: string, selected: boolean) => void;
}

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  change?: Change;
}

export const FileTree: React.FC<FileTreeProps> = ({
  changes,
  onFileClick,
  onSecondaryAction,
  onRevertCommitted,
  onDiscard,
  selectable,
  multiSelect,
  selectedPaths,
  onToggleSelect
}) => {
  const getFolderIcon = (isExpanded: boolean) => {
    const base = window.iconsUri;
    const p = (isExpanded ? iconTheme.folderExpanded : iconTheme.folder) || iconTheme.folder;
    return `${base}/${p}`;
  };

  const changeByPath = useMemo(() => {
    const map = new Map<string, Change>();
    for (const c of changes) map.set(c.path, c);
    return map;
  }, [changes]);

  const { root, allPaths } = useMemo(() => {
    const rootNode: TreeNode = { name: '', path: 'root', children: new Map() };
    const paths = new Set<string>(['root']);
    
    changes.forEach(change => {
      const parts = change.path.split('/');
      let current = rootNode;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            path: currentPath,
            children: new Map(),
          });
        }
        current = current.children.get(part)!;
        if (index < parts.length - 1) {
          paths.add(currentPath);
        }
        if (index === parts.length - 1) {
          current.change = change;
        }
      });
    });

    return { root: rootNode, allPaths: paths };
  }, [changes]);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedFolders(allPaths);
  }, [allPaths]);

  const toggleFolder = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expandedFolders);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setExpandedFolders(next);
  };

  const getFileIcon = (fileName: string) => {
    const lower = fileName.toLowerCase();
    const ext = (lower.includes('.') ? lower.split('.').pop() : '') ?? '';
    const base = window.iconsUri;

    // 1) Exact filename mapping
    const byName = iconTheme.fileNames[lower];
    if (byName) return `${base}/${byName}`;

    // 2) Extension mapping
    const byExt = iconTheme.fileExtensions[ext];
    if (byExt) return `${base}/${byExt}`;

    // 3) Fallback
    return `${base}/${iconTheme.file || 'text.svg'}`;
  };

  const renderNode = (node: TreeNode, depth: number) => {
    let currentNode = node;
    let nameParts = [node.name];
    let isFolder = node.children.size > 0;

    // Compact folders: if a folder has exactly one child and that child is also a folder, merge them
    if (isFolder && node.path !== 'root') {
      while (currentNode.children.size === 1) {
        const child = Array.from(currentNode.children.values())[0];
        if (child.children.size > 0) {
          nameParts.push(child.name);
          currentNode = child;
        } else {
          break;
        }
      }
    }

    const isExpanded = expandedFolders.has(currentNode.path);
    const sortedChildren = Array.from(currentNode.children.values()).sort((a, b) => {
      const aIsFolder = a.children.size > 0;
      const bIsFolder = b.children.size > 0;
      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;
      return a.name.localeCompare(b.name);
    });

    if (node.path === 'root') {
      return (
        <div className="file-tree">
          {sortedChildren.map(child => renderNode(child, 0))}
        </div>
      );
    }

    const renderDisplayName = () => {
      return nameParts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ opacity: 0.4, margin: '0 2px' }}>/</span>}
          {part}
        </React.Fragment>
      ));
    };

    return (
      <div key={node.path} className="tree-node">
        <div 
          className={`file-item ${(!isFolder && !!multiSelect && selectedPaths?.has(currentNode.path)) ? 'selected' : ''}`}
          onClick={(e) => {
            if (isFolder) {
              toggleFolder(currentNode.path, e);
              return;
            }
            if (!currentNode.change) return;

            // Cmd+Click (macOS) / Ctrl+Click (win/linux) opens diff, normal click opens file.
            if ((e.metaKey || e.ctrlKey) && onSecondaryAction) {
              onSecondaryAction(currentNode.change);
              return;
            }

            // Multi-select mode (used for committed-file revert): click toggles selection and opens the file,
            // so the last clicked file is active in the editor.
            // Alt/Option toggles selection without opening.
            if (multiSelect && onToggleSelect) {
              const isSelected = selectedPaths?.has(currentNode.path) ?? false;
              const nextSelected = !isSelected;
              onToggleSelect(currentNode.path, nextSelected);
              if (!e.altKey) onFileClick(currentNode.change);
              return;
            }

            onFileClick(currentNode.change);
          }}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          {isFolder ? (
            <>
              <span className={`codicon ${isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
              <img 
                src={getFolderIcon(isExpanded)}
                alt="folder" 
                style={{ width: '16px', height: '16px', marginRight: '6px' }}
              />
            </>
          ) : (
            <>
              <span style={{ width: '18px', flexShrink: 0 }} />
              {selectable && currentNode.change && onToggleSelect && (
                <input
                  className="file-select-checkbox"
                  type="checkbox"
                  checked={selectedPaths?.has(currentNode.path) ?? false}
                  title={selectedPaths?.has(currentNode.path) ? 'Selected for commit' : 'Select for commit'}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onToggleSelect(currentNode.path, e.target.checked)}
                />
              )}
              <img 
                src={getFileIcon(node.name)} 
                alt="file" 
                style={{ width: '16px', height: '16px', marginRight: '6px' }}
              />
            </>
          )}

          <span className={`file-name ${currentNode.change?.status === 'D' ? 'deleted' : ''}`}>
            {renderDisplayName()}
            {currentNode.change?.oldPath && <span style={{ opacity: 0.6, fontSize: '0.9em', marginLeft: '4px' }}> ← {currentNode.change.oldPath}</span>}
          </span>

          {!isFolder && currentNode.change && (
            <div className="file-actions">
              {onSecondaryAction && (
                <span 
                  className="codicon codicon-diff" 
                  title="Open Diff"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSecondaryAction(currentNode.change!);
                  }}
                />
              )}
              {onRevertCommitted && (
                <span
                  className="codicon codicon-reply"
                  title="Revert this file into working tree"
                  onClick={(e) => {
                    e.stopPropagation();
                    const current = currentNode.path;
                    const selection = selectedPaths ? Array.from(selectedPaths) : [];
                    const shouldRevertSelection = !!multiSelect && selection.length > 1 && selection.includes(current);
                    const selectionChanges = shouldRevertSelection
                      ? selection.map(p => changeByPath.get(p)).filter(Boolean) as Change[]
                      : [currentNode.change!];
                    onRevertCommitted(selectionChanges);
                  }}
                />
              )}
              {onDiscard && (
                <span 
                  className="codicon codicon-discard" 
                  title="Discard changes"
                  onClick={(e) => {
                    e.stopPropagation();
                    const current = currentNode.path;
                    const selection = selectedPaths ? Array.from(selectedPaths) : [];
                    const shouldDiscardSelection = !!selectable && selection.length > 1 && selection.includes(current);
                    onDiscard(shouldDiscardSelection ? selection : [current]);
                  }}
                />
              )}
              <span className={`status-badge status-${currentNode.change.status.toLowerCase()}`}>
                {currentNode.change.status}
              </span>
            </div>
          )}
        </div>
        {isFolder && isExpanded && (
          <div className="tree-children">
            {sortedChildren.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return renderNode(root, 0);
};
