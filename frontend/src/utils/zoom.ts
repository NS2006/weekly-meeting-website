/** How a zoomed picture sits: its scale (1 = fitted to the screen) and how far it is moved from the middle. */
export interface ZoomView {
  scale: number;
  x: number;
  y: number;
}

export const FITTED: ZoomView = { scale: 1, x: 0, y: 0 };
export const MAX_ZOOM = 8;

/**
 * The view after zooming by `factor` around `point` (measured from the middle of the screen), so the spot under the
 * pointer stays under it. Never smaller than fitted (which puts it back in the middle) or larger than MAX_ZOOM.
 */
export function zoomAt(view: ZoomView, factor: number, point: { x: number; y: number }): ZoomView {
  const scale = Math.min(MAX_ZOOM, Math.max(1, view.scale * factor));
  if (scale === 1) return FITTED;
  const ratio = scale / view.scale;
  return { scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio };
}

/** The zoom shown on the toolbar, as a percentage of the fitted size. */
export const zoomLabel = (view: ZoomView) => `${Math.round(view.scale * 100)}%`;
