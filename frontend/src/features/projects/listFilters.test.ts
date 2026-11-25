import { describe, expect, it } from 'vitest';
import { CLEARED, isFiltered, projectsQuery, readProjectFilters, readProjectStatus } from './listFilters';

const address = (search: string) => {
  const params = new URLSearchParams(search);
  return (key: string) => params.get(key) ?? '';
};
const TEAM = '11111111-2222-4333-8444-555555555555';

describe('the Projects page filters in the address', () => {
  it('reads every filter, the tab and the order', () => {
    const get = address(`?status=archived&q=%20checkout%20&activity=quiet&shared=no&team=${TEAM}&sort=stale`);
    expect(readProjectStatus(get)).toBe('archived');
    expect(readProjectFilters(get)).toEqual({ q: 'checkout', activity: 'quiet', shared: 'no', team: TEAM, sort: 'stale' });
  });

  it('ignores values the server would refuse, so an old link still shows projects', () => {
    const get = address('?status=deleted&activity=year&shared=maybe&team=12&sort=size');
    expect(readProjectStatus(get)).toBe('active');
    expect(readProjectFilters(get)).toEqual({ q: '', activity: '', shared: '', team: '', sort: 'updated' });
  });

  it('asks the server for one page of 12, with only the filters in use', () => {
    const filters = readProjectFilters(address('?activity=week&sort=name'));
    expect(projectsQuery('active', filters, 3)).toEqual({ status: 'active', sort: 'name', activity: 'week', offset: 24, limit: 12 });
  });

  it('counts the order alone as no filter, and clears the filters but not the tab or order', () => {
    expect(isFiltered(readProjectFilters(address('?sort=oldest')))).toBe(false);
    expect(isFiltered(readProjectFilters(address(`?team=${TEAM}`)))).toBe(true);
    expect(Object.keys(CLEARED)).not.toContain('status');
    expect(Object.keys(CLEARED)).not.toContain('sort');
  });
});
