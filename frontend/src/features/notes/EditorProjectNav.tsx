import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useNoteProjects } from './noteProjects';
import { ProjectNav, scrollBehavior, useActiveSection } from './ProjectNav';

/** The project id of each top-level section of the note, in order (null: a section without a project). */
function sectionsOf(editor: Editor): (string | null)[] {
  const ids: (string | null)[] = [];
  editor.state.doc.forEach((node) => {
    if (node.type.name === 'projectSection') ids.push(typeof node.attrs.projectId === 'string' ? node.attrs.projectId : null);
  });
  return ids;
}

/** Where the n-th section starts in the document as it is now. */
function sectionPos(editor: Editor, n: number): number | null {
  let seen = -1;
  let found: number | null = null;
  editor.state.doc.forEach((node, offset) => {
    if (found === null && node.type.name === 'projectSection' && ++seen === n) found = offset;
  });
  return found;
}

/** The toolbar's bottom edge on the screen now, and once it has stuck under the app header while scrolling. */
function toolbarBottom(): { now: number; stuck: number } {
  const toolbar = document.querySelector<HTMLElement>('.note-toolbar');
  if (!toolbar) return { now: 0, stuck: 0 };
  return { now: toolbar.getBoundingClientRect().bottom, stuck: (parseFloat(getComputedStyle(toolbar).top) || 0) + toolbar.offsetHeight };
}

/** Scrolls the page so the n-th section starts just below the toolbar; its element, or null when there is none. */
function scrollToSection(editor: Editor, n: number, behavior: ScrollBehavior = scrollBehavior()): HTMLElement | null {
  const pos = sectionPos(editor, n);
  if (pos === null) return null;
  const element = editor.view.nodeDOM(pos) as HTMLElement | null;
  if (element) {
    const top = element.getBoundingClientRect().top + window.scrollY - toolbarBottom().stuck - 12;
    window.scrollTo({ top: Math.max(0, top), behavior });
  }
  return element;
}

/** How long the section a note was opened at stays lit (the CSS animation's length). */
const FOUND_MS = 2400;
/** How long that section is kept in place while the page above it is still loading. */
const KEEP_IN_PLACE_MS = 3000;

/**
 * "Projects in this note" while writing (owner, 2026-11-23): the note's project sections, kept up to date as sections
 * are added, removed or tagged with another project. Like Word's navigation pane it sits left of the page and stays
 * in view (owner, 2026-11-24: from 1024 px wide, where the toolbar still fits on one line beside it; the page moves
 * right to make room where the screen has none beside it); on a phone or a narrow window it is a row of chips above
 * the page. A click only scrolls to the section: moving the caret there would
 * be a change to the editor, and the editor's first change adds an empty line after a final section (so you can write
 * below it), which would save the note just for looking around.
 */
export function EditorProjectNav({ editor, openAt }: { editor: Editor; openAt?: number | undefined }) {
  const { find } = useNoteProjects();
  const [ids, setIds] = useState(() => sectionsOf(editor));
  const beside = useMediaQuery('(min-width: 1024px)');

  // Only when the list itself changes (typing inside a section changes nothing here).
  useEffect(() => {
    const update = () =>
      setIds((current) => {
        const next = sectionsOf(editor);
        return next.length === current.length && next.every((id, i) => id === current[i]) ? current : next;
      });
    update();
    editor.on('update', update);
    return () => {
      editor.off('update', update);
    };
  }, [editor]);

  const keys = ids.map((_, i) => String(i));
  const elementOf = (key: string) => {
    const pos = sectionPos(editor, Number(key));
    return pos === null ? null : (editor.view.nodeDOM(pos) as Element | null);
  };
  const [active, setActive] = useActiveSection(keys, elementOf, window, () => toolbarBottom().now + 24);

  // Opened from a project page's "Edit" (owner, 2026-11-25): the page opens at that update's section, as an anchor
  // link does (no smooth scroll), and the section is lit for a moment. Only scrolling, as a click in this list: opening
  // a note must not change it (see above). The flag is set inside the frame, so React's second run of the effect in
  // development still scrolls. The page above the section still changes height after (the header once the page
  // scrolls, what loads above the note, its pictures), so for the first seconds the section is kept in place whenever
  // the page changes size, until the person scrolls or types.
  const opened = useRef(false);
  // `setActive` is a new function on every render: read the latest one, so the effect below runs once, not per render
  // (its clean-up would stop the light and the keeping in place).
  const choose = useRef(setActive);
  choose.current = setActive;
  useEffect(() => {
    if (openAt === undefined || opened.current) return;
    let frame = 0;
    let lit = 0;
    let settle = 0;
    let observer: ResizeObserver | null = null;
    const inputs = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
    const stop = () => {
      observer?.disconnect();
      for (const type of inputs) window.removeEventListener(type, stop);
    };
    frame = requestAnimationFrame(() => {
      opened.current = true;
      const element = scrollToSection(editor, openAt, 'instant');
      const box = element?.querySelector<HTMLElement>('.note-section') ?? element;
      if (!element || !box) return;
      const realign = () => {
        const target = Math.max(0, element.getBoundingClientRect().top + window.scrollY - toolbarBottom().stuck - 12);
        if (Math.abs(target - window.scrollY) > 4) window.scrollTo({ top: target, behavior: 'instant' });
      };
      choose.current(String(openAt));
      box.classList.add('note-section--found');
      lit = window.setTimeout(() => box.classList.remove('note-section--found'), FOUND_MS);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(realign);
      });
      observer = new ResizeObserver(realign);
      observer.observe(document.body);
      for (const type of inputs) window.addEventListener(type, stop, { passive: true });
      settle = window.setTimeout(stop, KEEP_IN_PLACE_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(lit);
      window.clearTimeout(settle);
      stop();
    };
  }, [editor, openAt]);

  if (ids.length === 0) return null;

  const go = (key: string) => {
    if (sectionPos(editor, Number(key)) === null) return;
    scrollToSection(editor, Number(key));
    setActive(key);
  };

  return (
    <div className={beside ? 'note-nav note-nav--beside' : 'note-nav'}>
      <ProjectNav
        className={beside ? '' : 'project-nav--row'}
        items={ids.map((id, i) => ({ key: String(i), name: id ? (find(id)?.name ?? null) : null }))}
        active={active}
        onGo={go}
      />
    </div>
  );
}
