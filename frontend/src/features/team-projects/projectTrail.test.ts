import { describe, expect, it } from 'vitest';
import { boardPath, projectPath, readTrail } from './projectTrail';

describe('projectTrail', () => {
  const team = 'team-1';
  const key = '2026-10-3m';

  it('builds the board and project addresses', () => {
    expect(boardPath(team, key)).toBe('/teams/team-1/periods/2026-10-3m?tab=projects');
    expect(projectPath(team, key, 'p 1')).toBe('/teams/team-1/periods/2026-10-3m/projects/p%201');
  });

  it("reads a trail back to this period's board", () => {
    const trail = { from: '/teams/team-1/periods/2026-10-3m?tab=projects&group=meeting', sequence: ['a', 'b'], column: 'Ana Putri' };
    expect(readTrail(trail, team, key)).toEqual(trail);
    expect(readTrail({ ...trail, from: '/teams/team-1/periods/2026-10-3m' }, team, key)).not.toBeNull();
  });

  it('refuses anything else: another page, another period, a broken list, no state', () => {
    const good = { from: '/teams/team-1/periods/2026-10-3m?tab=projects', sequence: ['a'], column: 'Ana' };
    expect(readTrail({ ...good, from: 'https://example.com/teams/team-1/periods/2026-10-3m' }, team, key)).toBeNull();
    expect(readTrail({ ...good, from: '/teams/team-1/periods/2026-07-3m?tab=projects' }, team, key)).toBeNull();
    expect(readTrail({ ...good, from: '/teams/team-1/periods/2026-10-3mx' }, team, key)).toBeNull();
    expect(readTrail({ ...good, sequence: ['a', 2] }, team, key)).toBeNull();
    expect(readTrail({ ...good, column: undefined }, team, key)).toBeNull();
    expect(readTrail(null, team, key)).toBeNull();
    expect(readTrail('x', team, key)).toBeNull();
  });
});
