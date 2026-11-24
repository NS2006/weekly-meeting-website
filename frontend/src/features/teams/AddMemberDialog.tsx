import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { PersonResult, TeamDetail } from '@weekly-meeting/shared';
import { BlueAlert, BlueAvatar, BlueButton, BlueInput, BlueModal, BlueSkeleton, BlueSpinner } from '../../components/blue';
import { EntityName } from '../../components/EntityName';
import { ApiFailure } from '../../services/api';
import { errorLabel } from '../../utils/errorLabels';
import { useAddMember, useMemberSuggestions, usePeopleSearch } from './useTeams';
import './teams.css';

type AddMember = ReturnType<typeof useAddMember>;

/**
 * Add active people straight to the team (no invitation). Before typing, a few random people who are not in the team
 * yet are suggested; from 2 letters on, it searches everyone by name or email.
 */
export function AddMemberDialog({ open, team, onClose }: { open: boolean; team: TeamDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const people = usePeopleSearch(query);
  const addMember = useAddMember(team.id);
  const memberIds = new Set(team.members.map((m) => m.userId));

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 300);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (open) {
      setText('');
      setQuery('');
      addMember.reset();
    }
    // Keyed on `open` only: start empty each time the dialog opens.
  }, [open]);

  const code = addMember.error instanceof ApiFailure ? addMember.error.code : addMember.error ? 'unknown_error' : null;
  const results = people.data?.users ?? [];
  const searching = query.trim().length >= 2;

  return (
    <BlueModal
      open={open}
      title={<Trans i18nKey="teams.add.title" components={{ name: <EntityName>{team.name}</EntityName> }} />}
      onClose={onClose}
      footer={
        <BlueButton variant="primary" onClick={onClose}>
          {t('teams.add.done')}
        </BlueButton>
      }
    >
      <div className="stack">
        <BlueInput
          label={t('teams.add.search')}
          type="search"
          placeholder={t('teams.add.searchPlaceholder')}
          maxLength={100}
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {code ? <BlueAlert variant="error">{errorLabel(code)}</BlueAlert> : null}
        {!searching ? (
          // Mounted only while open and not searching: each opening fetches a new pick (see useMemberSuggestions).
          open ? <SuggestedPeople teamId={team.id} memberIds={memberIds} addMember={addMember} /> : null
        ) : people.isPending ? (
          <BlueSpinner />
        ) : results.length === 0 ? (
          <p className="muted">
            <Trans i18nKey="teams.add.noMatch" components={{ query: <EntityName>{query.trim()}</EntityName> }} />
          </p>
        ) : (
          <ul className="people-list" aria-label={t('teams.add.found')}>
            {results.map((person) => (
              <PersonRow key={person.id} person={person} inTeam={memberIds.has(person.id)} addMember={addMember} />
            ))}
          </ul>
        )}
      </div>
    </BlueModal>
  );
}

/** A few random active people not in the team yet, with "Show others" for a new pick. */
function SuggestedPeople({ teamId, memberIds, addMember }: { teamId: string; memberIds: Set<string>; addMember: AddMember }) {
  const { t } = useTranslation();
  const suggestions = useMemberSuggestions(teamId);
  const people = suggestions.data?.users ?? [];
  const failed = suggestions.error instanceof ApiFailure ? suggestions.error.code : suggestions.error ? 'unknown_error' : null;

  return (
    <section className="people-suggestions" aria-labelledby="people-suggestions-title">
      <div className="people-suggestions__head">
        <span id="people-suggestions-title" className="people-suggestions__title">
          {t('teams.add.suggested')}
        </span>
        {people.length > 0 ? (
          <button
            type="button"
            className="link-button small"
            disabled={suggestions.isFetching}
            onClick={() => void suggestions.refetch()}
          >
            {suggestions.isFetching ? t('teams.add.loading') : t('teams.add.showOthers')}
          </button>
        ) : null}
      </div>
      {suggestions.isPending ? (
        <ul className="people-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="people-list__item">
              <BlueSkeleton width={32} height={32} />
              <span className="people-list__who">
                <BlueSkeleton width="40%" height={14} />
                <BlueSkeleton width="60%" height={12} />
              </span>
            </li>
          ))}
        </ul>
      ) : failed ? (
        <BlueAlert variant="error">{errorLabel(failed)}</BlueAlert>
      ) : people.length === 0 ? (
        <p className="muted">{t('teams.add.everyoneIn')}</p>
      ) : (
        <ul className={`people-list ${suggestions.isFetching ? 'is-refreshing' : ''}`.trim()} aria-label={t('teams.add.suggested')}>
          {people.map((person) => (
            <PersonRow key={person.id} person={person} inTeam={memberIds.has(person.id)} addMember={addMember} />
          ))}
        </ul>
      )}
      <p className="muted small">{t('teams.add.orType')}</p>
    </section>
  );
}

/** One person with "Add", or "In the team" once added (the row stays, so the list doesn't jump). */
function PersonRow({ person, inTeam, addMember }: { person: PersonResult; inTeam: boolean; addMember: AddMember }) {
  const { t } = useTranslation();
  const adding = addMember.isPending && addMember.variables === person.id;
  return (
    <li className="people-list__item">
      <BlueAvatar name={person.name} size="sm" />
      <span className="people-list__who">
        <span className="people-list__name">{person.name}</span>
        <span className="muted small people-list__email">{person.email}</span>
      </span>
      {inTeam ? (
        <span className="muted small">{t('teams.add.inTeam')}</span>
      ) : (
        <BlueButton
          variant="secondary"
          size="sm"
          loading={adding}
          disabled={addMember.isPending && !adding}
          onClick={() => addMember.mutate(person.id)}
        >
          {t('teams.add.add')}
        </BlueButton>
      )}
    </li>
  );
}
