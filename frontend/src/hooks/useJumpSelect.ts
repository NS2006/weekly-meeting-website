import { useRef, useState, type KeyboardEvent } from 'react';

/** Keys that move a closed list's choice on Windows (and typing a letter, which jumps to an option). */
const STEPS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

/**
 * A list that takes you somewhere when you pick from it (the meeting and quarter switchers, the reader's "Go to").
 * With the mouse, or Enter in the open list, a pick goes at once. But on Windows the arrow keys change a closed list's
 * choice one step at a time, firing a change on every press: going there would leave the page on the first press
 * (WCAG 3.2.2). So a change made by stepping only moves the choice; Enter goes, and leaving the list puts it back.
 * Such a change fires during the key press itself, so a press counts as stepping only until it is handled: a list it
 * opens (Alt+↓ or Space on Windows, the arrows on a Mac) then goes on a pick as usual. Spread the result on a BlueSelect.
 */
export function useJumpSelect<V extends string>(current: V, go: (value: V) => void) {
  const [draft, setDraft] = useState<V | null>(null);
  const stepping = useRef(false);

  const choose = (value: V) => {
    setDraft(null);
    if (value !== current) go(value);
  };

  return {
    value: draft ?? current,
    onChange: (value: V) => {
      if (stepping.current) setDraft(value);
      else choose(value);
    },
    onKeyDown: (event: KeyboardEvent<HTMLSelectElement>) => {
      stepping.current = STEPS.has(event.key) || event.key.length === 1;
      // The open list takes the key's release, so it is not waited for.
      if (stepping.current) window.setTimeout(() => (stepping.current = false));
      if (event.key === 'Enter' && draft !== null) {
        event.preventDefault();
        choose(draft);
      }
    },
    onKeyUp: () => {
      stepping.current = false;
    },
    // The list opens on where you are, so picking the option you had stepped to still counts as a change.
    onPointerDown: () => {
      stepping.current = false;
      setDraft(null);
    },
    onBlur: () => {
      stepping.current = false;
      setDraft(null);
    },
  };
}
