import type { ReactNode } from 'react';

/** 18 px line icons for the editor toolbar (currentColor, so they follow the button's state color). */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const MoreIcon = () => (
  <Icon>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Icon>
);
export const UndoIcon = () => (
  <Icon>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
);
export const RedoIcon = () => (
  <Icon>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Icon>
);
const lines = (x: [number, number, number, number]) => (
  <>
    <path d={`M${x[0]} 6h${18 - 2 * (x[0] - 3)}`} />
    <path d={`M${x[1]} 10h${18 - 2 * (x[1] - 3)}`} />
    <path d={`M${x[2]} 14h${18 - 2 * (x[2] - 3)}`} />
    <path d={`M${x[3]} 18h${18 - 2 * (x[3] - 3)}`} />
  </>
);
export const AlignLeftIcon = () => (
  <Icon>
    <path d="M3 6h18M3 10h12M3 14h18M3 18h12" />
  </Icon>
);
export const AlignCenterIcon = () => <Icon>{lines([3, 6, 3, 6])}</Icon>;
export const AlignRightIcon = () => (
  <Icon>
    <path d="M3 6h18M9 10h12M3 14h18M9 18h12" />
  </Icon>
);
export const AlignJustifyIcon = () => (
  <Icon>
    <path d="M3 6h18M3 10h18M3 14h18M3 18h18" />
  </Icon>
);
export const BulletListIcon = () => (
  <Icon>
    <path d="M9 6h12M9 12h12M9 18h12" />
    <circle cx="4" cy="6" r="1" fill="currentColor" />
    <circle cx="4" cy="12" r="1" fill="currentColor" />
    <circle cx="4" cy="18" r="1" fill="currentColor" />
  </Icon>
);
export const OrderedListIcon = () => (
  <Icon>
    <path d="M10 6h11M10 12h11M10 18h11" />
    <path d="M4 4.5 5 4v4" strokeWidth="1.6" />
    <path d="M3.6 14.2a1.2 1.2 0 0 1 2.3.4c0 .9-2.3 1.9-2.3 3.4h2.4" strokeWidth="1.6" />
  </Icon>
);
export const QuoteIcon = () => (
  <Icon>
    <path d="M6 17c-1.7-.4-3-2-3-4V9a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H6" />
    <path d="M17 17c-1.7-.4-3-2-3-4V9a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
  </Icon>
);
export const CodeBlockIcon = () => (
  <Icon>
    <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />
  </Icon>
);
export const LinkIcon = () => (
  <Icon>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </Icon>
);
export const ImageIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="m21 16-5-5-9 9" />
  </Icon>
);
export const TableIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M3 15h18M10 4v16" />
  </Icon>
);
export const DividerIcon = () => (
  <Icon>
    <path d="M3 12h18" />
    <path d="M8 6h8M8 18h8" strokeOpacity="0.4" />
  </Icon>
);
export const ProjectIcon = () => (
  <Icon>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M8 13h8" />
  </Icon>
);
