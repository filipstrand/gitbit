import React from 'react';

interface GlobalContextPickerProps {
  branches: string[];
  query: string;
  onQueryChange: (next: string) => void;
  onSelect: (branch: string) => void;
  onClose: () => void;
  anchorRect?: { top: number; left: number; right: number; bottom: number; width: number };
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
  const VIEWPORT_PADDING = 8;
  const [pos, setPos] = React.useState<{ left: number; top: number }>(() => (
    anchorRect
      ? {
          left: Math.max(VIEWPORT_PADDING, anchorRect.right - 320),
          top: Math.max(VIEWPORT_PADDING, anchorRect.bottom + 6)
        }
      : { left: Math.max(VIEWPORT_PADDING, window.innerWidth - 332), top: 68 }
  ));

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(b => b.toLowerCase().includes(q));
  }, [branches, query]);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  React.useLayoutEffect(() => {
    const next = anchorRect
      ? {
          left: Math.max(VIEWPORT_PADDING, anchorRect.right - 320),
          top: Math.max(VIEWPORT_PADDING, anchorRect.bottom + 6)
        }
      : { left: Math.max(VIEWPORT_PADDING, window.innerWidth - 332), top: 68 };
    setPos(next);
  }, [anchorRect]);

  React.useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;

    let nextLeft = pos.left;
    let nextTop = pos.top;

    if (anchorRect && anchorRect.bottom + 6 + r.height > window.innerHeight - VIEWPORT_PADDING) {
      nextTop = anchorRect.top - r.height - 6;
    }

    const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - r.width - VIEWPORT_PADDING);
    const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - r.height - VIEWPORT_PADDING);
    nextLeft = Math.max(VIEWPORT_PADDING, Math.min(nextLeft, maxLeft));
    nextTop = Math.max(VIEWPORT_PADDING, Math.min(nextTop, maxTop));

    if (nextLeft !== pos.left || nextTop !== pos.top) {
      setPos({ left: nextLeft, top: nextTop });
    }
  }, [anchorRect, branches.length, filtered.length, pos.left, pos.top]);

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

  const style: React.CSSProperties = {
    left: `${pos.left}px`,
    top: `${pos.top}px`
  };

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

