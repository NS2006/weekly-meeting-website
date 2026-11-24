import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WebsiteRole } from '@weekly-meeting/shared';
import { BlueAlert, BlueButton, BlueModal } from '../../components/blue';
import { ApiFailure } from '../../services/api';
import { errorLabel } from '../../utils/errorLabels';
import { useSetActiveRole } from './useAuth';
import './RolePicker.css';

const ROLE_ICON: Record<WebsiteRole, string> = {
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  admin: 'M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3Zm-3 9 2 2 4-4',
};

/** "Change role" dialog: one card per role the user holds; the main button names the role it switches to. */
export function RolePicker({
  open,
  roles,
  activeRole,
  onClose,
}: {
  open: boolean;
  roles: WebsiteRole[];
  activeRole: WebsiteRole;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const label = (role: WebsiteRole) => t(role === 'admin' ? 'roles.admin' : 'roles.user');
  const description = (role: WebsiteRole) => t(role === 'admin' ? 'roles.adminDescription' : 'roles.userDescription');
  const [selected, setSelected] = useState<WebsiteRole>(activeRole);
  const setActiveRole = useSetActiveRole();

  // Start from the current role each time the dialog opens.
  useEffect(() => {
    if (open) {
      setSelected(activeRole);
      setActiveRole.reset();
    }
    // Deliberately keyed on `open` only: re-running when activeRole changes would undo the user's pick.
  }, [open]);

  const unchanged = selected === activeRole;
  const busy = setActiveRole.isPending;

  function switchRole() {
    if (unchanged) return;
    setActiveRole.mutate(selected, { onSuccess: onClose });
  }

  const error = setActiveRole.error instanceof ApiFailure ? setActiveRole.error.code : null;

  return (
    <BlueModal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={t('roles.title')}
      footer={
        <>
          <BlueButton variant="ghost" onClick={onClose} disabled={busy}>
            {t('roles.cancel')}
          </BlueButton>
          <BlueButton variant="primary" loading={busy} disabled={unchanged} onClick={switchRole}>
            {unchanged ? t('roles.switch') : t('roles.switchTo', { role: label(selected) })}
          </BlueButton>
        </>
      }
    >
      <div className="stack">
        <p className="muted">{t('roles.lead')}</p>
        {error ? <BlueAlert variant="error">{errorLabel(error)}</BlueAlert> : null}
        <div className="role-picker" role="radiogroup" aria-label={t('roles.group')}>
          {roles.map((role) => (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={selected === role}
              className={`role-picker__card ${selected === role ? 'role-picker__card--selected' : ''}`}
              onClick={() => setSelected(role)}
            >
              <svg className="role-picker__icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d={ROLE_ICON[role]} />
              </svg>
              <span className="role-picker__label">{label(role)}</span>
              <span className="muted small">{description(role)}</span>
              {role === activeRole ? <span className="role-picker__current small">{t('roles.current')}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </BlueModal>
  );
}
