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
  label = '',
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
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        className="branch-selector-trigger"
        onClick={() => {
          if (disabled) return;
          const next = !isOpen;
          if (next) onOpen?.();
          setIsOpen(next);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const next = !isOpen;
            if (next) onOpen?.();
            setIsOpen(!isOpen);
          }
        }}
        title="Show configured remotes"
        aria-disabled={disabled}
      >
        <span className="branch-selector-trigger-text">Remotes</span>
        <span className="branch-selector-arrow codicon codicon-chevron-down" aria-hidden />
      </div>
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
                <span className="remote-add-icon">+</span> Add new remote
              </button>
              {remotes.length === 0 ? (
                <div className="remote-empty">No remotes configured</div>
              ) : (
                remotes.map((remote) => (
                  <div key={remote.name} className="remote-item" title={`${remote.name}\n${remote.url}`}>
                    <div className="remote-line">
                      <span className="remote-name">{remote.name}</span>
                      <span className="remote-sep">|</span>
                      <span className="remote-url">{remote.url}</span>
                    </div>
                    <span
                      className="remote-remove-btn codicon codicon-close"
                      role="button"
                      tabIndex={0}
                      title={`Remove ${remote.name}`}
                      aria-label={`Remove ${remote.name}`}
                      onClick={() => onRemoveRemote(remote.name)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRemoveRemote(remote.name);
                        }
                      }}
                    />
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

