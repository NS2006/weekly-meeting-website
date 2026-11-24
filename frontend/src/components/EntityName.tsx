import type { ReactNode } from 'react';

/**
 * A value inside a sentence — a person's or team's name, an email, typed search text — shown as a soft brand
 * highlight, so "Make Admin Test the leader?" reads as wording plus a name. React escapes the text as usual.
 */
export function EntityName({ children }: { children: ReactNode }) {
  return <span className="entity-name">{children}</span>;
}
