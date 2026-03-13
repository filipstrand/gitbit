import React from 'react';

interface GlobalContextPickerProps {
  branches: string[];
  query: string;
  onQueryChange: (next: string) => void;
  onSelect: (branch: string) => void;
  onClose: () => void;
  anchorRect?: { left: number; right: number; bottom: number; width: number };
}

export const GlobalContextPicker: React.FC<GlobalContextPickerProps> = ({
  branches,
  query,
  onQueryChange,
  onSelect,
  onClose,
  anchorRect
}) => {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(b => b.toLowerCase().includes(q));
  }, [branches, query]);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  React.useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault();
        onSelect(filtered[0]);
      }
    };
    window.addEventListener('mousedown', onDocMouseDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onDocMouseDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [filtered, onClose, onSelect]);

  const style: React.CSSProperties = anchorRect
    ? {
        left: `${Math.max(10, anchorRect.right - 320)}px`,
        top: `${Math.max(10, anchorRect.bottom + 6)}px`
      }
    : { right: '12px', top: '68px' };

  return (
    <div className="global-context-picker" ref={rootRef} style={style}>
      <div className="global-context-picker-header">Choose context branch</div>
      <input
        ref={inputRef}
        className="global-context-picker-search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Filter branches..."
      />
      <div className="global-context-picker-list">
        {filtered.length === 0 ? (
          <div className="global-context-picker-empty">No matching branches</div>
        ) : (
          filtered.map(branch => (
            <button
              key={branch}
              className="global-context-picker-item"
              onClick={() => onSelect(branch)}
              title={branch}
            >
              {branch}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

