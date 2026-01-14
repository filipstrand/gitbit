import React, { useMemo, useEffect, useState } from 'react';
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
  onRevealInOS?: (change: Change) => void;
  onRevertCommitted?: (changes: Change[]) => void;
  onDiscard?: (paths: string[]) => void;
  selectable?: boolean;
  multiSelect?: boolean;
  selectedPaths?: Set<string>;
  onToggleSelect?: (path: string, selected: boolean) => void;
  /**
   * Folder expansion state is modeled as a "collapsed set".
   * If a folder path is present in `collapsedFolders`, it is collapsed; otherwise it's expanded.
   * If omitted, FileTree will manage its own collapsed state.
   */
  collapsedFolders?: Set<string>;
  onCollapsedFoldersChange?: (next: Set<string>) => void;
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
  onRevealInOS,
  onRevertCommitted,
  onDiscard,
  selectable,
  multiSelect,
  selectedPaths,
  onToggleSelect,
  collapsedFolders,
  onCollapsedFoldersChange
}) => {
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

  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState<Set<string>>(new Set());
  const isControlled = !!onCollapsedFoldersChange;
  const collapsed = collapsedFolders ?? uncontrolledCollapsed;

  // Prune collapsed entries that no longer exist in the current tree.
  // This keeps state stable across refreshes while avoiding growth over time.
  useEffect(() => {
    const current = collapsed ?? new Set<string>();
    const pruned = new Set<string>();
    for (const p of current) {
      if (allPaths.has(p)) pruned.add(p);
    }
    if (pruned.size === current.size) return;
    if (isControlled && onCollapsedFoldersChange) {
      onCollapsedFoldersChange(pruned);
    } else {
      setUncontrolledCollapsed(pruned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPaths]);

  const setCollapsed = (next: Set<string>) => {
    if (isControlled && onCollapsedFoldersChange) onCollapsedFoldersChange(next);
    else setUncontrolledCollapsed(next);
  };

  const toggleFolder = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(collapsed);
    // root is always expanded
    if (path === 'root') return;
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setCollapsed(next);
  };

  const getFileIcon = (
    fileName: string,
  ):
    | { kind: 'img'; src: string }
    | { kind: 'codicon'; className: string } => {
    const lower = fileName.toLowerCase();
    const ext = (lower.includes('.') ? lower.split('.').pop() : '') ?? '';
    const base = window.iconsUri;

    // 1) Exact filename mapping
    const byName = iconTheme.fileNames[lower];
    if (byName) return { kind: 'img', src: `${base}/${byName}` };

    // 2) Extension mapping
    const byExt = iconTheme.fileExtensions[ext];
    if (byExt) return { kind: 'img', src: `${base}/${byExt}` };

    // 3) Fallback
    return { kind: 'img', src: `${base}/custom/file.svg` };
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

    const isExpanded = currentNode.path === 'root' ? true : !collapsed.has(currentNode.path);
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
                src={`${window.iconsUri}/custom/${isExpanded ? 'folder-open.svg' : 'folder.svg'}`}
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
              {(() => {
                const icon = getFileIcon(node.name);
                if (icon.kind === 'img') {
                  return (
                    <img 
                      src={icon.src}
                      alt="file" 
                      style={{ width: '16px', height: '16px', marginRight: '6px' }}
                    />
                  );
                }
                return (
                  <span
                    className={`codicon ${icon.className}`}
                    style={{ marginRight: '6px' }}
                  />
                );
              })()}
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
              {onRevealInOS && (
                <span
                  className="codicon codicon-folder"
                  title="Reveal in Finder"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRevealInOS(currentNode.change!);
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
