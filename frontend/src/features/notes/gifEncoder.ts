/**
 * A small animated-GIF encoder, so a big GIF can be made smaller in the browser without a library: one shared
 * palette of up to 255 colours (median cut), frames stored as the rectangle that changed (unchanged pixels
 * transparent), identical frames merged, LZW-compressed. Pure code (no DOM), so it is tested in Node.
 */

/** Pixels of one frame, RGBA (what a canvas's getImageData gives). */
export type Rgba = Uint8ClampedArray | Uint8Array;
export type Rgb = readonly [number, number, number];

const KEY_COUNT = 1 << 15; // colours grouped 5 bits per channel

const keyOf = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/** Counts colours (5 bits per channel) from sampled pixels; transparent pixels are not colours. */
export class ColorHistogram {
  readonly counts = new Float64Array(KEY_COUNT);
  readonly sums = new Float64Array(KEY_COUNT * 3);
  sawTransparency = false;

  /** Every pixel is checked for transparency; every `step`-th one is counted. */
  add(pixels: Rgba, step = 1): void {
    const every = Math.max(1, Math.floor(step));
    for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
      if (pixels[i + 3]! < 128) {
        this.sawTransparency = true;
        continue;
      }
      if (p % every !== 0) continue;
      const r = pixels[i]!;
      const g = pixels[i + 1]!;
      const b = pixels[i + 2]!;
      const key = keyOf(r, g, b);
      this.counts[key] = this.counts[key]! + 1;
      this.sums[key * 3] = this.sums[key * 3]! + r;
      this.sums[key * 3 + 1] = this.sums[key * 3 + 1]! + g;
      this.sums[key * 3 + 2] = this.sums[key * 3 + 2]! + b;
    }
  }
}

/** Median cut: splits the most populous, widest colour box until there are `maxColors` boxes; each becomes its average. */
export function buildPalette(histogram: ColorHistogram, maxColors: number): Rgb[] {
  const keys: number[] = [];
  for (let key = 0; key < KEY_COUNT; key++) if (histogram.counts[key]! > 0) keys.push(key);
  if (keys.length === 0) return [[0, 0, 0]];
  const channel = (key: number, c: number) => (key >> (10 - c * 5)) & 31;
  type Box = { keys: number[]; count: number; axis: number; range: number };
  const box = (members: number[]): Box => {
    let count = 0;
    let axis = 0;
    let range = -1;
    for (let c = 0; c < 3; c++) {
      let lo = 31;
      let hi = 0;
      for (const key of members) {
        const v = channel(key, c);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > range) {
        range = hi - lo;
        axis = c;
      }
    }
    for (const key of members) count += histogram.counts[key]!;
    return { keys: members, count, axis, range };
  };
  const boxes = [box(keys)];
  while (boxes.length < maxColors) {
    let best = -1;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]!;
      if (b.keys.length > 1 && (best < 0 || b.count * (b.range + 1) > boxes[best]!.count * (boxes[best]!.range + 1))) best = i;
    }
    if (best < 0) break; // every colour has its own entry
    const { keys: members, count, axis } = boxes[best]!;
    members.sort((a, b) => channel(a, axis) - channel(b, axis));
    let seen = 0;
    let cut = 1;
    for (; cut < members.length - 1; cut++) {
      seen += histogram.counts[members[cut - 1]!]!;
      if (seen >= count / 2) break;
    }
    boxes.splice(best, 1, box(members.slice(0, cut)), box(members.slice(cut)));
  }
  return boxes.map(({ keys: members, count }) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const key of members) {
      r += histogram.sums[key * 3]!;
      g += histogram.sums[key * 3 + 1]!;
      b += histogram.sums[key * 3 + 2]!;
    }
    return [Math.round(r / count), Math.round(g / count), Math.round(b / count)] as const;
  });
}

/** Maps pixels to the nearest palette entry (cached per 5-bit colour); transparent pixels to `transparent`. */
export class PaletteMapper {
  private readonly cache = new Int16Array(KEY_COUNT).fill(-1);

  constructor(
    private readonly palette: readonly Rgb[],
    readonly transparent: number,
  ) {}

  map(pixels: Rgba, out: Uint8Array): void {
    for (let i = 0, p = 0; p < out.length; i += 4, p++) {
      if (pixels[i + 3]! < 128) {
        out[p] = this.transparent;
        continue;
      }
      const key = keyOf(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
      let index = this.cache[key]!;
      if (index < 0) {
        index = this.nearest(((key >> 10) << 3) | 4, (((key >> 5) & 31) << 3) | 4, ((key & 31) << 3) | 4);
        this.cache[key] = index;
      }
      out[p] = index;
    }
  }

  private nearest(r: number, g: number, b: number): number {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < this.palette.length; i++) {
      const [pr, pg, pb] = this.palette[i]!;
      // Weighted for the eye: green matters most, blue least.
      const d = 2 * (pr - r) ** 2 + 4 * (pg - g) ** 2 + 3 * (pb - b) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    return best;
  }
}

/** A frame as written: the changed rectangle of the canvas, its palette indices, how long it shows. */
export type GifFrame = { left: number; top: number; width: number; height: number; indices: Uint8Array; delayCs: number };

/**
 * The part of `next` that differs from what is on screen (`shown`), with unchanged pixels set to `transparent` so
 * the frame below shows through. Null when nothing changed (the caller lengthens the previous frame instead).
 * `shown` is updated to the new screen.
 */
export function changedRect(shown: Uint8Array, next: Uint8Array, width: number, transparent: number): Omit<GifFrame, 'delayCs'> | null {
  const height = next.length / width;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0, p = 0; y < height; y++) {
    for (let x = 0; x < width; x++, p++) {
      if (shown[p] === next[p]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
    }
  }
  if (right < 0) return null;
  const w = right - left + 1;
  const h = bottom - top + 1;
  const indices = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (top + y) * width + left + x;
      const value = next[p]!;
      indices[y * w + x] = shown[p] === value ? transparent : value;
      shown[p] = value;
    }
  }
  return { left, top, width: w, height: h, indices };
}

/** Browsers show a delay under 2 hundredths of a second as 1/10 s; so does this encoder. */
export const delayFromMicroseconds = (us: number) => {
  const cs = Math.round(us / 10_000);
  return cs < 2 ? 10 : Math.min(cs, 65_535);
};

class Bytes {
  private buffer: Uint8Array<ArrayBuffer> = new Uint8Array(1 << 16);
  length = 0;

  byte(b: number): void {
    if (this.length === this.buffer.length) {
      const bigger = new Uint8Array(this.buffer.length * 2);
      bigger.set(this.buffer);
      this.buffer = bigger;
    }
    this.buffer[this.length++] = b;
  }

  word(n: number): void {
    this.byte(n & 255);
    this.byte((n >> 8) & 255);
  }

  text(s: string): void {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }

  result(): Uint8Array<ArrayBuffer> {
    return this.buffer.slice(0, this.length);
  }
}

/**
 * Writes a GIF89a: a global palette (padded to a power of two), a loop count (0 = forever, null = play once), and
 * frames. `transparent` is the palette index used for unchanged or clear pixels. `restore` clears each frame after
 * it shows (for GIFs with real transparency, whose frames are written whole); otherwise frames build on each other.
 */
export class GifWriter {
  private readonly out = new Bytes();
  private readonly bits: number;

  constructor(width: number, height: number, palette: readonly Rgb[], loop: number | null, private readonly transparent: number, private readonly restore: boolean) {
    const entries = Math.max(palette.length, transparent + 1, 2);
    this.bits = Math.max(1, Math.ceil(Math.log2(entries)));
    const out = this.out;
    out.text('GIF89a');
    out.word(width);
    out.word(height);
    out.byte(0x80 | ((this.bits - 1) << 4) | (this.bits - 1)); // global palette, its size
    out.byte(transparent < palette.length ? 0 : transparent); // background
    out.byte(0);
    for (let i = 0; i < 1 << this.bits; i++) {
      const [r, g, b] = palette[i] ?? [0, 0, 0];
      out.byte(r);
      out.byte(g);
      out.byte(b);
    }
    if (loop !== null) {
      out.byte(0x21);
      out.byte(0xff);
      out.byte(11);
      out.text('NETSCAPE2.0');
      out.byte(3);
      out.byte(1);
      out.word(loop);
      out.byte(0);
    }
  }

  frame(frame: GifFrame): void {
    const out = this.out;
    out.byte(0x21);
    out.byte(0xf9);
    out.byte(4);
    out.byte(((this.restore ? 2 : 1) << 2) | 1); // disposal, transparent index in use
    out.word(frame.delayCs);
    out.byte(this.transparent);
    out.byte(0);
    out.byte(0x2c);
    out.word(frame.left);
    out.word(frame.top);
    out.word(frame.width);
    out.word(frame.height);
    out.byte(0);
    lzwEncode(frame.indices, Math.max(2, this.bits), out);
  }

  finish(): Uint8Array<ArrayBuffer> {
    this.out.byte(0x3b);
    return this.out.result();
  }
}

/** GIF's LZW compression, written as 255-byte sub-blocks. The dictionary lives in a small hash table (as in GIFENCOD). */
export function lzwEncode(indices: Uint8Array, minCodeSize: number, out: { byte(b: number): void }): void {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const HSIZE = 5003;
  const keys = new Int32Array(HSIZE).fill(-1);
  const codes = new Int32Array(HSIZE);
  const block = new Uint8Array(255);
  let blockLength = 0;
  let size = minCodeSize + 1;
  let next = end + 1;
  let pending = 0;
  let pendingBits = 0;
  const flushBlock = () => {
    out.byte(blockLength);
    for (let i = 0; i < blockLength; i++) out.byte(block[i]!);
    blockLength = 0;
  };
  const emit = (code: number) => {
    pending |= code << pendingBits;
    pendingBits += size;
    while (pendingBits >= 8) {
      block[blockLength++] = pending & 255;
      if (blockLength === 255) flushBlock();
      pending >>>= 8;
      pendingBits -= 8;
    }
  };

  out.byte(minCodeSize);
  emit(clear);
  if (indices.length > 0) {
    let prefix = indices[0]!;
    outer: for (let i = 1; i < indices.length; i++) {
      const k = indices[i]!;
      const key = (k << 12) | prefix;
      let h = (k << 4) ^ prefix; // below 4096, inside the table
      if (keys[h] === key) {
        prefix = codes[h]!;
        continue;
      }
      if (keys[h]! >= 0) {
        const step = h === 0 ? 1 : HSIZE - h;
        do {
          h -= step;
          if (h < 0) h += HSIZE;
          if (keys[h] === key) {
            prefix = codes[h]!;
            continue outer;
          }
        } while (keys[h]! >= 0);
      }
      emit(prefix);
      if (next === 4096) {
        emit(clear); // the dictionary is full: start a new one
        keys.fill(-1);
        next = end + 1;
        size = minCodeSize + 1;
      } else {
        if (next >= 1 << size) size++;
        keys[h] = key;
        codes[h] = next++;
      }
      prefix = k;
    }
    emit(prefix);
  }
  emit(end);
  if (pendingBits > 0) {
    block[blockLength++] = pending & 255;
    if (blockLength === 255) flushBlock();
  }
  if (blockLength > 0) flushBlock();
  out.byte(0);
}
