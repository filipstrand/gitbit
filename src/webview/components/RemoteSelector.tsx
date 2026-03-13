import React, { useEffect, useRef, useState } from 'react';
import { RemoteInfo } from '../../extension/protocol/types';

interface RemoteSelectorProps {
  remotes: RemoteInfo[];
  onOpen?: () => void;
  onAddRemote: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export const RemoteSelector: React.FC<RemoteSelectorProps> = ({
  remotes,
  onOpen,
  onAddRemote,
  label = 'Remotes:',
  className = '',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    if (disabled) setIsOpen(false);
  }, [disabled]);

  return (
    <div className={`branch-selector-container ${className} ${disabled ? 'is-disabled' : ''}`} ref={containerRef}>
      {!!label && <span className="toolbar-label">{label}</span>}
      <button
        className="branch-selector-trigger"
        onClick={() => {
          if (disabled) return;
          const next = !isOpen;
          if (next) onOpen?.();
          setIsOpen(next);
        }}
        disabled={disabled}
        title="Show configured remotes"
      >
        Remotes
      </button>
      {isOpen && !disabled && (
        <div className="branch-selector-popup remote-selector-popup">
          <div className="branch-popup-content">
            <div className="branch-list">
              {remotes.length === 0 ? (
                <div className="remote-empty">No remotes configured</div>
              ) : (
                remotes.map((remote) => (
                  <div key={remote.name} className="remote-item" title={`${remote.name}\n${remote.fetchUrl}`}>
                    <div className="remote-name">{remote.name}</div>
                    <div className="remote-url">fetch: {remote.fetchUrl}</div>
                    <div className="remote-url">push: {remote.pushUrl}</div>
                  </div>
                ))
              )}
            </div>
            <div className="remote-actions">
              <button
                className="toolbar-button secondary"
                onClick={() => {
                  onAddRemote();
                  setIsOpen(false);
                }}
              >
                Add remote...
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

