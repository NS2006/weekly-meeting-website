// The part of pdfkit 0.21 that notesPdf.ts uses. pdfkit ships no types, and @types/pdfkit follows an older version and
// brings Node's types into this browser app, so the calls used here are declared by hand.

declare module 'pdfkit' {
  export interface TextOptions {
    width?: number;
    height?: number;
    align?: 'left' | 'center' | 'right' | 'justify';
    continued?: boolean;
    lineBreak?: boolean;
    lineGap?: number;
    ellipsis?: boolean | string;
    underline?: boolean;
    strike?: boolean;
    link?: string | null;
  }

  export interface ImageOptions {
    width?: number;
    height?: number;
  }

  export interface OutlineOptions {
    expanded?: boolean;
    /** Distance from the page's top to show, in points. */
    top?: number;
    left?: number;
  }

  export interface PDFOutline {
    addItem(title: string, options?: OutlineOptions): PDFOutline;
  }

  export interface PDFPage {
    width: number;
    height: number;
    margins: { top: number; bottom: number; left: number; right: number };
    maxY(): number;
  }

  export interface DocumentOptions {
    size?: string | [number, number];
    margin?: number;
    compress?: boolean;
    displayTitle?: boolean;
    lang?: string;
    info?: { Title?: string; Author?: string; Subject?: string; Creator?: string };
  }

  export class PDFDocument {
    constructor(options?: DocumentOptions);
    x: number;
    y: number;
    page: PDFPage;
    outline: PDFOutline;
    font(name: string): this;
    fontSize(size: number): this;
    fillColor(color: string): this;
    strokeColor(color: string): this;
    lineWidth(width: number): this;
    text(text: string, options?: TextOptions): this;
    text(text: string, x?: number, y?: number, options?: TextOptions): this;
    heightOfString(text: string, options?: TextOptions): number;
    widthOfString(text: string, options?: TextOptions): number;
    image(src: Uint8Array, x?: number, y?: number, options?: ImageOptions): this;
    rect(x: number, y: number, width: number, height: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    fill(color?: string): this;
    stroke(color?: string): this;
    addPage(): this;
    end(): void;
  }

  export function registerStdFonts(...fonts: unknown[]): void;
  export default PDFDocument;
}

declare module 'pdfkit/output' {
  import type { PDFDocument } from 'pdfkit';
  /** All of the document's bytes once it has ended; call it before `end()`. */
  export function toBytes(doc: PDFDocument): Promise<Uint8Array>;
}

declare module 'pdfkit/standard-fonts/*' {
  const font: unknown;
  export default font;
}
