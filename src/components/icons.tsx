import type { ReactNode } from 'react';

/**
 * Inline SVG icon set for the editor chrome (no icon-font/library deps).
 * Stroke-based on a 24-unit grid; color follows `currentColor`.
 */
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export type IconName =
  | 'select'
  | 'draw'
  | 'scene'
  | 'zone'
  | 'connector'
  | 'wall'
  | 'box'
  | 'duplicate'
  | 'reset'
  | 'undo'
  | 'redo'
  | 'play'
  | 'pause'
  | 'skipStart'
  | 'panelRight'
  | 'panelBottom'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'chevronUp';

const PATHS: Record<IconName, ReactNode> = {
  select: <path d="M5.5 3.5l6 16 2.2-7.3 7.3-2.2z" />,
  draw: (
    <>
      <path d="M4.8 18.2L9 10.5l5 3.5 5.4-9.5" />
      <circle cx="4.8" cy="18.2" r="1.5" />
      <circle cx="9" cy="10.5" r="1.5" />
      <circle cx="14" cy="14" r="1.5" />
      <circle cx="19.4" cy="4.5" r="1.5" />
    </>
  ),
  scene: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M4 12h16M12 4v16" />
    </>
  ),
  zone: (
    <>
      <rect x="3.5" y="7.5" width="12" height="12" rx="1.5" />
      <path d="M18 4.5v6M15 7.5h6" />
    </>
  ),
  connector: (
    <>
      <rect x="3" y="9" width="6" height="6" rx="1" />
      <rect x="15" y="9" width="6" height="6" rx="1" />
      <path d="M9 12h6" />
    </>
  ),
  wall: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="1" />
      <path d="M3 12h18M9 6v6M15 12v6" />
    </>
  ),
  box: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>
  ),
  duplicate: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 4.5h-9a2 2 0 0 0-2 2v9" />
    </>
  ),
  reset: (
    <>
      <path d="M4.5 10a8 8 0 1 1 1.8 8.4" />
      <path d="M4.5 4.5V10H10" />
    </>
  ),
  undo: (
    <>
      <path d="M9 15L4 10l5-5" />
      <path d="M4 10h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  redo: (
    <>
      <path d="M15 15l5-5-5-5" />
      <path d="M20 10H10a6 6 0 0 0 0 12h3" />
    </>
  ),
  play: <path d="M7.5 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M8.5 5v14M15.5 5v14" strokeWidth="2.6" />,
  skipStart: (
    <>
      <path d="M6 5v14" strokeWidth="2.2" />
      <path d="M19 5.5l-9 6.5 9 6.5z" fill="currentColor" stroke="none" />
    </>
  ),
  panelRight: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M15 4.5v15" />
    </>
  ),
  panelBottom: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 14h18" />
    </>
  ),
  chevronLeft: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  chevronRight: <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  chevronDown: <path d="M5.5 9.5L12 16l6.5-6.5" />,
  chevronUp: <path d="M5.5 14.5L12 8l6.5 6.5" />,
};
