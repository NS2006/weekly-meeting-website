import type { Node as PmNode } from '@tiptap/pm/model';
import { Fragment, NodeRange, Slice } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { findWrapping } from '@tiptap/pm/transform';
import {
  mergeAttributes,
  Node,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type Editor,
  type NodeViewProps,
} from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiFailure, api } from '../../services/api';
import { errorLabel } from '../../utils/errorLabels';
import { useNoteProjects } from './noteProjects';
import { useDismiss } from '../../hooks/useDismiss';
import { ProjectMenu } from './ProjectMenu';
import { frozenGuard } from './frozenSections';
import { attachmentIdsIn, keepSection, useCopiedSection, withAttachments } from './sectionClipboard';
import { deleteSection, emptySectionToDelete, isEmptySection, removeProjectBlock } from './sectionCommands';

/**
 * The note document: any block, or a project section, at the top level. Sections are not in the "block" group, so
 * nothing else (a list, a table, another section) can hold one. Mirrors the backend's content.ts.
 */
export const NoteDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: '(block | projectSection)+',
});

export interface ProjectSectionOptions {
  /** Whether a project is archived: its parts are frozen (frozenSections.ts). */
  isFrozen: (projectId: string) => boolean;
}

/** A part of the note tagged with one of my projects: what that project's page shows. */
export const ProjectSection = Node.create<ProjectSectionOptions>({
  name: 'projectSection',
  content: 'block+',
  defining: true,
  isolating: true,
  addOptions() {
    return { isFrozen: () => false };
  },
  addProseMirrorPlugins() {
    return [frozenGuard((projectId) => this.options.isFrozen(projectId))];
  },
  addAttributes() {
    return {
      projectId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-project-id'),
        renderHTML: (attributes) => (attributes.projectId ? { 'data-project-id': attributes.projectId as string } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-project-section]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-project-section': '' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ProjectSectionView);
  },
  addKeyboardShortcuts() {
    return {
      // Backspace at the very start of an empty project block deletes the block (as it leaves an empty list).
      Backspace: ({ editor }) => {
        const pos = emptySectionToDelete(editor.state);
        if (pos === null) return false;
        return editor
          .chain()
          .command(({ tr }) => {
            const section = tr.doc.nodeAt(pos);
            if (section) deleteSection(tr, pos, section);
            return true;
          })
          .run();
      },
      // Enter on an empty last line of a section moves that line out, below the section (as leaving a quote or a
      // list does; the section is "isolating", so the editor's own lifting does not cross its border).
      Enter: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.depth !== 2 || $from.node(1).type.name !== this.name) return false;
        const section = $from.node(1);
        const line = $from.parent;
        const isLast = $from.index(1) === section.childCount - 1;
        if (line.type.name !== 'paragraph' || line.content.size > 0 || !isLast || section.childCount < 2) return false;
        const start = $from.before(2);
        const end = $from.after(2);
        const below = $from.after(1) - (end - start);
        return editor
          .chain()
          .command(({ tr }) => {
            tr.delete(start, end);
            tr.insert(below, state.schema.nodes.paragraph!.create());
            tr.setSelection(TextSelection.create(tr.doc, below + 1));
            return true;
          })
          .run();
      },
    };
  },
});

/** The project section the selection starts in, with its position; null outside sections. */
export function sectionAtSelection(editor: Editor): { pos: number; node: PmNode } | null {
  const { $from } = editor.state.selection;
  if ($from.depth >= 1 && $from.node(1).type.name === 'projectSection') return { pos: $from.before(1), node: $from.node(1) };
  return null;
}

/**
 * Tags the selection with a project: inside a section, it changes that section's project; otherwise the top-level
 * blocks the selection touches become a section (an empty line becomes an empty section to write in). When they
 * cannot be wrapped (the selection spans another section), a new empty section goes after them.
 */
export function tagWithProject(editor: Editor, projectId: string): void {
  const inside = sectionAtSelection(editor);
  if (inside) {
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeMarkup(inside.pos, undefined, { ...inside.node.attrs, projectId });
        return true;
      })
      .run();
    return;
  }
  const { state } = editor;
  const { $from, $to } = state.selection;
  const type = state.schema.nodes.projectSection;
  if (!type) return;
  const start = $from.depth >= 1 ? $from.before(1) : $from.pos;
  const end = $to.depth >= 1 ? $to.after(1) : $to.pos;
  const range = new NodeRange(state.doc.resolve(start), state.doc.resolve(end), 0);
  const wrapping = findWrapping(range, type, { projectId });
  if (wrapping) {
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.wrap(range, wrapping);
        return true;
      })
      .run();
    return;
  }
  editor
    .chain()
    .focus()
    .insertContentAt(end, { type: 'projectSection', attrs: { projectId }, content: [{ type: 'paragraph' }] })
    .setTextSelection(end + 2)
    .run();
}

/** Turns a section back into plain text: its blocks stay where they are, without the box and the tag. */
function unwrapSection(editor: Editor, pos: number, node: PmNode): void {
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.replaceWith(pos, pos + node.nodeSize, node.content);
      return true;
    })
    .run();
}

/**
 * Also puts the section on the system clipboard (formatted, and as plain text), so Ctrl+V pastes it in a note, or
 * its text in Word or an email. Best effort: a browser that refuses (a page that is not https) keeps only the menu's
 * own copy.
 */
async function toSystemClipboard(editor: Editor, node: PmNode): Promise<void> {
  try {
    const { dom, text } = editor.view.serializeForClipboard(new Slice(Fragment.from(node), 0, 0));
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([dom.innerHTML], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]);
  } catch {
    // Not allowed here: "Paste below" still works.
  }
}

/**
 * Pastes the copied section (sectionClipboard) where `where()` says, asked once its pictures are ready: from another
 * note they are copied into this note first (so they stay when that note is deleted, and teammates reading this one
 * can see them). Used by a section's chip menu (below that section) and the toolbar's Project menu (at the cursor).
 */
export function usePasteSection(editor: Editor) {
  const { noteId } = useNoteProjects();
  const copied = useCopiedSection();
  const [pasting, setPasting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paste = async (where: () => number | null): Promise<boolean> => {
    if (!copied || !noteId || pasting) return false;
    setError(null);
    setPasting(true);
    try {
      let section = copied.node;
      const pictures = copied.noteId === noteId ? [] : attachmentIdsIn(section);
      if (pictures.length > 0) {
        const { attachments } = await api.copyAttachments(noteId, pictures);
        section = withAttachments(section, new Map(attachments.map((a) => [a.from, a.id])));
      }
      // Asked now: the note may have changed while the pictures were copied.
      const pos = editor.isDestroyed ? null : where();
      if (pos === null) return false;
      editor.chain().focus().insertContentAt(pos, section).run();
      return true;
    } catch (err) {
      setError(errorLabel(err instanceof ApiFailure ? err.code : 'unknown_error'));
      return false;
    } finally {
      setPasting(false);
    }
  };

  return { copied, pasting, error, paste };
}

/**
 * The section's box: a project chip (pick another project; copy, cut or paste a section; remove the section) and a ×
 * above the editable blocks. The × deletes an empty block, or takes the box and tag off a block with something in it
 * (the text stays). Paste puts the copied section below this one; from another note, its pictures are copied into this
 * note first (so they stay when that note is deleted, and teammates reading this one can see them).
 */
function ProjectSectionView({ node, editor, getPos }: NodeViewProps) {
  const { t } = useTranslation();
  const { find, noteId } = useNoteProjects();
  const { copied, pasting, error, paste } = usePasteSection(editor);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const head = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(head, open, close);

  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (error) setNotice({ text: error, error: true });
  }, [error]);

  const empty = isEmptySection(node);
  const id = typeof node.attrs.projectId === 'string' ? node.attrs.projectId : null;
  const project = id ? find(id) : undefined;
  const label = project ? project.name : id ? t('notes.section.removed') : t('notes.section.choose');
  // An archived project's part is frozen (owner, 2026-11-25): its tag stays, and it cannot be changed or removed.
  const frozen = project?.status === 'archived';
  const at = () => {
    const pos = getPos();
    return typeof pos === 'number' ? pos : null;
  };

  const copy = (cut: boolean) => {
    const pos = at();
    close();
    if (pos === null || !noteId) return;
    const section = editor.state.doc.nodeAt(pos);
    if (!section) return;
    keepSection({ node: section.toJSON(), noteId });
    void toSystemClipboard(editor, section);
    if (cut) {
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          deleteSection(tr, pos, section);
          return true;
        })
        .run();
    } else {
      setNotice({ text: t('notes.section.copied'), error: false });
    }
  };

  const pasteBelow = () => {
    close();
    setNotice(null);
    // Below this section, wherever it is by then.
    void paste(() => {
      const pos = at();
      const here = pos === null ? null : editor.state.doc.nodeAt(pos);
      return pos === null || !here ? null : pos + here.nodeSize;
    });
  };

  return (
    <NodeViewWrapper
      className={`note-section ${project ? '' : 'note-section--untagged'} ${frozen ? 'note-section--frozen' : ''}`.trim()}
      data-project-section=""
    >
      <div className="note-section__head" contentEditable={false} ref={head}>
        {frozen ? (
          <span className="note-section__chip note-section__chip--frozen" title={t('notes.section.frozenTitle', { project: label })}>
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            {label}
            <span className="note-section__archived">{t('notes.section.archivedReadOnly')}</span>
          </span>
        ) : (
        <button
          type="button"
          className="note-section__chip"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={!editor.isEditable}
          title={project ? t('notes.section.chipTitle') : t('notes.section.chipTitleUntagged')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="note-section__dot" aria-hidden="true" />
          {label}
          <span aria-hidden="true">▾</span>
        </button>
        )}
        {open && !frozen ? (
          <ProjectMenu
            className="note-section__menu"
            current={id}
            onPick={(projectId) => {
              const pos = at();
              if (pos !== null) {
                editor
                  .chain()
                  .focus()
                  .command(({ tr }) => {
                    tr.setNodeMarkup(pos, undefined, { ...node.attrs, projectId });
                    return true;
                  })
                  .run();
              }
              close();
            }}
            footer={
              <>
                <button
                  type="button"
                  className="project-menu__action"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => copy(false)}
                >
                  {t('notes.section.copy')}
                </button>
                <button
                  type="button"
                  className="project-menu__action"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => copy(true)}
                >
                  {t('notes.section.cut')}
                </button>
                <button
                  type="button"
                  className="project-menu__action"
                  disabled={!copied || pasting}
                  title={copied ? undefined : t('notes.section.pasteNothing')}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={pasteBelow}
                >
                  {t('notes.section.paste')}
                </button>
                <button
                  type="button"
                  className="project-menu__remove"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const pos = at();
                    if (pos !== null) unwrapSection(editor, pos, node);
                    close();
                  }}
                >
                  {t('notes.section.removeSection')}
                </button>
              </>
            }
          />
        ) : null}
        {frozen ? null : (
        <button
          type="button"
          className="note-section__remove"
          aria-label={empty ? t('notes.section.deleteEmpty') : t('notes.section.removeTag')}
          title={empty ? t('notes.section.deleteEmptyTitle') : t('notes.section.removeTagTitle')}
          disabled={!editor.isEditable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const pos = at();
            if (pos === null) return;
            editor
              .chain()
              .focus()
              .command(({ tr }) => removeProjectBlock(tr, pos) !== null)
              .run();
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        )}
      </div>
      {pasting || notice ? (
        <p
          className={`note-section__notice ${notice?.error ? 'note-section__notice--error' : ''}`.trim()}
          contentEditable={false}
          role={notice?.error ? 'alert' : 'status'}
        >
          {pasting ? t('notes.section.pasting') : notice?.text}
        </p>
      ) : null}
      <NodeViewContent className="note-section__body" />
    </NodeViewWrapper>
  );
}
