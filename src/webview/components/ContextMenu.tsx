import React from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  actions: {
    label?: string;
    onClick?: () => void | Promise<unknown>;
    danger?: boolean;
    tone?: 'warning' | 'success';
    icon?: string;
    disabled?: boolean;
    primary?: boolean;
    separator?: boolean;
  }[];
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, actions }) => {
  return (
    <>  
      <div 
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} 
        onClick={onClose}
      />
      <div style={{
        position: 'fixed',
        top: y,
        left: x,
        backgroundColor: 'var(--vscode-menu-background)',
        color: 'var(--vscode-menu-foreground)',
        border: '1px solid var(--vscode-menu-border)',
        borderRadius: '3px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        zIndex: 1000,
        padding: '4px 0',
        minWidth: '160px'
      }}>
        {actions.map((action, i) => {
          if (action.separator) {
            return (
              <div
                key={`sep-${i}`}
                style={{
                  height: '1px',
                  backgroundColor: 'var(--vscode-menu-separatorBackground, var(--vscode-panel-border))',
                  margin: '4px 0'
                }}
              />
            );
          }

          const disabled = !!action.disabled;
          const label = action.label || '';
          const baseColor =
            action.danger
              ? 'var(--vscode-errorForeground)'
              : action.tone === 'warning'
                ? 'var(--vscode-editorWarning-foreground, #d19a66)'
                : action.tone === 'success'
                  ? 'var(--vscode-gitDecoration-addedResourceForeground, #73c991)'
                  : 'inherit';
          const isToned = !!action.danger || !!action.tone;

          return (
          <div
            key={i}
              onClick={() => {
                if (disabled) return;
                action.onClick?.();
                onClose();
              }}
            style={{
              padding: '6px 12px',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.45 : 1,
              color: baseColor,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
                gap: '8px',
                fontWeight: action.primary ? 600 : 400
            }}
            className="menu-item"
            onMouseEnter={(e) => {
                if (disabled) return;
              e.currentTarget.style.backgroundColor = 'var(--vscode-menu-selectionBackground)';
              e.currentTarget.style.color = isToned ? baseColor : 'var(--vscode-menu-selectionForeground)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = baseColor;
            }}
          >
            {action.icon ? (
              <span
                className={`codicon ${action.icon}`}
                style={{ width: '16px', textAlign: 'center', opacity: 0.9 }}
              />
            ) : (
              <span style={{ width: '16px' }} />
            )}
              <span style={{ flex: 1 }}>{label}</span>
          </div>
          );
        })}
      </div>
    </>
  );
};
