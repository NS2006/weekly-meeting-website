import type { Editor } from '@tiptap/react';
import { useEffect, useState } from 'react';
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

/**
 * "Projects in this note" while writing (owner, 2026-11-23): the note's project sections, kept up to date as sections
 * are added, removed or tagged with another project. Like Word's navigation pane it sits left of the page and stays
 * in view (owner, 2026-11-24: from 1024 px wide, where the toolbar still fits on one line beside it; the page moves
 * right to make room where the screen has none beside it); on a phone or a narrow window it is a row of chips above
 * the page. A click only scrolls to the section: moving the caret there would
 * be a change to the editor, and the editor's first change adds an empty line after a final section (so you can write
 * below it), which would save the note just for looking around.
 */
export function EditorProjectNav({ editor }: { editor: Editor }) {
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

  if (ids.length === 0) return null;

  const go = (key: string) => {
    const pos = sectionPos(editor, Number(key));
    if (pos === null) return;
    const element = editor.view.nodeDOM(pos) as HTMLElement | null;
    if (element) {
      const top = element.getBoundingClientRect().top + window.scrollY - toolbarBottom().stuck - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior() });
    }
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
