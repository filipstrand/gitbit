import React from 'react';

export type LucideIconName =
  | 'file'
  | 'file-text'
  | 'file-image'
  | 'file-code'
  | 'file-archive'
  | 'package'
  | 'settings'
  | 'lock'
  | 'folder'
  | 'folder-open';

type Props = {
  name: LucideIconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
};

export const LucideIcon: React.FC<Props> = ({ name, size = 16, className, style, title }) => {
  const common = {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    style,
  };

  switch (name) {
    case 'file':
      return (
        <svg {...common} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case 'file-text':
      return (
        <svg {...common} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    case 'file-image':
      return (
        <svg {...common} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <circle cx="10" cy="12" r="2" />
          <path d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 20" />
          <path d="m7 16 1.296-1.296a2.41 2.41 0 0 1 3.408 0L13 16" />
        </svg>
      );
    case 'file-code':
      return (
        <svg {...common} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M10 12.5 8 15l2 2.5" />
          <path d="m14 12.5 2 2.5-2 2.5" />
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case 'file-archive':
      return (
        <svg {...common} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M16 22h2a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h2" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M8 13h2" />
          <path d="M8 17h2" />
          <path d="M8 9h2" />
          <path d="M14 13h2" />
          <path d="M14 17h2" />
          <path d="M14 9h2" />
        </svg>
      );
    case 'package':
      return (
        <svg {...common} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="m7.5 4.27 9 5.15" />
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M3 12h6" />
          <path d="M15 12h6" />
          <path d="M9 6h12" />
          <path d="M3 6h2" />
          <path d="M3 18h12" />
          <path d="M19 18h2" />
          <circle cx="9" cy="12" r="2" />
          <circle cx="15" cy="6" r="2" />
          <circle cx="15" cy="18" r="2" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...common} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
      );
    case 'folder-open':
      return (
        <svg {...common} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title ? <title>{title}</title> : null}
          <path d="m6 14 1.5-2.5A2 2 0 0 1 9.2 10H20a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4.1a2 2 0 0 1 1.7.9L10.6 6H20a2 2 0 0 1 2 2v2" />
        </svg>
      );
    default:
      return null;
  }
};

