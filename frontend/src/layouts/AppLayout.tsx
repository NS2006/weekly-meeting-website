import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Me } from '@weekly-meeting/shared';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';
import { BrandMark } from '../components/BrandMark';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { RolePicker } from '../features/auth/RolePicker';
import { useSignOut } from '../features/auth/useAuth';
import { useWaitingUsers } from '../features/users/useUsers';
import { AccountMenu } from './AccountMenu';
import './AppLayout.css';

/** Header (brand, the pages, the account menu) around a signed-in, active user's pages. */
export function AppLayout({ user, children }: { user: Me; children: ReactNode }) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const signOut = useSignOut();
  const header = useRef<HTMLElement>(null);
  // An admin sees on the Users link how many people wait for access, on every page (owner, 2026-11-24).
  const waiting = useWaitingUsers(user.activeRole === 'admin');
  const waitingCount = user.activeRole === 'admin' ? (waiting.data?.users.length ?? 0) : 0;

  // The header's height as --app-header-height, so things that stick below it (the note toolbar) sit right under
  // it, also when it wraps to two lines on a phone.
  useEffect(() => {
    const element = header.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() =>
      document.documentElement.style.setProperty('--app-header-height', `${element.offsetHeight}px`),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app">
      <header className="app__header" ref={header}>
        <div className="app__left">
          <Link to="/" className="app__brand" aria-label={t('nav.brand')}>
            <BrandMark />
          </Link>
          <nav className="app__nav" aria-label={t('nav.main')}>
            <NavLink to="/" end className="app__link">
              {t('nav.home')}
            </NavLink>
            {/* Each role has its own pages: Admin manages people, User works in teams. */}
            {user.activeRole === 'admin' ? (
              <NavLink to="/users" className="app__link">
                {t('nav.users')}
                {waitingCount > 0 ? (
                  <span className="app__count">
                    {waitingCount}
                    <span className="visually-hidden">{t('nav.waiting')}</span>
                  </span>
                ) : null}
              </NavLink>
            ) : (
              <>
                <NavLink to="/notes" className="app__link">
                  {t('nav.notes')}
                </NavLink>
                <NavLink to="/projects" className="app__link">
                  {t('nav.projects')}
                </NavLink>
                <NavLink to="/teams" className="app__link">
                  {t('nav.teams')}
                </NavLink>
              </>
            )}
          </nav>
        </div>
        <div className="app__right">
          <LanguageSwitch />
          <AccountMenu
            user={user}
            signingOut={signOut.isPending}
            onChangeRole={() => setPickerOpen(true)}
            onSignOut={() => signOut.mutate()}
          />
        </div>
      </header>
      <main className="app__main">{children}</main>
      <RolePicker open={pickerOpen} roles={user.roles} activeRole={user.activeRole} onClose={() => setPickerOpen(false)} />
    </div>
  );
}
