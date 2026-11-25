import type { PeriodDetail, PeriodProject, TeamProjectUpdate } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BlueAlert, BlueAvatar, BlueBadge, BlueEmptyState, BlueSkeleton } from '../../components/blue';
import { NotesIcon } from '../../components/icons';
import { LoadOlder } from '../../components/LoadOlder';
import { ApiFailure } from '../../services/api';
import { formatDay, todayWib } from '../../utils/dates';
import { errorLabel } from '../../utils/errorLabels';
import { meetingName } from '../meetings/meetingName';
import { groupByMonth } from '../notes/months';
import { NoteContentView } from '../notes/NoteContentView';
import { UpdateOrderSwitch, useUpdateOrder } from '../notes/UpdateOrder';
import { ProjectMonogram } from '../projects/ProjectCard';
import { timelineOf } from './boardModel';
import { usePeriodProjectUpdates } from './useTeamProjects';
import '../notes/notes.css';
import '../projects/projects.css';
import './teamProjects.css';

/** The latest of the period's meetings an update is on: where it was last shared. */
const lastMeetingDay = (update: TeamProjectUpdate) => update.meetings[update.meetings.length - 1]?.date ?? update.noteCreatedAt.slice(0, 10);

/**
 * A teammate's project in one period, on its own page like the Projects page's (owner, 2026-11-24): whose it is, the
 * period's meetings it was shared on, then every part of a note shared on them, latest first (or earliest first with
 * `UpdateOrderSwitch`, owner 2026-11-25), by month, read-only.
 * Each part names its note and the meetings it is on; a meeting opens the note on that meeting's board.
 */
export function PeriodProjectView({ period, project, projects }: { period: PeriodDetail; project: PeriodProject; projects: PeriodProject[] }) {
  const { t } = useTranslation();
  const [order, setOrder] = useUpdateOrder();
  const updates = usePeriodProjectUpdates(period.teamId, period.key, project.id, order);
  const list = updates.data?.pages.flatMap((page) => page.updates) ?? [];
  const archived = project.status === 'archived';
  const timeline = timelineOf(period.meetings, projects, todayWib());
  const shared = new Set(project.meetingIds);
  const code = updates.error instanceof ApiFailure ? updates.error.code : 'unknown_error';

  return (
    <div className="stack">
      <div className="project-head">
        <ProjectMonogram name={project.name} archived={archived} size="lg" />
        <div className="project-head__text">
          <h1 className="page-head__title">{project.name}</h1>
          <span className="project-head__meta muted small board-page__meta">
            <span className="team-project__owner">
              <BlueAvatar name={project.owner.name} size="sm" />
              <span>{t('teams.projects.by', { name: project.owner.name })}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>{t('teams.projects.updatesIn', { count: project.updateCount, label: period.label })}</span>
            <span aria-hidden="true">·</span>
            <span>{t('teams.projects.lastShared', { date: formatDay(project.lastSharedOn) })}</span>
            {archived ? <BlueBadge>{t('teams.projects.archived')}</BlueBadge> : null}
          </span>
        </div>
      </div>

      {timeline.length > 0 ? (
        <div className="board-page__timeline">
          <p className="small muted">
            {t('teams.projects.sharedIn', { count: timeline.filter((m) => shared.has(m.id)).length, total: timeline.length })}
          </p>
          <ol className="board-page__weeks">
            {timeline.map((m) => (
              <li key={m.id} className={`board-week${shared.has(m.id) ? ' board-week--on' : ''}`} title={`${meetingName(m)} · ${formatDay(m.date)}`}>
                <span className="board-dot" aria-hidden="true" />
                <span>{formatDay(m.date)}</span>
                {shared.has(m.id) ? <span className="visually-hidden">✓</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <section className="tile notes-panel" aria-labelledby="period-project-updates">
        <div className="notes-panel__head">
          <h2 id="period-project-updates" className="notes-panel__title">
            {t('teams.projects.updatesTitle')} <span className="notes-panel__count">{project.updateCount}</span>
          </h2>
          {project.updateCount > 1 ? <UpdateOrderSwitch order={order} onChange={setOrder} /> : null}
        </div>
        <p className="muted small board-page__only">{t('teams.projects.onlyShared', { label: period.label })}</p>

        {updates.isPending ? (
          <div className="update-list" role="status" aria-label={t('teams.projects.loadingUpdates')}>
            {[0, 1].map((i) => (
              <div key={i} className="update" aria-hidden="true">
                <BlueSkeleton width="35%" height={14} />
                <BlueSkeleton width="90%" height={14} />
                <BlueSkeleton width="70%" height={14} />
              </div>
            ))}
          </div>
        ) : updates.isError && !updates.data ? (
          <BlueAlert variant="error">{errorLabel(code)}</BlueAlert>
        ) : list.length === 0 ? (
          <BlueEmptyState icon={<NotesIcon size={26} />} title={t('teams.projects.none', { label: period.label })}>
            {t('teams.projects.noneBody', { label: period.label })}
          </BlueEmptyState>
        ) : (
          <div className="note-timeline">
            {groupByMonth(list, (u) => `${lastMeetingDay(u)}T00:00:00+07:00`).map((group) => (
              <section key={group.key} aria-label={group.label}>
                <h3 className="note-timeline__month">{group.label}</h3>
                <ol className="update-list">
                  {group.items.map((update) => (
                    <li key={`${update.noteId}:${update.position}`} className="update">
                      <div className="update__head">
                        <span className="update__note team-project__note">{update.noteTitle || t('notes.untitled')}</span>
                        <span className="team-project__meetings">
                          <span className="muted small">{t('teams.projects.sharedOn')}</span>
                          {update.meetings.map((m) => (
                            <span key={m.id} className="meeting-chip">
                              <Link to={`/meetings/${m.id}?note=${update.noteId}`} className="meeting-chip__link" title={t('teams.projects.openOnBoard')}>
                                {meetingName(m)} · {formatDay(m.date)}
                              </Link>
                            </span>
                          ))}
                        </span>
                      </div>
                      <NoteContentView doc={update.content} />
                    </li>
                  ))}
                </ol>
              </section>
            ))}
            <LoadOlder
              hasMore={updates.hasNextPage}
              loading={updates.isFetchingNextPage}
              failed={updates.isFetchNextPageError}
              errorText={errorLabel(code)}
              label={t(order === 'oldest' ? 'teams.projects.showNewer' : 'teams.projects.showOlder')}
              onMore={() => updates.fetchNextPage()}
            />
          </div>
        )}
      </section>
    </div>
  );
}
