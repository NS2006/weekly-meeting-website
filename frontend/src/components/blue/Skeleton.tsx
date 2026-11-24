import type { CSSProperties } from 'react';

// BLUE3 skeleton loading → BlueSkeleton: a shimmering placeholder with the shape of the content to come.
export function BlueSkeleton({ width = '100%', height = 16, radius, className = '' }: {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: CSSProperties['borderRadius'];
  className?: string;
}) {
  return (
    <span
      className={`blue-skeleton ${className}`.trim()}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}
