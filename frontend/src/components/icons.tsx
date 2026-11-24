import type { ReactNode } from 'react';

// Small line icons shared by pages (stroke follows the text color). Decorative: callers hide them from screen readers.
function Icon({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const TeamsIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M16.5 14c2.4.2 4 1.8 4.5 4.5" />
  </Icon>
);

export const UsersIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 20c.7-3.6 3.3-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.3" />
    <path d="m15.5 18.5 2 2 4-4.5" />
  </Icon>
);

export const NotesIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M14 3v5h5M9 12h7M9 16h5" />
  </Icon>
);

export const CalendarIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M8 3v4M16 3v4M3.5 10h17M8 14h3" />
  </Icon>
);

export const RepeatIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3" />
  </Icon>
);

export const MoveIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Icon>
);
