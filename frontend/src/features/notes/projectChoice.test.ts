import { describe, expect, it } from 'vitest';
import { matchProjects, nameToCreate } from './projectChoice';

const projects = [{ name: 'Checkout revamp' }, { name: 'Payments' }, { name: 'Checkout analytics' }];

describe('the Project menu', () => {
  it('finds projects whose name holds the text, in any case', () => {
    expect(matchProjects(projects, '  CHECKOUT ').map((p) => p.name)).toEqual(['Checkout revamp', 'Checkout analytics']);
    expect(matchProjects(projects, '')).toHaveLength(3);
  });

  it('offers to create the typed name unless a project already has it', () => {
    expect(nameToCreate(projects, '  Search revamp ')).toBe('Search revamp');
    expect(nameToCreate(projects, 'checkout REVAMP')).toBeNull(); // the server compares names in any case
    expect(nameToCreate(projects, 'Checkout')).toBe('Checkout'); // only a part of a name: a new one is fine
    expect(nameToCreate(projects, '   ')).toBeNull();
  });

  it('keeps a new name within the 100 characters the server allows', () => {
    expect(nameToCreate([], `${'x'.repeat(99)} tail`)).toHaveLength(99);
  });
});
