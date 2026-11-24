/**
 * Placeholder images for the development seed: small charts, boards and screen mock-ups drawn into an RGB buffer and
 * encoded as PNG with Node's own zlib (no image library). Labels use a 5×7 bitmap font (upper case, digits and a few
 * signs). Everything is drawn from the values given, so the same input always gives the same bytes.
 */
import { crc32, deflateSync } from 'node:zlib';

export type Rgb = readonly [number, number, number];

const hex = (value: string): Rgb => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

/** BLUE3 colors (frontend/src/styles/blue-tokens.css). */
export const COLORS = {
  white: hex('#ffffff'),
  page: hex('#f5f7fa'),
  border: hex('#dee2e6'),
  grid: hex('#e9ecef'),
  text: hex('#212529'),
  muted: hex('#6c757d'),
  blue: hex('#0095da'),
  darkBlue: hex('#006494'),
  lightBlue: hex('#cce9f7'),
  green: hex('#2e7d32'),
  red: hex('#e53935'),
  amber: hex('#f9a825'),
} as const;

// 5×7 glyphs, one string per row ('#' = ink). Lower case is drawn as upper case; unknown characters as '?'.
const GLYPHS: Record<string, readonly string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  '%': ['##...', '##..#', '...#.', '..#..', '.#...', '#..##', '...##'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '/': ['.....', '....#', '...#.', '..#..', '.#...', '#....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
};

const glyphOf = (char: string): readonly string[] => GLYPHS[char.toUpperCase()] ?? (GLYPHS['?'] as readonly string[]);

/** A width × height RGB picture with the few drawing operations the seed images need. */
export class Canvas {
  readonly width: number;
  readonly height: number;
  private readonly pixels: Uint8Array;

  constructor(width: number, height: number, background: Rgb = COLORS.white) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height * 3);
    this.rect(0, 0, width, height, background);
  }

  /** A filled rectangle (clipped to the picture). */
  rect(x: number, y: number, w: number, h: number, color: Rgb): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        const i = (py * this.width + px) * 3;
        this.pixels[i] = color[0];
        this.pixels[i + 1] = color[1];
        this.pixels[i + 2] = color[2];
      }
    }
  }

  /** A rectangle outline `thickness` pixels wide. */
  frame(x: number, y: number, w: number, h: number, color: Rgb, thickness = 1): void {
    this.rect(x, y, w, thickness, color);
    this.rect(x, y + h - thickness, w, thickness, color);
    this.rect(x, y, thickness, h, color);
    this.rect(x + w - thickness, y, thickness, h, color);
  }

  /** A straight line `thickness` pixels wide; `dash` draws every other `dash` pixels. */
  line(x0: number, y0: number, x1: number, y1: number, color: Rgb, thickness = 2, dash = 0): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const half = Math.floor(thickness / 2);
    for (let s = 0; s <= steps; s += 1) {
      if (dash > 0 && Math.floor(s / dash) % 2 === 1) continue;
      const x = x0 + ((x1 - x0) * s) / steps;
      const y = y0 + ((y1 - y0) * s) / steps;
      this.rect(x - half, y - half, thickness, thickness, color);
    }
  }

  /** Text in the bitmap font, `scale` pixels per font dot. Returns the width drawn. */
  text(x: number, y: number, value: string, color: Rgb, scale = 2): number {
    let cursor = Math.round(x);
    for (const char of value) {
      const glyph = glyphOf(char);
      glyph.forEach((row, gy) => {
        for (let gx = 0; gx < row.length; gx += 1) {
          if (row[gx] === '#') this.rect(cursor + gx * scale, y + gy * scale, scale, scale, color);
        }
      });
      cursor += 6 * scale;
    }
    return cursor - x;
  }

  /** Text centered on `cx`. */
  centered(cx: number, y: number, value: string, color: Rgb, scale = 2): void {
    this.text(cx - textWidth(value, scale) / 2, y, value, color, scale);
  }

  /** The picture as a PNG file (8-bit RGB, no filtering, zlib level 9). */
  toPng(): Buffer {
    const stride = this.width * 3;
    const raw = Buffer.alloc((stride + 1) * this.height);
    for (let y = 0; y < this.height; y += 1) {
      raw[y * (stride + 1)] = 0; // filter: none
      raw.set(this.pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(this.width, 0);
    header.writeUInt32BE(this.height, 4);
    header[8] = 8; // bit depth
    header[9] = 2; // color type: RGB
    header[10] = 0; // compression
    header[11] = 0; // filter method
    header[12] = 0; // no interlace
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

export const textWidth = (value: string, scale = 2): number => [...value].length * 6 * scale - scale;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([length, body, crc]);
}

// --- the kinds of pictures ----------------------------------------------------------------------------------------

export type ImageSpec =
  | { kind: 'bars'; title: string; labels: string[]; values: number[]; unit: string; highlightLast?: boolean }
  | { kind: 'line'; title: string; labels: string[]; values: number[]; unit: string; target?: number }
  | { kind: 'tiles'; title: string; tiles: { label: string; value: string; color: 'blue' | 'green' | 'amber' | 'red' }[] }
  | { kind: 'board'; title: string; columns: { name: string; cards: string[] }[] }
  | { kind: 'form'; title: string; fields: string[]; button: string; step?: string }
  | { kind: 'funnel'; title: string; steps: { label: string; value: number }[] };

export const IMAGE_WIDTH = 720;
export const IMAGE_HEIGHT = 405;

/** Draws one of the picture kinds as a PNG. */
export function renderImage(spec: ImageSpec): Buffer {
  const canvas = new Canvas(IMAGE_WIDTH, IMAGE_HEIGHT, COLORS.white);
  canvas.frame(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT, COLORS.border);
  canvas.text(28, 24, spec.title, COLORS.text, 3);
  switch (spec.kind) {
    case 'bars':
      drawBars(canvas, spec);
      break;
    case 'line':
      drawLine(canvas, spec);
      break;
    case 'tiles':
      drawTiles(canvas, spec);
      break;
    case 'board':
      drawBoard(canvas, spec);
      break;
    case 'form':
      drawForm(canvas, spec);
      break;
    case 'funnel':
      drawFunnel(canvas, spec);
      break;
  }
  return canvas.toPng();
}

/** A number as the chart shows it: up to one decimal, the unit after it. */
export function formatValue(value: number, unit = ''): string {
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}${unit}`;
}

const PLOT = { left: 70, top: 80, right: IMAGE_WIDTH - 30, bottom: IMAGE_HEIGHT - 60 };

/** Grid lines with their values; returns the value → y mapping. */
function axes(canvas: Canvas, max: number): (value: number) => number {
  const height = PLOT.bottom - PLOT.top;
  const y = (value: number) => PLOT.bottom - (value / max) * height;
  for (let i = 0; i <= 4; i += 1) {
    const value = (max / 4) * i;
    canvas.line(PLOT.left, y(value), PLOT.right, y(value), COLORS.grid, 1);
    const label = formatValue(value);
    canvas.text(PLOT.left - 10 - textWidth(label, 1), y(value) - 3, label, COLORS.muted, 1);
  }
  canvas.line(PLOT.left, PLOT.bottom, PLOT.right, PLOT.bottom, COLORS.muted, 1);
  return y;
}

const niceMax = (values: number[], extra = 0): number => {
  const top = Math.max(...values, extra, 1) * 1.15;
  const magnitude = 10 ** Math.floor(Math.log10(top));
  return Math.ceil(top / magnitude) * magnitude;
};

function drawBars(canvas: Canvas, spec: Extract<ImageSpec, { kind: 'bars' }>): void {
  const y = axes(canvas, niceMax(spec.values));
  const slot = (PLOT.right - PLOT.left) / spec.values.length;
  const barWidth = Math.min(60, slot * 0.6);
  spec.values.forEach((value, i) => {
    const cx = PLOT.left + slot * i + slot / 2;
    const top = y(value);
    const color = spec.highlightLast && i === spec.values.length - 1 ? COLORS.darkBlue : COLORS.blue;
    canvas.rect(cx - barWidth / 2, top, barWidth, PLOT.bottom - top, color);
    canvas.centered(cx, top - 16, formatValue(value, spec.unit), COLORS.text, 1);
    canvas.centered(cx, PLOT.bottom + 12, spec.labels[i] ?? '', COLORS.muted, 1);
  });
}

function drawLine(canvas: Canvas, spec: Extract<ImageSpec, { kind: 'line' }>): void {
  const y = axes(canvas, niceMax(spec.values, spec.target ?? 0));
  const step = (PLOT.right - PLOT.left - 40) / Math.max(1, spec.values.length - 1);
  const x = (i: number) => PLOT.left + 20 + step * i;
  if (spec.target !== undefined) {
    canvas.line(PLOT.left, y(spec.target), PLOT.right, y(spec.target), COLORS.green, 2, 8);
    canvas.text(PLOT.right - 110, y(spec.target) - 18, `TARGET ${formatValue(spec.target, spec.unit)}`, COLORS.green, 1);
  }
  spec.values.forEach((value, i) => {
    const next = spec.values[i + 1];
    if (next !== undefined) canvas.line(x(i), y(value), x(i + 1), y(next), COLORS.blue, 3);
  });
  spec.values.forEach((value, i) => {
    canvas.rect(x(i) - 4, y(value) - 4, 9, 9, COLORS.darkBlue);
    canvas.centered(x(i), PLOT.bottom + 12, spec.labels[i] ?? '', COLORS.muted, 1);
  });
  const last = spec.values.length - 1;
  const lastValue = spec.values[last];
  if (lastValue !== undefined) {
    const label = formatValue(lastValue, spec.unit);
    canvas.centered(Math.min(x(last), PLOT.right - textWidth(label, 2) / 2), y(lastValue) - 20, label, COLORS.text, 2);
  }
}

function drawTiles(canvas: Canvas, spec: Extract<ImageSpec, { kind: 'tiles' }>): void {
  const gap = 20;
  const count = spec.tiles.length;
  const width = (IMAGE_WIDTH - 56 - gap * (count - 1)) / count;
  spec.tiles.forEach((tile, i) => {
    const x = 28 + i * (width + gap);
    canvas.rect(x, 90, width, 250, COLORS.page);
    canvas.rect(x, 90, width, 8, COLORS[tile.color]);
    canvas.centered(x + width / 2, 150, tile.value, COLORS[tile.color], 4);
    canvas.centered(x + width / 2, 250, tile.label, COLORS.muted, 2);
  });
}

function drawBoard(canvas: Canvas, spec: Extract<ImageSpec, { kind: 'board' }>): void {
  const gap = 16;
  const count = spec.columns.length;
  const width = (IMAGE_WIDTH - 56 - gap * (count - 1)) / count;
  spec.columns.forEach((column, i) => {
    const x = 28 + i * (width + gap);
    canvas.rect(x, 80, width, 300, COLORS.page);
    canvas.text(x + 12, 92, `${column.name} (${column.cards.length})`, COLORS.muted, 2);
    column.cards.slice(0, 5).forEach((card, j) => {
      const cy = 124 + j * 50;
      canvas.rect(x + 10, cy, width - 20, 40, COLORS.white);
      canvas.frame(x + 10, cy, width - 20, 40, COLORS.border);
      canvas.rect(x + 10, cy, 4, 40, i === count - 1 ? COLORS.green : COLORS.blue);
      canvas.text(x + 22, cy + 16, card.slice(0, Math.floor((width - 40) / 6)), COLORS.text, 1);
    });
  });
}

function drawForm(canvas: Canvas, spec: Extract<ImageSpec, { kind: 'form' }>): void {
  // A browser-like frame with the form inside.
  canvas.rect(28, 70, IMAGE_WIDTH - 56, 26, COLORS.page);
  [COLORS.red, COLORS.amber, COLORS.green].forEach((color, i) => canvas.rect(40 + i * 16, 79, 8, 8, color));
  canvas.frame(28, 70, IMAGE_WIDTH - 56, 315, COLORS.border);
  if (spec.step) canvas.text(IMAGE_WIDTH - 60 - textWidth(spec.step, 2), 108, spec.step, COLORS.blue, 2);
  spec.fields.slice(0, 4).forEach((field, i) => {
    const y = 116 + i * 56;
    canvas.text(60, y, field, COLORS.muted, 1);
    canvas.rect(60, y + 12, 400, 30, COLORS.white);
    canvas.frame(60, y + 12, 400, 30, COLORS.border);
  });
  canvas.rect(500, 300, 170, 44, COLORS.blue);
  canvas.centered(585, 315, spec.button, COLORS.white, 2);
}

function drawFunnel(canvas: Canvas, spec: Extract<ImageSpec, { kind: 'funnel' }>): void {
  const first = spec.steps[0]?.value ?? 1;
  const rowHeight = Math.min(64, 280 / spec.steps.length);
  spec.steps.forEach((step, i) => {
    const width = Math.max(60, ((IMAGE_WIDTH - 280) * step.value) / first);
    const y = 90 + i * rowHeight;
    canvas.rect(200, y, width, rowHeight - 12, i === spec.steps.length - 1 ? COLORS.darkBlue : COLORS.blue);
    canvas.text(28, y + rowHeight / 2 - 12, step.label, COLORS.text, 2);
    const share = `${Math.round((step.value / first) * 100)}%`;
    canvas.text(210 + width, y + rowHeight / 2 - 12, share, COLORS.muted, 2);
  });
}
