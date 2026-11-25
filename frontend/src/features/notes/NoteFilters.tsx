import { useTranslation } from 'react-i18next';
import { BlueInput, BlueSelect } from '../../components/blue';
import { SearchField } from '../../components/SearchField';
import { fromSharedChoice, sharedChoice, type NoteListFilters } from './listFilters';
import { ProjectFilter } from './ProjectFilter';
import { SharedFilter } from './SharedFilter';

type Patch = Partial<Record<keyof NoteListFilters, string>>;

/**
 * The Notes page's filters, all run on the server and all in view (owner, 2026-11-25: no "More filters"): words,
 * project and where it is shared (searchable pickers: ProjectFilter, SharedFilter), the days it was written and the
 * order. `onChange` gets only what changed (an empty string clears it).
 */
export function NoteFilters({ value, onChange }: { value: NoteListFilters; onChange: (patch: Patch) => void }) {
  const { t } = useTranslation();

  return (
    <div className="filter-bar note-filters" role="search" aria-label={t('notes.filters.label')}>
      <SearchField
        className="filter-bar__search"
        label={t('notes.overview.search')}
        placeholder={t('notes.overview.searchPlaceholder')}
        value={value.q}
        onCommit={(q) => onChange({ q })}
      />
      <ProjectFilter value={value.project} onChange={(project) => onChange({ project })} />
      <SharedFilter value={sharedChoice(value)} onChange={(choice) => onChange(fromSharedChoice(choice))} />
      <BlueInput
        type="date"
        label={t('notes.filters.from')}
        value={value.from}
        max={value.to || undefined}
        onChange={(event) => onChange({ from: event.target.value })}
      />
      <BlueInput
        type="date"
        label={t('notes.filters.to')}
        value={value.to}
        min={value.from || undefined}
        onChange={(event) => onChange({ to: event.target.value })}
      />
      <BlueSelect
        label={t('notes.filters.sort')}
        value={value.sort}
        onChange={(sort) => onChange({ sort: sort === 'newest' ? '' : sort })}
        options={[
          { value: 'newest', label: t('notes.filters.newest') },
          { value: 'oldest', label: t('notes.filters.oldest') },
          { value: 'edited', label: t('notes.filters.edited') },
        ]}
      />
    </div>
  );
}
