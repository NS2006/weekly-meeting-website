import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { Placeholder } from '@tiptap/extensions';
import { StarterKit } from '@tiptap/starter-kit';
import { messages } from '../../i18n/messages';
import { isSafeHref } from './link';
import { NoteDocument, ProjectSection } from './projectSection';

/**
 * The editor's schema. It must match the backend's (backend/src/modules/notes/content.ts): the server refuses node
 * and mark types it does not know, and drops attribute values it does not accept. The placeholders are read in the
 * interface language when they are drawn (an empty line shown before a language switch changes once it is redrawn).
 */
export function noteExtensions() {
  return [
    NoteDocument,
    ProjectSection,
    StarterKit.configure({
      document: false, // NoteDocument: blocks or project sections at the top level
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        // http, https and mailto only, also for pasted and typed links (the server drops anything else).
        isAllowedUri: (url) => isSafeHref(url),
        shouldAutoLink: (url) => isSafeHref(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`),
      },
    }),
    TableKit.configure({ table: { resizable: true, cellMinWidth: 60 } }),
    Image.extend({
      // Only our own attachments: pasted images from other sites (or data: URLs) are left out when pasting HTML.
      // Pasted or dropped image files are uploaded instead (NoteEditor).
      parseHTML() {
        return [{ tag: 'img[src^="/api/attachments/"]' }];
      },
    }).configure({
      resize: { enabled: true, directions: ['bottom-right', 'bottom-left'], minWidth: 48, minHeight: 48, alwaysPreserveAspectRatio: true },
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    Placeholder.configure({
      includeChildren: true,
      placeholder: ({ editor, node, pos }) => {
        if (node.type.name !== 'paragraph') return '';
        const inSection = editor.state.doc.resolve(pos).parent.type.name === 'projectSection';
        const words = messages().notes.editor;
        return inSection ? words.sectionPlaceholder : words.placeholder;
      },
    }),
  ];
}
