import { describe, expect, it } from 'vitest';
import { buildPalette, changedRect, ColorHistogram, delayFromMicroseconds, GifWriter, lzwEncode, PaletteMapper } from './gifEncoder';

/** An LZW decoder written from the GIF specification (as browsers decode), to check the encoder against. */
function lzwDecode(data: number[], minCodeSize: number): number[] {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const first = new Uint8Array(4096);
  for (let i = 0; i < clear; i++) {
    suffix[i] = i;
    first[i] = i;
  }
  const out: number[] = [];
  const sequence = (code: number) => {
    const s: number[] = [];
    for (let c = code; c >= 0; c = c < clear ? -1 : prefix[c]!) s.push(suffix[c]!);
    return s.reverse();
  };
  let size = minCodeSize + 1;
  let next = end + 1;
  let previous = -1;
  let bitPos = 0;
  for (;;) {
    let code = 0;
    for (let b = 0; b < size; b++, bitPos++) code |= ((data[bitPos >> 3]! >> (bitPos & 7)) & 1) << b;
    if (code === clear) {
      size = minCodeSize + 1;
      next = end + 1;
      previous = -1;
      continue;
    }
    if (code === end) return out;
    if (previous < 0) {
      out.push(...sequence(code));
      previous = code;
      continue;
    }
    const entry = code < next ? sequence(code) : [...sequence(previous), first[previous]!];
    if (next < 4096) {
      prefix[next] = previous;
      suffix[next] = entry[0]!;
      first[next] = first[previous]!;
      next++;
    }
    out.push(...entry);
    previous = code;
    if (next === 1 << size && size < 12) size++;
  }
}

/** Joins the sub-blocks written by lzwEncode back into one byte list (after the min-code-size byte). */
function encoded(indices: Uint8Array, minCodeSize: number): number[] {
  const bytes: number[] = [];
  lzwEncode(indices, minCodeSize, { byte: (b) => bytes.push(b) });
  expect(bytes[0]).toBe(minCodeSize);
  const data: number[] = [];
  let at = 1;
  for (let length = bytes[at]!; length > 0; length = bytes[at]!) {
    expect(length).toBeLessThanOrEqual(255);
    data.push(...bytes.slice(at + 1, at + 1 + length));
    at += length + 1;
  }
  expect(at).toBe(bytes.length - 1); // the 0 terminator is last
  return data;
}

function random(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

describe('lzwEncode()', () => {
  it('decodes back to the same pixels, including when the dictionary fills up and starts again', () => {
    const rnd = random(42);
    const cases: [Uint8Array, number][] = [
      [new Uint8Array([3]), 2],
      [new Uint8Array(5000).fill(1), 2], // long runs
      [Uint8Array.from({ length: 60_000 }, () => Math.floor(rnd() * 256)), 8], // noise: thousands of codes, many restarts
      [Uint8Array.from({ length: 40_000 }, (_, i) => (i % 97 < 50 ? i % 7 : Math.floor(rnd() * 16))), 4], // mixed
    ];
    for (const [indices, min] of cases) expect(lzwDecode(encoded(indices, min), min)).toEqual(Array.from(indices));
  });
});

describe('buildPalette() and PaletteMapper', () => {
  it('keeps every colour exactly when there are few, and never more than asked for', () => {
    const pixels = new Uint8Array([255, 0, 0, 255, 0, 128, 0, 255, 0, 0, 0, 0, 16, 32, 200, 255]);
    const histogram = new ColorHistogram();
    histogram.add(pixels);
    expect(histogram.sawTransparency).toBe(true);
    const palette = buildPalette(histogram, 255);
    expect(new Set(palette.map((c) => c.join()))).toEqual(new Set(['255,0,0', '0,128,0', '16,32,200']));
    const mapper = new PaletteMapper(palette, palette.length);
    const out = new Uint8Array(4);
    mapper.map(pixels, out);
    expect(palette[out[0]!]).toEqual([255, 0, 0]);
    expect(out[2]).toBe(palette.length); // the clear pixel
  });

  it('reduces a full-colour image to the limit with a small error', () => {
    const rnd = random(7);
    const pixels = new Uint8Array(200 * 200 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      const x = (i / 4) % 200;
      pixels[i] = x;
      pixels[i + 1] = Math.floor(rnd() * 256);
      pixels[i + 2] = 255 - x;
      pixels[i + 3] = 255;
    }
    const histogram = new ColorHistogram();
    histogram.add(pixels);
    const palette = buildPalette(histogram, 255);
    expect(palette.length).toBeLessThanOrEqual(255);
    const out = new Uint8Array(200 * 200);
    new PaletteMapper(palette, 255).map(pixels, out);
    let error = 0;
    for (let p = 0; p < out.length; p++) for (let c = 0; c < 3; c++) error += Math.abs(palette[out[p]!]![c]! - pixels[p * 4 + c]!);
    expect(error / (out.length * 3)).toBeLessThan(12); // on 0–255, for random noise in one channel
  });
});

describe('changedRect()', () => {
  it('keeps only the rectangle that changed, with unchanged pixels clear, and updates the screen', () => {
    const T = 9;
    const shown = new Uint8Array(16).fill(1); // 4 x 4
    const next = shown.slice();
    next[5] = 2; // (1,1)
    next[10] = 3; // (2,2)
    const rect = changedRect(shown, next, 4, T);
    expect(rect).toMatchObject({ left: 1, top: 1, width: 2, height: 2 });
    expect(Array.from(rect?.indices ?? [])).toEqual([2, T, T, 3]);
    expect(shown).toEqual(next);
    expect(changedRect(shown, next.slice(), 4, T)).toBeNull();
  });

  it('turns frame times into hundredths of a second as browsers do', () => {
    expect(delayFromMicroseconds(40_000)).toBe(4);
    expect(delayFromMicroseconds(0)).toBe(10);
    expect(delayFromMicroseconds(10_000)).toBe(10);
  });
});

describe('GifWriter', () => {
  it('writes a looping GIF89a whose frames hold the right rectangles, delays and pixels', () => {
    const palette = [
      [255, 255, 255],
      [220, 38, 38],
      [26, 86, 219],
    ] as const;
    const writer = new GifWriter(4, 3, palette, 0, 3, false);
    writer.frame({ left: 0, top: 0, width: 4, height: 3, indices: new Uint8Array(12).fill(0), delayCs: 50 });
    writer.frame({ left: 1, top: 1, width: 2, height: 1, indices: new Uint8Array([1, 2]), delayCs: 7 });
    const gif = Array.from(writer.finish());

    expect(String.fromCharCode(...gif.slice(0, 6))).toBe('GIF89a');
    expect(gif[6]! | (gif[7]! << 8)).toBe(4);
    expect(gif[8]! | (gif[9]! << 8)).toBe(3);
    const tableSize = 2 << (gif[10]! & 7);
    expect(tableSize).toBe(4); // 3 colours + the clear entry
    expect(gif.slice(13, 19)).toEqual([255, 255, 255, 220, 38, 38]);
    let at = 13 + tableSize * 3;
    expect(String.fromCharCode(...gif.slice(at + 3, at + 14))).toBe('NETSCAPE2.0');
    expect(gif[at + 16]! | (gif[at + 17]! << 8)).toBe(0); // loop forever
    at += 19;

    const frames: { delay: number; dispose: number; rect: number[]; pixels: number[] }[] = [];
    while (gif[at] === 0x21) {
      expect(gif[at + 1]).toBe(0xf9);
      const delay = gif[at + 4]! | (gif[at + 5]! << 8);
      const dispose = (gif[at + 3]! >> 2) & 7;
      expect(gif[at + 3]! & 1).toBe(1);
      expect(gif[at + 6]).toBe(3);
      at += 8;
      expect(gif[at]).toBe(0x2c);
      const word = (o: number) => gif[at + o]! | (gif[at + o + 1]! << 8);
      const rect = [word(1), word(3), word(5), word(7)];
      at += 10;
      const min = gif[at]!;
      const data: number[] = [];
      at += 1;
      while (gif[at]! > 0) {
        data.push(...gif.slice(at + 1, at + 1 + gif[at]!));
        at += gif[at]! + 1;
      }
      at += 1;
      frames.push({ delay, dispose, rect, pixels: lzwDecode(data, min) });
    }
    expect(gif[at]).toBe(0x3b);
    expect(at).toBe(gif.length - 1);
    expect(frames).toEqual([
      { delay: 50, dispose: 1, rect: [0, 0, 4, 3], pixels: new Array(12).fill(0) },
      { delay: 7, dispose: 1, rect: [1, 1, 2, 1], pixels: [1, 2] },
    ]);
  });

  it('plays once without a loop block, and clears each frame when the GIF has real transparency', () => {
    const writer = new GifWriter(1, 1, [[0, 0, 0]], null, 1, true);
    writer.frame({ left: 0, top: 0, width: 1, height: 1, indices: new Uint8Array([1]), delayCs: 10 });
    const gif = Array.from(writer.finish());
    expect(String.fromCharCode(...gif)).not.toContain('NETSCAPE');
    const gce = 13 + 2 * 3;
    expect([gif[gce], gif[gce + 1], (gif[gce + 3]! >> 2) & 7]).toEqual([0x21, 0xf9, 2]);
  });
});
