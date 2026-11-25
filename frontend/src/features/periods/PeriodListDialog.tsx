import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PeriodSummary } from '@weekly-meeting/shared';
import { BlueModal } from '../../components/blue';
import { Paged } from '../../components/Paged';
import { PeriodCard } from './PeriodParts';
import { capitalize, PAST_PERIODS_PER_PAGE, periodGroups } from './split';

/**
 * Every period of a team, from the team page's "Show all" (owner, 2026-11-25: with years of periods the current one
 * ended up at the bottom of a long list). Three parts: the current one, the next one when it starts within the next
 * four weeks, and the past ones newest first, a page at a time.
 */
export function PeriodListDialog({
  teamId,
  periods,
  nouns,
  today,
  onClose,
}: {
  teamId: string;
  periods: readonly PeriodSummary[];
  /** "quarters", "months": the team's word for its periods. */
  nouns: string;
  today: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { current, upcoming, past } = periodGroups(periods, today);
  const [requested, setPage] = useState(1);
  const page = Math.min(requested, Math.max(1, Math.ceil(past.length / PAST_PERIODS_PER_PAGE)));
  const shownPast = past.slice((page - 1) * PAST_PERIODS_PER_PAGE, page * PAST_PERIODS_PER_PAGE);

  return (
    <BlueModal open onClose={onClose} title={capitalize(t('periods.all.title', { nouns }))}>
      <div className="stack period-list">
        {/* Side by side on a wide screen: one card each. */}
        <div className="period-list__now">
          {current ? <PeriodGroup title={t('periods.all.current')} periods={[current]} teamId={teamId} today={today} /> : null}
          {upcoming.length > 0 ? <PeriodGroup title={t('periods.all.upcoming')} periods={upcoming} teamId={teamId} today={today} /> : null}
        </div>
        {past.length > 0 ? (
          <PeriodGroup title={t('periods.all.past', { count: past.length })} teamId={teamId} today={today}>
            <Paged
              current={page}
              total={past.length}
              pageSize={PAST_PERIODS_PER_PAGE}
              label={t('periods.all.pages', { nouns })}
              onChange={setPage}
              below={false}
            >
              <PeriodCards periods={shownPast} teamId={teamId} today={today} />
            </Paged>
          </PeriodGroup>
        ) : null}
      </div>
    </BlueModal>
  );
}

function PeriodGroup({
  title,
  periods,
  teamId,
  today,
  children,
}: {
  title: string;
  periods?: readonly PeriodSummary[];
  teamId: string;
  today: string;
  children?: ReactNode;
}) {
  const headingId = useId();
  return (
    <section className="period-list__group" aria-labelledby={headingId}>
      <h3 id={headingId} className="period-list__heading">
        {title}
      </h3>
      {children ?? <PeriodCards periods={periods ?? []} teamId={teamId} today={today} />}
    </section>
  );
}

function PeriodCards({ periods, teamId, today }: { periods: readonly PeriodSummary[]; teamId: string; today: string }) {
  return (
    <ol className="period-grid">
      {periods.map((period) => (
        <li key={period.key}>
          <PeriodCard teamId={teamId} period={period} today={today} />
        </li>
      ))}
    </ol>
  );
}
