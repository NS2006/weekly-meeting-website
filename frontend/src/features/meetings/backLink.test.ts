import { describe, expect, it } from 'vitest';
import { backLinkFrom } from './backLink';

const team = '38206831-1cd3-4473-931d-440880d61d72';
const meeting = 'd7486b30-953a-41c4-9da8-09c36b0b95ea';

describe('the meeting page back link', () => {
  it('returns to a period page, its notes, or the meeting being read there', () => {
    for (const to of [
      `/teams/${team}/periods/2026-10-3m`,
      `/teams/${team}/periods/2026-10-3m?month=2026-11`,
      `/teams/${team}/periods/2026-10-3m?tab=read`,
      `/teams/${team}/periods/2026-10-3m?tab=read#read-${meeting}`,
    ]) {
      expect(backLinkFrom({ from: to, fromLabel: 'Q4 2026' })).toEqual({ kind: 'period', to, label: 'Q4 2026' });
    }
  });

  it("keeps the reader's chosen meetings and people", () => {
    const other = '79bd38bf-eac3-4f04-981b-942d44570c6d';
    const to = `/teams/${team}/periods/2026-10-3m?tab=read&meetings=${meeting}%2C${other}&people=none#read-${meeting}`;
    expect(backLinkFrom({ from: to, fromLabel: 'Q4 2026' })).toEqual({ kind: 'period', to, label: 'Q4 2026' });
  });

  it('ignores anything else', () => {
    expect(backLinkFrom(null)).toBeNull();
    expect(backLinkFrom('nonsense')).toBeNull();
    expect(backLinkFrom({ from: `/teams/${team}/periods/2026-10-3m` })).toBeNull(); // no name to show
    expect(backLinkFrom({ from: 'https://example.com/teams/x/periods/y', fromLabel: 'Q4 2026' })).toBeNull();
    expect(backLinkFrom({ from: `/teams/${team}`, fromLabel: 'Q4 2026' })).toBeNull();
    expect(backLinkFrom({ from: `/teams/${team}/periods/2026-10-3m?tab=read#elsewhere`, fromLabel: 'Q4 2026' })).toBeNull();
    expect(backLinkFrom({ from: `/teams/${team}/periods/2026-10-3m?tab=read&next=/evil`, fromLabel: 'Q4 2026' })).toBeNull();
    expect(backLinkFrom({ from: `/teams/${team}/periods/2026-10-3m?people=<b>`, fromLabel: 'Q4 2026' })).toBeNull();
    expect(backLinkFrom({ from: `//evil.example/teams/${team}/periods/2026-10-3m`, fromLabel: 'Q4 2026' })).toBeNull();
    expect(backLinkFrom({ from: `/teams/${team}/periods/2026-10-3m?month=November`, fromLabel: 'Q4 2026' })).toBeNull();
    // The Meetings page is gone: an old state from it links to the team.
    expect(backLinkFrom({ from: '/meetings?when=past&period=2026-10-3m' })).toBeNull();
  });
});
