import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { dropIndex, shiftOf, type Point, type Slot } from '../utils/dragSort';

/** How long a press is held before the item lifts: short with a mouse, longer on a touch screen (a swipe scrolls). */
const HOLD_MS = { mouse: 180, touch: 350 };
/** How far the pointer may move during the hold: a mouse that moves this far starts the drag; a finger, a scroll. */
const SLOP_PX = { mouse: 6, touch: 10 };
/** Near the top or bottom of the window (the header covers the top), the page scrolls while dragging. */
const EDGE_TOP_PX = 140;
const EDGE_BOTTOM_PX = 90;
const MAX_SCROLL_PX = 16;

interface Session {
  id: string;
  index: number;
  pointerId: number;
  kind: 'mouse' | 'touch';
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  timer: number;
  started: boolean;
  startScrollY: number;
  slots: Slot[];
  center: Point;
  to: number;
  frame: number;
}

interface DragState {
  from: number;
  to: number;
  slots: Slot[];
}

type Layout = 'list' | 'grid';

interface Options {
  /** The items' ids, in their order on the screen (in a grid: left to right, row by row). */
  ids: readonly string[];
  enabled: boolean;
  /** A list moves up and down; a grid in both directions. */
  layout?: Layout;
  /** Called on drop (and on Alt+↑ / Alt+↓) with the old and the new index. */
  onMove: (from: number, to: number) => void;
}

interface Refs {
  items: Map<string, HTMLElement>;
  handles: Map<string, HTMLElement>;
  latest: { ids: readonly string[]; onMove: (from: number, to: number) => void; layout: Layout };
  session: Session | null;
}

/**
 * The drag itself, made once per list so the listeners added on a press are the same ones removed on release
 * (whatever the list re-rendered in between). It reads the current ids and callback through `refs`.
 */
function createEngine(refs: Refs, setDrag: (update: (current: DragState | null) => DragState | null) => void) {
  function follow() {
    const s = refs.session;
    if (!s?.started) return;
    const element = refs.items.get(s.id);
    const dx = refs.latest.layout === 'grid' ? s.lastX - s.startX : 0;
    const dy = s.lastY + window.scrollY - (s.startY + s.startScrollY);
    if (element) element.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.01)`;
    const to = dropIndex(s.slots, { x: s.center.x + dx, y: s.center.y + dy });
    if (to !== s.to) {
      s.to = to;
      setDrag((current) => (current ? { ...current, to } : current));
    }
  }

  function scrollNearEdges() {
    const s = refs.session;
    if (!s?.started) return;
    const y = s.lastY;
    const bottom = window.innerHeight - EDGE_BOTTOM_PX;
    let speed = 0;
    if (y < EDGE_TOP_PX) speed = -MAX_SCROLL_PX * Math.min(1, (EDGE_TOP_PX - y) / EDGE_TOP_PX);
    else if (y > bottom) speed = MAX_SCROLL_PX * Math.min(1, (y - bottom) / EDGE_BOTTOM_PX);
    if (speed !== 0) {
      window.scrollBy(0, speed);
      follow();
    }
    s.frame = requestAnimationFrame(scrollNearEdges);
  }

  function begin() {
    const s = refs.session;
    if (!s || s.started) return;
    window.clearTimeout(s.timer);
    s.slots = refs.latest.ids.map((id) => {
      const rect = refs.items.get(id)?.getBoundingClientRect();
      return { left: rect?.left ?? 0, top: (rect?.top ?? 0) + window.scrollY, width: rect?.width ?? 0, height: rect?.height ?? 0 };
    });
    const slot = s.slots[s.index];
    if (!slot) return end(false);
    s.started = true;
    s.startScrollY = window.scrollY;
    s.center = { x: slot.left + slot.width / 2, y: slot.top + slot.height / 2 };
    s.to = s.index;
    const slots = s.slots;
    setDrag(() => ({ from: s.index, to: s.index, slots }));
    document.body.classList.add('is-sorting');
    window.addEventListener('touchmove', stopScroll, { passive: false });
    window.addEventListener('keydown', onEscape);
    if (s.kind === 'touch') navigator.vibrate?.(10);
    follow();
    s.frame = requestAnimationFrame(scrollNearEdges);
  }

  function end(commit: boolean) {
    const s = refs.session;
    if (!s) return;
    refs.session = null;
    window.clearTimeout(s.timer);
    cancelAnimationFrame(s.frame);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('touchmove', stopScroll);
    window.removeEventListener('keydown', onEscape);
    document.body.classList.remove('is-sorting');
    if (!s.started) return;
    const element = refs.items.get(s.id);
    if (element) element.style.transform = '';
    setDrag(() => null);
    // The press that ended the drag is not also a click (which would open the card).
    window.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    if (commit && s.to !== s.index) refs.latest.onMove(s.index, s.to);
  }

  function onPointerMove(event: PointerEvent) {
    const s = refs.session;
    if (!s || event.pointerId !== s.pointerId) return;
    s.lastX = event.clientX;
    s.lastY = event.clientY;
    if (s.started) return follow();
    if (Math.hypot(event.clientX - s.startX, event.clientY - s.startY) > SLOP_PX[s.kind]) {
      // A mouse that moves picks the item up at once; a finger that moves is scrolling the page.
      if (s.kind === 'mouse') begin();
      else end(false);
    }
  }
  function onPointerUp(event: PointerEvent) {
    if (event.pointerId === refs.session?.pointerId) end(true);
  }
  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId === refs.session?.pointerId) end(false);
  }
  function onEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      end(false);
    }
  }
  function stopScroll(event: TouchEvent) {
    if (event.cancelable) event.preventDefault();
  }
  function swallow(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  return {
    end,
    press(id: string, event: ReactPointerEvent<HTMLElement>) {
      if (refs.session || event.button !== 0 || !event.isPrimary) return;
      const index = refs.latest.ids.indexOf(id);
      if (index < 0) return;
      const kind = event.pointerType === 'mouse' ? 'mouse' : 'touch';
      refs.session = {
        id,
        index,
        pointerId: event.pointerId,
        kind,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        timer: window.setTimeout(begin, HOLD_MS[kind]),
        started: false,
        startScrollY: 0,
        slots: [],
        center: { x: 0, y: 0 },
        to: index,
        frame: 0,
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
    },
    pressedByTouch: () => refs.session?.kind === 'touch',
  };
}

/**
 * A vertical list people put in order by holding an item and dragging it (owner, 2026-11-23): press and hold the
 * handle (a short hold with a mouse, a longer one on a touch screen, where a swipe still scrolls the page), drag, and
 * let go. The other items move aside to show where it lands (in a grid, each steps into its neighbour's place, so
 * the order still reads left to right, row by row); near the window's top or bottom the page scrolls; Escape puts it
 * back. A quick press is still a click. From the keyboard, Alt+↑ / Alt+↓ on the handle moves it one place earlier or
 * later. Plain pointer events, so it works with a mouse, a finger or a pen and needs no library.
 */
export function useDragSort({ ids, enabled, onMove, layout = 'list' }: Options) {
  const refs = useRef<Refs>({ items: new Map(), handles: new Map(), latest: { ids, onMove, layout }, session: null }).current;
  refs.latest = { ids, onMove, layout };
  const [drag, setDrag] = useState<DragState | null>(null);
  const [engine] = useState(() => createEngine(refs, setDrag));
  const itemRefs = useRef(new Map<string, (el: HTMLElement | null) => void>()).current;
  const handleRefs = useRef(new Map<string, (el: HTMLElement | null) => void>()).current;

  // Stops a drag if the list goes away mid-way.
  useEffect(() => () => engine.end(false), [engine]);

  const refFor = (cache: Map<string, (el: HTMLElement | null) => void>, into: Map<string, HTMLElement>, id: string) => {
    let ref = cache.get(id);
    if (!ref) {
      ref = (el) => {
        if (el) into.set(id, el);
        else into.delete(id);
      };
      cache.set(id, ref);
    }
    return ref;
  };

  return {
    /** True while an item is lifted. */
    dragging: drag !== null,

    /** For each item's outer element: where it is measured and moved. */
    itemProps(id: string): { ref: (el: HTMLElement | null) => void; style?: CSSProperties; 'data-dragging'?: 'true' } {
      const ref = refFor(itemRefs, refs.items, id);
      if (!drag) return { ref };
      const index = ids.indexOf(id);
      if (index === drag.from) return { ref, style: { position: 'relative', zIndex: 30 }, 'data-dragging': 'true' };
      const shift = shiftOf(index, drag.from, drag.to, drag.slots, layout);
      const transition = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? undefined : 'transform 160ms ease';
      const moved = shift.x !== 0 || shift.y !== 0;
      return { ref, style: { transform: moved ? `translate3d(${shift.x}px, ${shift.y}px, 0)` : undefined, transition } };
    },

    /** For the part people hold to drag it (the item itself, or its top bar). Nothing when sorting is off. */
    handleProps(id: string) {
      if (!enabled || ids.length < 2) return {};
      return {
        ref: refFor(handleRefs, refs.handles, id),
        'data-sortable': 'true',
        'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown',
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => engine.press(id, event),
        // A long press on a touch screen would open the browser's menu, and pictures would start the browser's own drag.
        onContextMenu: (event: ReactMouseEvent) => {
          if (engine.pressedByTouch()) event.preventDefault();
        },
        onDragStart: (event: ReactDragEvent) => event.preventDefault(),
        onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
          // Not Alt+← / Alt+→: those are the browser's Back and Forward.
          const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
          if (!event.altKey || step === 0) return;
          event.preventDefault();
          const from = refs.latest.ids.indexOf(id);
          const to = from + step;
          if (from < 0 || to < 0 || to >= refs.latest.ids.length) return;
          refs.latest.onMove(from, to);
          // The list re-renders in the new order; keep the focus on the item that moved.
          requestAnimationFrame(() => refs.handles.get(id)?.focus());
        },
      };
    },
  };
}
