import { describe, expect, it } from 'vitest';
import { pageItems } from '../../utils/pageItems';
import {
  fromSharedChoice,
  isFiltered,
  listDateOf,
  notesQuery,
  readNoteFilters,
  readPage,
  sharedChoice,
} from './listFilters';

const PROJECT = '6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b';
const TEAM = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const address = (search: string) => {
  const params = new URLSearchParams(search);
  return (key: string) => params.get(key) ?? '';
};

describe("the Notes page's filters in the address", () => {
  it('reads every filter, and ignores values the server would refuse', () => {
    expect(readNoteFilters(address(`?q=%20retry%20&project=${PROJECT}&team=${TEAM}&from=2026-10-01&to=2026-11-30&sort=oldest`))).toEqual({
      q: 'retry',
      project: PROJECT,
      shared: '',
      team: TEAM,
      from: '2026-10-01',
      to: '2026-11-30',
      sort: 'oldest',
    });
    expect(readNoteFilters(address('?project=abc&team=x&shared=maybe&from=1%20Oct&sort=title'))).toEqual({
      q: '',
      project: '',
      shared: '',
      team: '',
      from: '',
      to: '',
      sort: 'newest',
    });
    expect(readNoteFilters(address('?project=none&shared=no')).project).toBe('none');
    // Days the wrong way round are swapped rather than refused.
    expect(readNoteFilters(address('?from=2026-11-30&to=2026-10-01'))).toMatchObject({ from: '2026-10-01', to: '2026-11-30' });
  });

  it('reads the page, 1 when missing or not a page', () => {
    expect(readPage(address('?page=3'))).toBe(3);
    for (const bad of ['', '?page=0', '?page=-2', '?page=1.5', '?page=two', '?page=99999']) expect(readPage(address(bad))).toBe(1);
  });

  it('asks the server for one page of 10 with only the filters in use', () => {
    const filters = readNoteFilters(address(`?q=retry&project=${PROJECT}&shared=yes`));
    expect(notesQuery(filters, 1)).toEqual({ q: 'retry', project: PROJECT, shared: 'yes', sort: 'newest', offset: 0, limit: 10 });
    expect(notesQuery(readNoteFilters(address('')), 3)).toEqual({ sort: 'newest', offset: 20, limit: 10 });
  });

  it('tells when the list is narrowed', () => {
    const none = readNoteFilters(address(''));
    expect(isFiltered(none)).toBe(false);
    expect(isFiltered(readNoteFilters(address('?sort=oldest')))).toBe(false); // the order alone narrows nothing
    expect(isFiltered(readNoteFilters(address('?from=2026-10-01&sort=edited')))).toBe(true);
    expect(isFiltered(readNoteFilters(address('?shared=no')))).toBe(true);
  });

  it('keeps "Shared" as one choice for two address values', () => {
    expect(sharedChoice({ shared: '', team: TEAM })).toBe(`team:${TEAM}`);
    expect(sharedChoice({ shared: 'no', team: '' })).toBe('no');
    expect(fromSharedChoice(`team:${TEAM}`)).toEqual({ shared: '', team: TEAM });
    expect(fromSharedChoice('yes')).toEqual({ shared: 'yes', team: '' });
    expect(fromSharedChoice('')).toEqual({ shared: '', team: '' });
  });

  it('places a row by the day it was written, or last saved when the list is in that order', () => {
    const note = { createdAt: '2026-10-01T03:00:00.000Z', updatedAt: '2026-11-20T03:00:00.000Z' };
    expect(listDateOf('newest', note)).toBe(note.createdAt);
    expect(listDateOf('edited', note)).toBe(note.updatedAt);
  });
});

describe('page buttons', () => {
  it('shows the ends, the pages around the current one, and gaps for the rest', () => {
    expect(pageItems(6, 20)).toEqual([1, 'gap', 5, 6, 7, 'gap', 20]);
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, 'gap', 20]);
    expect(pageItems(20, 20)).toEqual([1, 'gap', 17, 18, 19, 20]);
    expect(pageItems(4, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]); // a gap never hides a single page
    expect(pageItems(2, 3)).toEqual([1, 2, 3]);
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(9, 5)).toEqual([1, 2, 3, 4, 5]); // past the end: the last page
    expect(pageItems(1, 0)).toEqual([]);
  });
});
