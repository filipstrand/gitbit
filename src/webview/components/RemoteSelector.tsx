import React, { useEffect, useRef, useState } from 'react';
import { RemoteInfo } from '../../extension/protocol/types';

interface RemoteSelectorProps {
  remotes: RemoteInfo[];
  onOpen?: () => void;
  onAddRemote: () => void;
  onRemoveRemote: (name: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export const RemoteSelector: React.FC<RemoteSelectorProps> = ({
  remotes,
  onOpen,
  onAddRemote,
  onRemoveRemote,
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
              <button
                className="remote-add-row"
                onClick={() => {
                  onAddRemote();
                  setIsOpen(false);
                }}
              >
                + Add new remote
              </button>
              {remotes.length === 0 ? (
                <div className="remote-empty">No remotes configured</div>
              ) : (
                remotes.map((remote) => (
                  <div key={remote.name} className="remote-item" title={`${remote.name}\n${remote.url}`}>
                    <button
                      className="remote-remove-btn"
                      title={`Remove ${remote.name}`}
                      aria-label={`Remove ${remote.name}`}
                      onClick={() => onRemoveRemote(remote.name)}
                    >
                      ×
                    </button>
                    <div className="remote-line">
                      <span className="remote-name">{remote.name}</span>
                      <span className="remote-sep">|</span>
                      <span className="remote-url">{remote.url}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

