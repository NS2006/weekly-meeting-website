import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './projectNav.css';

export interface ProjectNavItem {
  /** Stable while the note is open (the section's place among the sections). */
  key: string;
  /** The project's name; null for a section without a project. */
  name: string | null;
}

/**
 * "Projects in this note", like Word's navigation pane (owner, 2026-11-23): one entry per project section, the one
 * being read highlighted, a click jumping to it. Used beside a note in the meeting board's reader and in the editor;
 * each place decides where it sits (a column that stays in view, or a row of chips on narrow screens) and how to jump.
 */
export function ProjectNav({
  items,
  active,
  onGo,
  className = '',
}: {
  items: ProjectNavItem[];
  active: string | null;
  onGo: (key: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <nav className={`project-nav ${className}`.trim()} aria-label={t('notes.projectNav.title')}>
      <p className="project-nav__title">{t('notes.projectNav.title')}</p>
      <ul className="project-nav__list">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className={`project-nav__item ${item.key === active ? 'project-nav__item--active' : ''}`.trim()}
              aria-current={item.key === active ? 'location' : undefined}
              onClick={() => onGo(item.key)}
            >
              {item.name ?? <span className="project-nav__untagged">{t('notes.projectNav.untagged')}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Which section is being read: the last one whose top has scrolled past `offset` (from the top of the scrolling box,
 * or of the window), and the last one once the end is reached (a short last section never reaches the top). Returns
 * the key and `choose`, for a click: it marks that section and keeps it marked while the jump scrolls, even when the
 * page cannot scroll it all the way up, until the person scrolls or presses something again.
 */
export function useActiveSection(
  keys: readonly string[],
  elementOf: (key: string) => Element | null,
  scroller: HTMLElement | Window | null,
  offset: () => number,
) {
  const [active, setActive] = useState<string | null>(keys[0] ?? null);
  const latest = useRef({ keys, elementOf, offset });
  latest.current = { keys, elementOf, offset };
  // After a click, the jump's own scrolling does not move the mark; the person's next wheel, touch, key or press does.
  const chosen = useRef(false);

  useEffect(() => {
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const { keys: all, elementOf: find, offset: gap } = latest.current;
      const inWindow = scroller instanceof Window;
      const edge = (inWindow ? 0 : scroller.getBoundingClientRect().top) + gap();
      const scrolled = inWindow ? window.scrollY : scroller.scrollTop;
      const atEnd = inWindow
        ? window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
        : scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      let current = all[0] ?? null;
      for (const key of all) {
        const element = find(key);
        if (element && element.getBoundingClientRect().top <= edge) current = key;
      }
      if (atEnd && scrolled > 0) current = all[all.length - 1] ?? current;
      setActive(current);
    };
    const onScroll = () => {
      if (!chosen.current && !frame) frame = requestAnimationFrame(update);
    };
    const release = () => {
      chosen.current = false;
    };
    const inputs = ['wheel', 'touchmove', 'keydown', 'mousedown'] as const;
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    for (const name of inputs) window.addEventListener(name, release, { capture: true, passive: true });
    if (!chosen.current) update();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      for (const name of inputs) window.removeEventListener(name, release, { capture: true });
      cancelAnimationFrame(frame);
    };
  }, [scroller, keys.join(' ')]);

  const choose = (key: string) => {
    chosen.current = true;
    setActive(key);
  };
  return [active, choose] as const;
}

/** Smooth scrolling, unless the person asked for less motion. */
export const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
