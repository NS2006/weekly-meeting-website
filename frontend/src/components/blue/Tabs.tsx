import type { KeyboardEvent, ReactNode } from 'react';

// BLUE3 BTabs → BlueTabs (no plugin template yet). `line` for page sections, `segmented` for a small switch inside
// a card. Keyboard: arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern). The page renders the panel
// with tabPanelProps() so the tab and its panel point at each other.
export interface BlueTabItem<T extends string> {
  id: T;
  label: ReactNode;
}

export interface BlueTabsProps<T extends string> {
  tabs: readonly BlueTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Names the tab list for screen readers. */
  label: string;
  /** Unique on the page; ties tabs to panels. */
  idPrefix: string;
  variant?: 'line' | 'segmented';
}

const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

export function tabPanelProps(idPrefix: string, id: string) {
  return { role: 'tabpanel', id: panelId(idPrefix, id), 'aria-labelledby': tabId(idPrefix, id), tabIndex: 0 } as const;
}

export function BlueTabs<T extends string>({ tabs, value, onChange, label, idPrefix, variant = 'line' }: BlueTabsProps<T>) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    document.getElementById(tabId(idPrefix, tab.id))?.focus();
  }

  return (
    <div className={`blue-tabs blue-tabs--${variant}`} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(idPrefix, tab.id)}
            aria-selected={selected}
            aria-controls={panelId(idPrefix, tab.id)}
            tabIndex={selected ? 0 : -1}
            className={`blue-tabs__tab${selected ? ' blue-tabs__tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
