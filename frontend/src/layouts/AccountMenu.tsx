import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Me } from '@weekly-meeting/shared';
import { BlueAvatar } from '../components/blue';
import { useDismiss } from '../hooks/useDismiss';

/**
 * The signed-in person as one button (avatar, name, and "Admin" while in the admin view) that opens a short menu:
 * who is signed in, Change role (only for people with two roles), Sign out. Keeps the header to one row; the language
 * switch sits beside it (LanguageSwitch).
 */
export function AccountMenu({
  user,
  signingOut,
  onChangeRole,
  onSignOut,
}: {
  user: Me;
  signingOut: boolean;
  onChangeRole: () => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);
  const admin = user.activeRole === 'admin';

  // Opening moves the focus into the menu; Escape (useDismiss) brings it back to the button.
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') button.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const pick = (action: () => void) => () => {
    setOpen(false);
    button.current?.focus();
    action();
  };

  return (
    <div className="account" ref={box}>
      <button
        ref={button}
        type="button"
        className="account__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(admin ? 'account.buttonAdmin' : 'account.button', { name: user.name })}
        onClick={() => setOpen((value) => !value)}
      >
        <BlueAvatar name={user.name} size="sm" />
        <span className="account__name">{user.name}</span>
        {admin ? <span className="account__role">{t('account.admin')}</span> : null}
        <svg className="account__chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="account__menu" role="menu" aria-label={t('account.menu')} ref={menu}>
          <div className="account__who">
            <span className="account__who-name">{user.name}</span>
            <span className="account__who-email">{user.email}</span>
            {user.roles.length > 1 ? (
              <span className="account__who-role">{t('account.workingAs', { role: t(admin ? 'roles.admin' : 'roles.user') })}</span>
            ) : null}
          </div>
          {user.roles.length > 1 ? (
            <button type="button" role="menuitem" className="account__item" onClick={pick(onChangeRole)}>
              {t('account.changeRole')}
            </button>
          ) : null}
          <button type="button" role="menuitem" className="account__item" disabled={signingOut} onClick={pick(onSignOut)}>
            {signingOut ? t('account.signingOut') : t('account.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
