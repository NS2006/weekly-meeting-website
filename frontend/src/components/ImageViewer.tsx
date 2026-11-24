import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FITTED, MAX_ZOOM, zoomAt, zoomLabel, type ZoomView } from '../utils/zoom';
import './ImageViewer.css';

/** One press of + or −, and a click on the fitted picture. */
const STEP = 1.5;
const CLICK_ZOOM = 2.5;
/** How far a press may move and still count as a click. */
const CLICK_SLOP_PX = 4;

export interface ViewedImage {
  src: string;
  alt: string;
}

/**
 * A picture of a note on the whole screen (owner, 2026-11-23: screenshots in notes are often too small to read). It
 * opens fitted to the screen; the mouse wheel, a pinch, + / −, or a click on the picture zoom in (around the pointer),
 * and a zoomed picture is dragged to look around. Escape, × or a click on the dark area closes it. A native <dialog>,
 * so it sits above the note reader (also a dialog) and keeps the focus inside; it is put under <body> so the note's
 * styles do not reach it.
 */
export function ImageViewer({ image, onClose }: { image: ViewedImage | null; onClose: () => void }) {
  if (!image) return null;
  return createPortal(<Viewer key={image.src} src={image.src} alt={image.alt} onClose={onClose} />, document.body);
}

interface Gesture {
  moved: boolean;
  onPicture: boolean;
  startX: number;
  startY: number;
  /** Two fingers: their distance and the view when the pinch began. */
  pinch: { distance: number; view: ZoomView } | null;
}

function Viewer({ src, alt, onClose }: ViewedImage & { onClose: () => void }) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<ZoomView>(FITTED);
  const [moving, setMoving] = useState(false);
  const [overPicture, setOverPicture] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const zoomed = view.scale > 1;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // close() first, so the browser puts the focus back where it was (the picture in the note).
  const close = () => {
    dialog.current?.close();
    onClose();
  };

  /** A point on the screen, measured from the middle of the picture's area. */
  const fromMiddle = (clientX: number, clientY: number) => {
    const box = stage.current?.getBoundingClientRect();
    return box ? { x: clientX - (box.left + box.width / 2), y: clientY - (box.top + box.height / 2) } : { x: 0, y: 0 };
  };

  // The wheel zooms around the pointer (a listener of our own: React's wheel listener cannot stop the page scrolling).
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
      const point = fromMiddle(event.clientX, event.clientY);
      setView((current) => zoomAt(current, Math.exp(-delta * 0.0015), point));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  /**
   * Whether a point is on the picture itself: the <img> fills the area and draws the picture "contained" in it, so the
   * strips beside or above a picture of another shape are part of the element but not of the picture.
   */
  const onThePicture = (clientX: number, clientY: number) => {
    const img = picture.current;
    if (!img?.naturalWidth || !img.naturalHeight) return false;
    const box = img.getBoundingClientRect(); // already zoomed and moved
    const fit = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const middleX = box.left + box.width / 2;
    const middleY = box.top + box.height / 2;
    return Math.abs(clientX - middleX) <= (img.naturalWidth * fit) / 2 && Math.abs(clientY - middleY) <= (img.naturalHeight * fit) / 2;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId); // keep getting its moves outside the area
    } catch {
      // A pointer the browser no longer tracks: the gesture still works without capture.
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      gesture.current = {
        moved: false,
        onPicture: onThePicture(event.clientX, event.clientY),
        startX: event.clientX,
        startY: event.clientY,
        pinch: null,
      };
    } else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      gesture.current.moved = true;
      gesture.current.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, view };
      setMoving(true);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const before = pointers.current.get(event.pointerId);
    const g = gesture.current;
    if (!before || !g) {
      // Not pressed: only the cursor follows (zoom-in over the picture, the plain arrow beside it).
      const over = onThePicture(event.clientX, event.clientY);
      if (over !== overPicture) setOverPicture(over);
      return;
    }
    const now = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, now);
    if (g.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const middle = fromMiddle((a.x + b.x) / 2, (a.y + b.y) / 2);
      setView(zoomAt(g.pinch.view, Math.hypot(a.x - b.x, a.y - b.y) / g.pinch.distance, middle));
      return;
    }
    if (!g.moved && Math.hypot(now.x - g.startX, now.y - g.startY) > CLICK_SLOP_PX) {
      g.moved = true;
      setMoving(true);
    }
    if (g.moved) setView((current) => (current.scale > 1 ? { ...current, x: current.x + now.x - before.x, y: current.y + now.y - before.y } : current));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId) || pointers.current.size > 0) return;
    const g = gesture.current;
    gesture.current = null;
    setMoving(false);
    if (!g || g.moved) return;
    // A click: on the picture it zooms in there (or back to fitted); on the dark area around it, it closes.
    if (!g.onPicture) return close();
    const point = fromMiddle(event.clientX, event.clientY);
    setView((current) => (current.scale > 1 ? FITTED : zoomAt(current, CLICK_ZOOM, point)));
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      setMoving(false);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    // Keys stay in here: ← and → must not also move the note reader behind to another note.
    event.stopPropagation();
    const pan = 80;
    const keys: Record<string, () => void> = {
      '+': () => setView((v) => zoomAt(v, STEP, { x: 0, y: 0 })),
      '=': () => setView((v) => zoomAt(v, STEP, { x: 0, y: 0 })),
      '-': () => setView((v) => zoomAt(v, 1 / STEP, { x: 0, y: 0 })),
      '0': () => setView(FITTED),
      ArrowLeft: () => setView((v) => (v.scale > 1 ? { ...v, x: v.x + pan } : v)),
      ArrowRight: () => setView((v) => (v.scale > 1 ? { ...v, x: v.x - pan } : v)),
      ArrowUp: () => setView((v) => (v.scale > 1 ? { ...v, y: v.y + pan } : v)),
      ArrowDown: () => setView((v) => (v.scale > 1 ? { ...v, y: v.y - pan } : v)),
    };
    const action = event.ctrlKey || event.metaKey || event.altKey ? undefined : keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <dialog
      ref={dialog}
      className="image-viewer"
      aria-label={alt ? t('ui.imageViewer.pictureOf', { alt }) : t('ui.imageViewer.picture')}
      onCancel={(event) => {
        // Escape closes only this, not the note reader behind it (React passes the event up its own tree).
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="image-viewer__bar">
        <span className="image-viewer__caption">{alt}</span>
        <div className="image-viewer__tools">
          <button type="button" className="image-viewer__tool" aria-label={t('ui.imageViewer.zoomOut')} disabled={!zoomed} onClick={() => setView((v) => zoomAt(v, 1 / STEP, { x: 0, y: 0 }))}>
            −
          </button>
          <span className="image-viewer__zoom" aria-live="polite">
            {zoomLabel(view)}
          </span>
          <button type="button" className="image-viewer__tool" aria-label={t('ui.imageViewer.zoomIn')} disabled={view.scale >= MAX_ZOOM} onClick={() => setView((v) => zoomAt(v, STEP, { x: 0, y: 0 }))}>
            +
          </button>
          <button type="button" className="image-viewer__tool" aria-label={t('ui.imageViewer.close')} onClick={close}>
            ×
          </button>
        </div>
      </div>
      <div
        ref={stage}
        className={[
          'image-viewer__stage',
          zoomed ? 'image-viewer__stage--zoomed' : '',
          moving ? 'image-viewer__stage--moving' : '',
          overPicture ? 'image-viewer__stage--over' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <img
          ref={picture}
          className="image-viewer__picture"
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        />
      </div>
      <p className="image-viewer__hint">
        <span className="image-viewer__hint--mouse">{t('ui.imageViewer.hintMouse')}</span>
        <span className="image-viewer__hint--touch">{t('ui.imageViewer.hintTouch')}</span>
      </p>
    </dialog>
  );
}
