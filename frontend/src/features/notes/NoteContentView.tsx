import type { EditorDoc, EditorMark, EditorNode } from '@weekly-meeting/shared';
import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageViewer, type ViewedImage } from '../../components/ImageViewer';
import { isSafeHref } from './link';

/** Opens a picture of the note on the whole screen (null outside a NoteContentView). */
const OpenImage = createContext<((image: ViewedImage) => void) | null>(null);

/**
 * Shows note content read-only (a project's updates, later a meeting's notes) without loading the editor. It builds
 * React elements from the editor JSON, never HTML strings, and checks again what the server already checked: links
 * are http/https/mailto only, images are our own attachments, colors are #rrggbb. Anything it does not know is left
 * out. Styled by the same .note-prose rules as the editor. A picture opens on the whole screen when clicked, to zoom
 * in (owner, 2026-11-23).
 */
export function NoteContentView({
  doc,
  className = '',
  sectionLabel,
  sectionId,
}: {
  doc: EditorDoc;
  className?: string;
  /** A label above each project section (sections are top-level only), given its project id or null when untagged. */
  sectionLabel?: (projectId: string | null) => ReactNode;
  /** An id for each labelled project section, given its place among the top-level blocks (to jump to it). */
  sectionId?: (index: number) => string;
}) {
  const [viewing, setViewing] = useState<ViewedImage | null>(null);
  const blocks = (doc.content ?? []).map((node, i) =>
    node.type === 'projectSection' && sectionLabel ? (
      <div key={i} id={sectionId?.(i)} tabIndex={sectionId ? -1 : undefined} className="note-section note-section--static">
        <div className="note-section__label">{sectionLabel(typeof node.attrs?.projectId === 'string' ? node.attrs.projectId : null)}</div>
        {children(node)}
      </div>
    ) : (
      render(node, i)
    ),
  );
  return (
    <OpenImage.Provider value={setViewing}>
      <div className={`note-prose note-prose--static ${className}`.trim()}>{blocks}</div>
      <ImageViewer image={viewing} onClose={() => setViewing(null)} />
    </OpenImage.Provider>
  );
}

const IMAGE_SRC = /^\/api\/attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);
/** Numbered list styles (1. a. A. i. I.), as the editor keeps them, for example from a list pasted from Word. */
const LIST_TYPES = new Set(['1', 'a', 'A', 'i', 'I']);
type ListType = '1' | 'a' | 'A' | 'i' | 'I';
const listType = (value: unknown): ListType | undefined =>
  typeof value === 'string' && LIST_TYPES.has(value) ? (value as ListType) : undefined;

const children = (node: EditorNode): ReactNode[] => (node.content ?? []).map((child, i) => render(child, i));

const align = (node: EditorNode): CSSProperties | undefined => {
  const value = node.attrs?.textAlign;
  return typeof value === 'string' && ALIGNMENTS.has(value) && value !== 'left' ? { textAlign: value as CSSProperties['textAlign'] } : undefined;
};

const num = (value: unknown, max: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= max ? Math.round(value) : undefined;

function withMarks(text: string, marks: EditorMark[] = [], key: number): ReactNode {
  let out: ReactNode = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        out = <strong>{out}</strong>;
        break;
      case 'italic':
        out = <em>{out}</em>;
        break;
      case 'underline':
        out = <u>{out}</u>;
        break;
      case 'strike':
        out = <s>{out}</s>;
        break;
      case 'code':
        out = <code>{out}</code>;
        break;
      case 'textStyle': {
        const color = mark.attrs?.color;
        if (typeof color === 'string' && COLOR.test(color)) out = <span style={{ color }}>{out}</span>;
        break;
      }
      case 'link': {
        const href = mark.attrs?.href;
        if (typeof href === 'string' && isSafeHref(href)) {
          out = (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {out}
            </a>
          );
        }
        break;
      }
      default:
        break;
    }
  }
  return <span key={key}>{out}</span>;
}

function render(node: EditorNode, key: number): ReactNode {
  switch (node.type) {
    case 'text':
      return typeof node.text === 'string' ? withMarks(node.text, node.marks, key) : null;
    case 'hardBreak':
      return <br key={key} />;
    case 'paragraph':
      return (
        <p key={key} style={align(node)}>
          {children(node)}
        </p>
      );
    case 'heading': {
      const level = node.attrs?.level === 2 ? 'h2' : node.attrs?.level === 3 ? 'h3' : 'h1';
      const Tag = level;
      return (
        <Tag key={key} style={align(node)}>
          {children(node)}
        </Tag>
      );
    }
    case 'bulletList':
      return <ul key={key}>{children(node)}</ul>;
    case 'orderedList':
      return (
        <ol key={key} start={node.attrs?.start === 0 ? 0 : num(node.attrs?.start, 100_000)} type={listType(node.attrs?.type)}>
          {children(node)}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{children(node)}</li>;
    case 'blockquote':
      return <blockquote key={key}>{children(node)}</blockquote>;
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{(node.content ?? []).map((t) => t.text ?? '').join('')}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr key={key} />;
    case 'image': {
      const src = node.attrs?.src;
      if (typeof src !== 'string' || !IMAGE_SRC.test(src)) return null;
      return (
        <StaticImage key={key} src={src} alt={typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''} width={num(node.attrs?.width, 10_000)} />
      );
    }
    case 'table':
      return (
        <div key={key} className="tableWrapper">
          <table>
            <tbody>{children(node)}</tbody>
          </table>
        </div>
      );
    case 'tableRow':
      return <tr key={key}>{children(node)}</tr>;
    case 'tableCell':
    case 'tableHeader': {
      const Cell = node.type === 'tableHeader' ? 'th' : 'td';
      return (
        <Cell key={key} colSpan={num(node.attrs?.colspan, 100)} rowSpan={num(node.attrs?.rowspan, 100)}>
          {children(node)}
        </Cell>
      );
    }
    case 'projectSection':
      return (
        <div key={key} className="note-section note-section--static">
          {children(node)}
        </div>
      );
    default:
      return null;
  }
}

/**
 * An image of the note; when it cannot be shown (for example one pasted from a note that is not shared with this
 * reader, so the server refuses it), a short note says so instead of a broken image.
 */
function StaticImage({ src, alt, width }: { src: string; alt: string; width: number | undefined }) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  const open = useContext(OpenImage);
  if (broken) {
    return <span className="note-image-missing">{alt ? t('notes.content.imageMissingAlt', { alt }) : t('notes.content.imageMissing')}</span>;
  }
  const picture = <img src={src} alt={alt} style={width ? { width } : undefined} loading="lazy" onError={() => setBroken(true)} />;
  if (!open) return picture;
  return (
    <button
      type="button"
      className="note-image-open"
      onClick={() => open({ src, alt })}
      aria-label={alt ? t('notes.content.openImageAlt', { alt }) : t('notes.content.openImage')}
    >
      {picture}
    </button>
  );
}
