import { describe, expect, it } from 'vitest';
import { dropIndex, moveItem, roomOf, shiftOf } from './dragSort';

// A list: three items 100 px tall, 300 wide, with 12 px between them (middles at y 50, 162 and 274).
const list = [
  { left: 0, top: 0, width: 300, height: 100 },
  { left: 0, top: 112, width: 300, height: 100 },
  { left: 0, top: 224, width: 300, height: 100 },
];
// A grid of three columns read left to right: 0 1 2 on the first row, 3 4 on the second.
const cell = (column: number, row: number) => ({ left: column * 320, top: row * 220, width: 300, height: 200 });
const grid = [cell(0, 0), cell(1, 0), cell(2, 0), cell(0, 1), cell(1, 1)];

describe('ordering by dragging', () => {
  it('lands on the item its middle is over, or else the nearest one', () => {
    expect(dropIndex(list, { x: 150, y: 50 })).toBe(0);
    expect(dropIndex(list, { x: 150, y: 150 })).toBe(1);
    expect(dropIndex(list, { x: 150, y: 106 })).toBe(0); // in the gap, nearer the first
    expect(dropIndex(list, { x: 150, y: 900 })).toBe(2); // far below: the end
    expect(dropIndex(list, { x: 150, y: -500 })).toBe(0); // far above: the start
    expect(dropIndex(grid, { x: 800, y: 100 })).toBe(2); // the end of the first row
    expect(dropIndex(grid, { x: 100, y: 300 })).toBe(3); // the start of the second row
    expect(dropIndex(grid, { x: 900, y: 400 })).toBe(4); // past the last item: the nearest one
  });

  it('in a list, moves the items in between up or down by the room the dragged one takes', () => {
    expect(roomOf(list, 0)).toBe(112);
    expect(roomOf(list, 2)).toBe(112); // the last one: the gap above it
    expect(roomOf([{ left: 0, top: 0, width: 10, height: 40 }], 0)).toBe(40);
    expect([0, 1, 2].map((i) => shiftOf(i, 0, 2, list, 'list').y)).toEqual([0, -112, -112]);
    expect([0, 1, 2].map((i) => shiftOf(i, 2, 0, list, 'list').y)).toEqual([112, 112, 0]);
    expect([0, 1, 2].map((i) => shiftOf(i, 1, 1, list, 'list'))).toEqual([0, 1, 2].map(() => ({ x: 0, y: 0 })));
  });

  it("in a grid, moves each item in between into its neighbour's place, wrapping between rows", () => {
    // The first item dragged to the second row's start: 1 and 2 step left, 3 steps up to the first row's end.
    expect([0, 1, 2, 3, 4].map((i) => shiftOf(i, 0, 3, grid, 'grid'))).toEqual([
      { x: 0, y: 0 },
      { x: -320, y: 0 },
      { x: -320, y: 0 },
      { x: 640, y: -220 },
      { x: 0, y: 0 },
    ]);
    // The last item dragged to the top-left: everything before it steps one place on.
    expect([0, 1, 2, 3, 4].map((i) => shiftOf(i, 4, 0, grid, 'grid'))).toEqual([
      { x: 320, y: 0 },
      { x: 320, y: 0 },
      { x: -640, y: 220 },
      { x: 320, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it('moves an item to its new place', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});
