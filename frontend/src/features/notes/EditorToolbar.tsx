import { useEditorState, type Editor } from '@tiptap/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BlueSelect } from '../../components/blue';
import { LinkDialog } from './LinkDialog';
import { TEXT_COLORS } from './palette';
import { useDismiss } from '../../hooks/useDismiss';
import { ProjectMenu } from './ProjectMenu';
import { sectionAtSelection, tagWithProject, usePasteSection } from './projectSection';
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BulletListIcon,
  CodeBlockIcon,
  DividerIcon,
  ImageIcon,
  LinkIcon,
  MoreIcon,
  OrderedListIcon,
  QuoteIcon,
  RedoIcon,
  ProjectIcon,
  TableIcon,
  UndoIcon,
} from './toolbarIcons';

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

type Block = 'p' | 'h1' | 'h2' | 'h3';
/** Each text style and its name in the word lists (notes.toolbar). */
const BLOCKS: { value: Block; key: 'normal' | 'heading1' | 'heading2' | 'heading3' }[] = [
  { value: 'p', key: 'normal' },
  { value: 'h1', key: 'heading1' },
  { value: 'h2', key: 'heading2' },
  { value: 'h3', key: 'heading3' },
];

function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
  className = '',
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`note-tool ${active ? 'note-tool--active' : ''} ${className}`.trim()}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      // Keeps the text selection in the editor while clicking the toolbar.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="note-toolbar__divider" aria-hidden="true" />;

/**
 * The Word-like toolbar, one row: undo/redo, text style, bold/italic/underline, lists, Project, link, image, table.
 * The tools people use less (strikethrough, quote, code, divider, alignment, text color) are under "More", which
 * looks pressed while one of them applies at the cursor. Inside a table, a second row edits rows, columns and cells.
 */
export function EditorToolbar({ editor, onPickImages, status }: { editor: Editor; onPickImages: () => void; status: ReactNode }) {
  const { t } = useTranslation();
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: (e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p') as Block,
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      color: (e.getAttributes('textStyle').color as string | undefined) ?? null,
      align: (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? ('left' as const),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      blockquote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      link: e.isActive('link'),
      href: (e.getAttributes('link').href as string | undefined) ?? '',
      table: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      canMerge: e.can().mergeCells(),
      canSplit: e.can().splitCell(),
      sectionProject: (() => {
        const section = sectionAtSelection(e);
        return section ? ((section.node.attrs.projectId as string | null) ?? '') : null;
      })(),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const chain = () => editor.chain().focus();
  // Tables and divider lines go after the selected text instead of replacing it.
  const afterSelection = () => chain().setTextSelection(editor.state.selection.to);

  return (
    <div className="note-toolbar" role="toolbar" aria-label={t('notes.toolbar.label')}>
      <div className="note-toolbar__row">
        <div className="note-toolbar__tools">
          <ToolButton label={t('notes.toolbar.undo')} shortcut={`${MOD}Z`} disabled={!s.canUndo} onClick={() => chain().undo().run()}>
            <UndoIcon />
          </ToolButton>
          <ToolButton label={t('notes.toolbar.redo')} shortcut={`${MOD}Shift+Z`} disabled={!s.canRedo} onClick={() => chain().redo().run()}>
            <RedoIcon />
          </ToolButton>
          <Divider />
          <BlueSelect
            size="sm"
            ariaLabel={t('notes.toolbar.textStyle')}
            className="note-toolbar__block"
            value={s.block}
            options={BLOCKS.map((b) => ({ value: b.value, label: t(`notes.toolbar.${b.key}`) }))}
            onChange={(value) =>
              value === 'p' ? chain().setParagraph().run() : chain().setHeading({ level: Number(value[1]) as 1 | 2 | 3 }).run()
            }
          />
          <Divider />
          <ToolButton label={t('notes.toolbar.bold')} shortcut={`${MOD}B`} active={s.bold} onClick={() => chain().toggleBold().run()}>
            <span className="note-tool__letter note-tool__letter--bold">
              B
            </span>
          </ToolButton>
          <ToolButton label={t('notes.toolbar.italic')} shortcut={`${MOD}I`} active={s.italic} onClick={() => chain().toggleItalic().run()}>
            <span className="note-tool__letter note-tool__letter--italic">
              I
            </span>
          </ToolButton>
          <ToolButton label={t('notes.toolbar.underline')} shortcut={`${MOD}U`} active={s.underline} onClick={() => chain().toggleUnderline().run()}>
            <span className="note-tool__letter note-tool__letter--underline">
              U
            </span>
          </ToolButton>
          <Divider />
          <ToolButton label={t('notes.toolbar.bulletList')} shortcut={`${MOD}Shift+8`} active={s.bulletList} onClick={() => chain().toggleBulletList().run()}>
            <BulletListIcon />
          </ToolButton>
          <ToolButton label={t('notes.toolbar.orderedList')} shortcut={`${MOD}Shift+7`} active={s.orderedList} onClick={() => chain().toggleOrderedList().run()}>
            <OrderedListIcon />
          </ToolButton>
          <Divider />
          <ProjectButton editor={editor} sectionProject={s.sectionProject} />
          <Divider />
          <ToolButton label={s.link ? t('notes.toolbar.editLink') : t('notes.toolbar.addLink')} shortcut={`${MOD}K`} active={s.link} onClick={() => setLinkOpen(true)}>
            <LinkIcon />
          </ToolButton>
          <ToolButton label={t('notes.toolbar.addImage')} onClick={onPickImages}>
            <ImageIcon />
          </ToolButton>
          <ToolButton
            label={t('notes.toolbar.insertTable')}
            active={s.table}
            disabled={s.table}
            onClick={() => afterSelection().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            <TableIcon />
          </ToolButton>
          <Divider />
          <MoreTools
            state={s}
            onStrike={() => chain().toggleStrike().run()}
            onQuote={() => chain().toggleBlockquote().run()}
            onCode={() => chain().toggleCodeBlock().run()}
            onDivider={() => afterSelection().setHorizontalRule().run()}
            onAlign={(align) => chain().setTextAlign(align).run()}
            onColor={(value) => (value ? chain().setColor(value).run() : chain().unsetColor().run())}
          />
        </div>
        <div className="note-toolbar__status">{status}</div>
      </div>

      {s.table ? (
        <div className="note-toolbar__row note-toolbar__row--table" role="group" aria-label={t('notes.toolbar.table')}>
          <span className="note-toolbar__label">{t('notes.toolbar.table')}</span>
          <TableButton onClick={() => chain().addRowBefore().run()}>{t('notes.toolbar.rowAbove')}</TableButton>
          <TableButton onClick={() => chain().addRowAfter().run()}>{t('notes.toolbar.rowBelow')}</TableButton>
          <TableButton onClick={() => chain().addColumnBefore().run()}>{t('notes.toolbar.columnLeft')}</TableButton>
          <TableButton onClick={() => chain().addColumnAfter().run()}>{t('notes.toolbar.columnRight')}</TableButton>
          <TableButton onClick={() => chain().toggleHeaderRow().run()}>{t('notes.toolbar.headerRow')}</TableButton>
          {s.canMerge ? <TableButton onClick={() => chain().mergeCells().run()}>{t('notes.toolbar.mergeCells')}</TableButton> : null}
          {s.canSplit ? <TableButton onClick={() => chain().splitCell().run()}>{t('notes.toolbar.splitCell')}</TableButton> : null}
          <TableButton danger onClick={() => chain().deleteRow().run()}>
            {t('notes.toolbar.deleteRow')}
          </TableButton>
          <TableButton danger onClick={() => chain().deleteColumn().run()}>
            {t('notes.toolbar.deleteColumn')}
          </TableButton>
          <TableButton danger onClick={() => chain().deleteTable().run()}>
            {t('notes.toolbar.deleteTable')}
          </TableButton>
        </div>
      ) : null}

      {linkOpen ? (
        <LinkDialog
          open
          initial={s.href}
          onClose={() => {
            setLinkOpen(false);
            editor.commands.focus();
          }}
          onRemove={() => {
            chain().extendMarkRange('link').unsetLink().run();
            setLinkOpen(false);
          }}
          onApply={(href) => {
            const { empty } = editor.state.selection;
            if (s.link) chain().extendMarkRange('link').setLink({ href }).run();
            else if (empty) chain().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
            else chain().setLink({ href }).run();
            setLinkOpen(false);
          }}
        />
      ) : null}
      <LinkShortcut editor={editor} onOpen={() => setLinkOpen(true)} />
    </div>
  );
}

/**
 * "Project": tags the current line(s) with one of my projects (they become a project section), or changes the
 * project of the section the cursor is in.
 */
function ProjectButton({ editor, sectionProject }: { editor: Editor; sectionProject: string | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const inSection = sectionProject !== null;
  const { copied, pasting, error, paste } = usePasteSection(editor);
  // A copied section goes after the top-level block the cursor is in (a section cannot sit inside another block).
  const pasteHere = async () => {
    const done = await paste(() => {
      const { $from } = editor.state.selection;
      return $from.depth >= 1 ? $from.after(1) : $from.pos;
    });
    if (done) close();
  };
  return (
    <div className="note-project-tool" ref={ref}>
      <button
        type="button"
        className={`note-tool note-tool--wide ${inSection ? 'note-tool--active' : ''}`.trim()}
        aria-haspopup="menu"
        aria-expanded={open}
        title={inSection ? t('notes.toolbar.projectChange') : t('notes.toolbar.projectTag')}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <ProjectIcon />
        <span>{t('notes.toolbar.project')}</span>
      </button>
      {open ? (
        <ProjectMenu
          className="note-project-tool__menu"
          current={sectionProject || null}
          onPick={(projectId) => {
            tagWithProject(editor, projectId);
            close();
          }}
          footer={
            <>
              <button
                type="button"
                className="project-menu__action"
                disabled={!copied || pasting}
                title={copied ? undefined : t('notes.section.pasteNothing')}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void pasteHere()}
              >
                {pasting ? t('notes.section.pasting') : t('notes.section.pasteHere')}
              </button>
              {error ? (
                <p className="note-section__notice note-section__notice--error" role="alert">
                  {error}
                </p>
              ) : null}
            </>
          }
        />
      ) : null}
    </div>
  );
}

function TableButton({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`note-table-tool ${danger ? 'note-table-tool--danger' : ''}`.trim()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Ctrl/⌘+K opens the link box, as in Word and Google Docs. */
function LinkShortcut({ editor, onOpen }: { editor: Editor; onOpen: () => void }) {
  useEffect(() => {
    const dom = editor.view.dom;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpen();
      }
    };
    dom.addEventListener('keydown', onKey);
    return () => dom.removeEventListener('keydown', onKey);
  }, [editor, onOpen]);
  return null;
}

type Align = 'left' | 'center' | 'right' | 'justify';
/** Each alignment, its name in the word lists (notes.toolbar) and its icon. */
const ALIGNS: { value: Align; key: 'alignLeft' | 'alignCenter' | 'alignRight' | 'justify'; icon: ReactNode }[] = [
  { value: 'left', key: 'alignLeft', icon: <AlignLeftIcon /> },
  { value: 'center', key: 'alignCenter', icon: <AlignCenterIcon /> },
  { value: 'right', key: 'alignRight', icon: <AlignRightIcon /> },
  { value: 'justify', key: 'justify', icon: <AlignJustifyIcon /> },
];

/**
 * "More": the less used tools, each with its name (strikethrough, quote, code block, divider line), the alignments
 * and the text colors (the BLUE palette, plus "Automatic"). A pick applies at once and closes the panel; Escape or a
 * press elsewhere closes it too. The panel is placed under its button, inside the window.
 */
function MoreTools({
  state,
  onStrike,
  onQuote,
  onCode,
  onDivider,
  onAlign,
  onColor,
}: {
  state: { strike: boolean; blockquote: boolean; codeBlock: boolean; align: Align; color: string | null };
  onStrike: () => void;
  onQuote: () => void;
  onCode: () => void;
  onDivider: () => void;
  onAlign: (align: Align) => void;
  onColor: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const applied = state.strike || state.blockquote || state.codeBlock || state.align !== 'left' || state.color !== null;

  // Under the button, right edges lined up, kept inside the window. The toolbar's backdrop blur makes it the box that
  // "fixed" is measured from, so the panel is placed at 0,0 first and moved by where that corner landed.
  useLayoutEffect(() => {
    const menu = panel.current;
    const rect = button.current?.getBoundingClientRect();
    if (!open || !menu || !rect) return;
    const width = menu.offsetWidth;
    const top = rect.bottom + 6;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    menu.style.top = '0px';
    menu.style.left = '0px';
    const origin = menu.getBoundingClientRect();
    menu.style.top = `${top - origin.top}px`;
    menu.style.left = `${left - origin.left}px`;
  }, [open]);
  const pick = (action: () => void) => () => {
    action();
    setOpen(false);
  };
  // Every control keeps the text selection in the editor (the press is not let through).
  const keep = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div className="note-more" ref={ref}>
      <button
        ref={button}
        type="button"
        className={`note-tool note-tool--wide ${applied || open ? 'note-tool--active' : ''}`.trim()}
        aria-haspopup="true"
        aria-expanded={open}
        title={t('notes.toolbar.moreTitle')}
        onMouseDown={keep}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreIcon />
        <span>{t('notes.toolbar.more')}</span>
      </button>
      {open ? (
        <div className="note-more__menu" role="group" aria-label={t('notes.toolbar.moreLabel')} ref={panel}>
          <div className="note-more__items">
            <MoreItem label={t('notes.toolbar.strike')} shortcut={`${MOD}Shift+S`} active={state.strike} onMouseDown={keep} onClick={pick(onStrike)}>
              <span className="note-tool__letter note-tool__letter--strike">S</span>
            </MoreItem>
            <MoreItem label={t('notes.toolbar.quote')} shortcut={`${MOD}Shift+B`} active={state.blockquote} onMouseDown={keep} onClick={pick(onQuote)}>
              <QuoteIcon />
            </MoreItem>
            <MoreItem label={t('notes.toolbar.codeBlock')} active={state.codeBlock} onMouseDown={keep} onClick={pick(onCode)}>
              <CodeBlockIcon />
            </MoreItem>
            <MoreItem label={t('notes.toolbar.divider')} onMouseDown={keep} onClick={pick(onDivider)}>
              <DividerIcon />
            </MoreItem>
          </div>
          <span className="note-more__label">{t('notes.toolbar.alignment')}</span>
          <div className="note-more__row">
            {ALIGNS.map((a) => (
              <ToolButton key={a.value} label={t(`notes.toolbar.${a.key}`)} active={state.align === a.value} onClick={pick(() => onAlign(a.value))}>
                {a.icon}
              </ToolButton>
            ))}
          </div>
          <span className="note-more__label">{t('notes.toolbar.textColor')}</span>
          <button type="button" className="note-color__auto" onMouseDown={keep} onClick={pick(() => onColor(null))}>
            <span className="note-color__swatch note-color__swatch--auto" aria-hidden="true" />
            {t('notes.toolbar.automatic')}
          </button>
          <div className="note-color__swatches">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`note-color__swatch ${state.color === c.value ? 'note-color__swatch--on' : ''}`.trim()}
                style={{ background: `var(${c.token})` }}
                aria-label={t(`notes.toolbar.colors.${c.key}`)}
                aria-pressed={state.color === c.value}
                title={t(`notes.toolbar.colors.${c.key}`)}
                onMouseDown={keep}
                onClick={pick(() => onColor(c.value))}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MoreItem({
  label,
  shortcut,
  active,
  onMouseDown,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  onMouseDown: (event: React.MouseEvent) => void;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`note-more__item ${active ? 'note-more__item--active' : ''}`.trim()}
      aria-pressed={active === undefined ? undefined : active}
      title={shortcut ? `${label} (${shortcut})` : label}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <span className="note-more__icon" aria-hidden="true">
        {children}
      </span>
      {label}
    </button>
  );
}
