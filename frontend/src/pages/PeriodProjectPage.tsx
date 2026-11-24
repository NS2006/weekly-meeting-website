import type { Me } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { useRef } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { BackToTop } from '../components/BackToTop';
import { BlueButton, BlueCard, BlueEmptyState, BlueSkeleton } from '../components/blue';
import { usePeriod } from '../features/periods/usePeriods';
import { PeriodProjectView } from '../features/team-projects/PeriodProjectView';
import { boardPath, projectPath, readTrail } from '../features/team-projects/projectTrail';
import { usePeriodProjects } from '../features/team-projects/useTeamProjects';
import { AppLayout } from '../layouts/AppLayout';
import { ApiFailure } from '../services/api';
import { errorLabel } from '../utils/errorLabels';
import '../features/teams/teams.css';
import '../features/meetings/meetings.css';

/**
 * A teammate's project in one period, opened from the period's Projects board (owner, 2026-11-24: a full page like
 * the Projects page, not a panel). Its back link returns to the board with its filters and on its card; previous and
 * next step through the cards of the column it was opened from, without adding to the browser's history. "Back to
 * top" shows once a long project is scrolled down (owner, 2026-11-24).
 */
export function PeriodProjectPage({ user }: { user: Me }) {
  const { t } = useTranslation();
  const { id = '', key = '', projectId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const period = usePeriod(id, key);
  const board = usePeriodProjects(id, key);
  const trail = readTrail(location.state, id, key);
  const error = period.error ?? board.error;
  const code = error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null;
  const data = period.data?.period;
  const projects = board.data?.projects ?? [];
  const project = projects.find((p) => p.id === projectId) ?? null;

  // The column's cards still on the board (one may have been taken off since).
  const sequence = trail ? trail.sequence.filter((pid) => projects.some((p) => p.id === pid)) : [];
  const at = sequence.indexOf(projectId);
  const step = (to: string | undefined) => to && void navigate(projectPath(id, key, to), { replace: true, state: location.state });
  const name = (pid: string | undefined) => projects.find((p) => p.id === pid)?.name ?? '';
  const previous = at > 0 ? sequence[at - 1] : undefined;
  const next = at >= 0 ? sequence[at + 1] : undefined;
  const top = useRef<HTMLDivElement>(null);

  return (
    <AppLayout user={user}>
      <div className="meeting-topbar board-page__top" ref={top} tabIndex={-1}>
        <Link to={trail?.from ?? boardPath(id, key)} state={{ focusCard: projectId }} className="back-link">
          <span className="back-link__arrow" aria-hidden="true">
            ←
          </span>
          {data ? t('teams.projects.backToBoard', { label: data.label }) : t('periods.page.team')}
        </Link>
        {trail && at >= 0 && sequence.length > 1 ? (
          <div className="board-page__steps" role="group" aria-label={trail.column}>
            <BlueButton
              variant="secondary"
              size="sm"
              disabled={!previous}
              aria-label={previous ? `${t('teams.projects.previous')}: ${name(previous)}` : t('teams.projects.previous')}
              onClick={() => step(previous)}
            >
              ←<span className="meeting-switcher__word"> {t('teams.projects.previous')}</span>
            </BlueButton>
            <span className="small muted board-page__position">
              {t('teams.projects.position', { at: at + 1, total: sequence.length, column: trail.column })}
            </span>
            <BlueButton
              variant="secondary"
              size="sm"
              disabled={!next}
              aria-label={next ? `${t('teams.projects.next')}: ${name(next)}` : t('teams.projects.next')}
              onClick={() => step(next)}
            >
              <span className="meeting-switcher__word">{t('teams.projects.next')} </span>→
            </BlueButton>
          </div>
        ) : null}
      </div>
      {period.isPending || board.isPending ? (
        <div className="stack" role="status">
          <span className="visually-hidden">{t('teams.projects.loadingProject')}</span>
          <div className="project-head" aria-hidden="true">
            <BlueSkeleton width={56} height={56} />
            <div className="project-head__text">
              <BlueSkeleton width={240} height={26} />
              <BlueSkeleton width={180} height={14} />
            </div>
          </div>
        </div>
      ) : data && project ? (
        <PeriodProjectView key={project.id} period={data} project={project} projects={projects} />
      ) : (
        <BlueCard>
          <BlueEmptyState
            title={code && code !== 'not_found' ? t('teams.projects.loadFailed') : t('teams.projects.notFound', { label: data?.label ?? key })}
          >
            {code && code !== 'not_found' ? errorLabel(code) : t('teams.projects.notFoundBody', { label: data?.label ?? key })}
          </BlueEmptyState>
        </BlueCard>
      )}
      <BackToTop focusTarget={top} />
    </AppLayout>
  );
}
