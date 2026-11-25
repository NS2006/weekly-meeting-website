import type { EditorDoc, NoteDetail } from '@weekly-meeting/shared';
import type { Node as PmNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { messages } from '../../i18n/messages';
import { BlueAlert, BlueButton } from '../../components/blue';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { api, ApiFailure } from '../../services/api';
import { formatDate, formatDateTime } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { Autosaver, type AutosaveState } from './autosave';
import { noteExtensions } from './editorExtensions';
import { EditorProjectNav } from './EditorProjectNav';
import { EditorToolbar } from './EditorToolbar';
import { prepareImage } from './compressImage';
import { ImageError, imageFiles, imageProblem, type ImageProblem } from './images';
import { moveBelowSelectedNode } from './insertImage';
import { NoteProjectsProvider } from './noteProjects';
import { NoteMeetings } from './NoteMeetings';
import { useDeleteNote, useRefreshNoteLists } from './useNotes';
import './notes.css';

/** The sentence (notes.images) for an image the browser refuses before uploading. */
const IMAGE_PROBLEMS: Record<ImageProblem, 'invalid' | 'tooLarge'> = {
  invalid_image: 'invalid',
  too_large: 'tooLarge',
};

const codeOf = (error: unknown) => (error instanceof ApiFailure ? error.code : 'unknown_error');

/**
 * A note as its own page, like a Word document: title, toolbar and text on a sheet of paper. Everything is saved by
 * itself shortly after typing stops (and when the page is hidden or left); a save never overwrites a newer version
 * saved elsewhere. Images are pasted, dropped or picked, and uploaded to the note. Parts of it are tagged with
 * projects (project sections), and each project's page shows its parts.
 */
export function NoteEditor({
  note,
  back,
  startWriting = false,
  openSection,
  onReload,
}: {
  note: NoteDetail;
  /** Where the back link (and a delete) returns: the Notes page, or the project page the note was opened from. */
  back: { to: string; label: string };
  /** Put the caret at the end of the text straight away (a new update from a project page: inside its section). */
  startWriting?: boolean;
  /** Open at this project section (its order among the note's sections): an update's "Edit" on a project page. */
  openSection?: number | undefined;
  onReload: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [title, setTitle] = useState(note.title);
  const titleRef = useRef(note.title);
  const docRef = useRef<PmNode | null>(null);
  const saverRef = useRef<Autosaver | null>(null);
  const [save, setSave] = useState<AutosaveState>({ status: 'saved', savedAt: note.updatedAt, errorCode: null });
  const refreshLists = useRefreshNoteLists();

  const [uploading, setUploading] = useState(0);
  const [shrinking, setShrinking] = useState<number | null>(null); // percent, while a big GIF is made smaller
  const [imageError, setImageError] = useState<string | null>(null);
  const [keeping, setKeeping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteNote();
  const fileInput = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLTextAreaElement>(null);

  // One autosaver per opened note. Leaving the page sends what is pending first.
  useEffect(() => {
    const saver = new Autosaver({
      version: note.version,
      savedAt: note.updatedAt,
      read: () => ({ title: titleRef.current, content: (docRef.current?.toJSON() ?? note.content) as EditorDoc }),
      save: async (body) => (await api.saveNote(note.id, body)).note,
      onState: setSave,
    });
    saverRef.current = saver;
    return () => {
      // Note lists and project pages show the new text when they are opened next.
      void saver.flush().then(() => refreshLists());
      saver.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per note version (a reload remounts this view)
  }, [note.id, note.version]);

  // Closing or reloading the tab with unsaved changes asks first; hiding the tab saves at once (PRD 8.2).
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saverRef.current?.hasUnsavedChanges) event.preventDefault();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') void saverRef.current?.flush();
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  const uploadImages = useRef<(files: File[]) => Promise<void>>(async () => undefined);
  // The note's archived projects: their parts are frozen (read when a change is made, so a reload brings news).
  const archived = useRef(new Set<string>());
  archived.current = new Set(note.projects.filter((p) => p.status === 'archived').map((p) => p.id));
  const extensions = useMemo(() => noteExtensions({ isFrozen: (projectId) => archived.current.has(projectId) }), []);
  const editor = useEditor(
    {
      extensions,
      content: note.content,
      autofocus: startWriting ? 'end' : false,
      injectCSS: false, // the base styles are in notes.css (no inline <style> tags)
      shouldRerenderOnTransaction: false,
      editorProps: {
        // Read on every view update, so the label follows the interface language (see the effect below).
        attributes: () => ({ class: 'note-prose', 'aria-label': messages().notes.editor.textLabel, 'aria-multiline': 'true' }),
        handlePaste: (_view, event) => {
          const files = imageFiles(event.clipboardData);
          if (files.length === 0) return false;
          void uploadImages.current(files);
          return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          const files = moved ? [] : imageFiles(event.dataTransfer);
          if (files.length === 0) return false;
          event.preventDefault();
          // The images go where they were dropped.
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (at) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
          void uploadImages.current(files);
          return true;
        },
      },
      onCreate: ({ editor: e }) => {
        docRef.current = e.state.doc;
      },
      onUpdate: ({ editor: e }) => {
        docRef.current = e.state.doc;
        saverRef.current?.change('content');
      },
    },
    [note.id, note.version],
  );

  // A language switch relabels the text area at once (its attributes are read again; nothing is saved).
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setOptions({});
  }, [editor, i18n.language]);

  uploadImages.current = async (files: File[]) => {
    setImageError(null);
    // One at a time: a big photo is shrunk in the browser first, and only the small result is uploaded.
    for (const file of files) {
      const problem = imageProblem(file);
      if (problem) {
        setImageError(t(`notes.images.${IMAGE_PROBLEMS[problem]}`));
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const image = await prepareImage(file, (done) => setShrinking(Math.floor(done * 100)));
        setShrinking(null);
        const { attachment } = await api.uploadImage(note.id, image);
        if (editor && !editor.isDestroyed) {
          editor
            .chain()
            .focus()
            .setImage({ src: attachment.url, alt: '' })
            .command(({ tr }) => {
              moveBelowSelectedNode(tr); // the next image goes below this one instead of replacing it
              return true;
            })
            .run();
        }
      } catch (err) {
        const code = err instanceof ImageError ? err.code : codeOf(err);
        setImageError(
          code === 'too_large'
            ? t('notes.images.couldNotShrink')
            : code === 'invalid_image'
              ? t('notes.images.invalid')
              : code === 'animation_unsupported'
                ? t('notes.images.animationUnsupported')
                : errorLabel(code),
        );
      } finally {
        setShrinking(null);
        setUploading((n) => n - 1);
      }
    }
  };

  const changeTitle = (value: string) => {
    setTitle(value);
    titleRef.current = value;
    saverRef.current?.change('title');
  };

  // The title box grows with its text (a long title wraps, as in a document).
  useLayoutEffect(() => {
    const box = titleInput.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }, [title]);

  const keepMine = useCallback(async () => {
    setKeeping(true);
    try {
      const latest = await api.getNote(note.id);
      await saverRef.current?.overwriteFrom(latest.note.version);
    } catch (err) {
      setSave((state) => ({ ...state, status: 'stopped', errorCode: codeOf(err) }));
    } finally {
      setKeeping(false);
    }
  }, [note.id]);

  const status = <SaveStatus state={save} uploading={uploading} shrinking={shrinking} />;

  return (
    <NoteProjectsProvider noteId={note.id} tagged={note.projects}>
    <div className="note-page">
      <div className="note-page__top">
        <Link to={back.to} className="back-link">
          <span className="back-link__arrow" aria-hidden="true">
            ←
          </span>
          {back.label}
        </Link>
        <BlueButton variant="ghost" size="sm" className="text-danger" onClick={() => setDeleting(true)}>
          {t('notes.editor.deleteNote')}
        </BlueButton>
      </div>

      {save.status === 'conflict' ? (
        <BlueAlert variant="warning" title={t('notes.editor.conflictTitle')}>
          <div className="note-alert__body">
            <span>{t('notes.editor.conflictBody')}</span>
            <span className="row" style={{ flexWrap: 'wrap' }}>
              <BlueButton size="sm" variant="secondary" onClick={onReload} disabled={keeping}>
                {t('notes.editor.loadOther')}
              </BlueButton>
              <BlueButton size="sm" variant="primary" loading={keeping} onClick={() => void keepMine()}>
                {t('notes.editor.keepMine')}
              </BlueButton>
            </span>
          </div>
        </BlueAlert>
      ) : null}
      {save.status === 'stopped' ? (
        <BlueAlert variant="error" title={t('notes.editor.notSavedTitle')}>
          {errorLabel(save.errorCode ?? 'unknown_error')}
        </BlueAlert>
      ) : null}
      {imageError ? (
        <BlueAlert variant="error" onDismiss={() => setImageError(null)}>
          {imageError}
        </BlueAlert>
      ) : null}

      {editor ? (
        <EditorToolbar editor={editor} status={status} onPickImages={() => fileInput.current?.click()} />
      ) : null}

      {editor ? <EditorProjectNav editor={editor} openAt={openSection} /> : null}

      <article className="note-paper">
        <textarea
          ref={titleInput}
          className="note-title"
          rows={1}
          maxLength={200}
          placeholder={t('notes.untitled')}
          aria-label={t('notes.editor.titleLabel')}
          value={title}
          onChange={(event) => changeTitle(event.target.value.replace(/\n/g, ' '))}
          onKeyDown={(event) => {
            // Enter goes to the text, as in a document's title line.
            if (event.key === 'Enter' && editor) {
              event.preventDefault();
              // view.focus() moves the focus now (focus() alone waits a frame, so fast typing would stay here).
              editor.view.focus();
              editor.commands.focus('start');
            }
          }}
        />
        <p className="note-meta">
          <span>{t('notes.editor.created', { date: formatDate(note.createdAt) })}</span>
        </p>
        <NoteMeetings noteId={note.id} meetings={note.meetings} createdAt={note.createdAt} />
        <p className="note-hint">
          <Trans i18nKey="notes.editor.hint" components={{ strong: <strong /> }} />
        </p>
        <EditorContent editor={editor} className="note-body" />
      </article>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) void uploadImages.current(files);
        }}
      />

      <ConfirmDialog
        open={deleting}
        danger
        title={t('notes.editor.deleteTitle')}
        confirmLabel={t('notes.editor.deleteNote')}
        busy={remove.isPending}
        error={remove.error ? errorLabel(codeOf(remove.error)) : null}
        onCancel={() => setDeleting(false)}
        onConfirm={() =>
          remove.mutate(note.id, {
            onSuccess: () => {
              saverRef.current?.discard(); // nothing more to save
              void navigate(back.to, { replace: true });
            },
          })
        }
      >
        {t('notes.editor.deleteBody')}
      </ConfirmDialog>
    </div>
    </NoteProjectsProvider>
  );
}

/** "Saving…", "Saved", "Unsaved changes", "Offline: retrying" next to the toolbar; read out politely. */
function SaveStatus({ state, uploading, shrinking }: { state: AutosaveState; uploading: number; shrinking: number | null }) {
  const { t } = useTranslation();
  let text: string;
  let tone = 'muted';
  switch (state.status) {
    case 'saving':
      text = t('notes.status.saving');
      break;
    case 'unsaved':
      text = t('notes.status.unsaved');
      break;
    case 'retrying':
      text = state.errorCode === 'network_error' ? t('notes.status.offline') : t('notes.status.retrying');
      tone = 'warning';
      break;
    case 'conflict':
    case 'stopped':
      text = t('notes.status.notSaved');
      tone = 'error';
      break;
    default:
      text = t('notes.status.saved');
  }
  return (
    <span className={`note-status note-status--${tone}`} role="status" aria-live="polite">
      {shrinking !== null ? (
        <span className="note-status__upload">
          {t('notes.status.shrinking')}
          <span aria-hidden="true"> {shrinking}%</span>
        </span>
      ) : uploading > 0 ? (
        <span className="note-status__upload">{t('notes.status.adding', { count: uploading })}</span>
      ) : null}
      <span title={state.savedAt ? t('notes.status.lastSaved', { when: formatDateTime(state.savedAt) }) : undefined}>
        {state.status === 'saved' ? <span className="note-status__dot" aria-hidden="true" /> : null}
        {text}
      </span>
    </span>
  );
}
