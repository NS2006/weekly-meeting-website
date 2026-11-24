import { useEffect, useId, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TeamDetail } from '@weekly-meeting/shared';
import { BlueAlert, BlueButton, BlueModal } from '../../components/blue';
import { EntityName } from '../../components/EntityName';
import { ApiFailure } from '../../services/api';
import { errorLabel } from '../../utils/errorLabels';

/**
 * Delete = archive for 30 days. The leader must type the team's exact name, like GitHub's "delete this
 * repository"; the server compares it again.
 */
export function DeleteTeamDialog({
  open,
  team,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  team: TeamDetail;
  busy: boolean;
  error: unknown;
  onConfirm: (confirmName: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const inputId = useId();
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const matches = typed.trim() === team.name;
  const code = error instanceof ApiFailure ? error.code : error ? 'unknown_error' : null;

  return (
    <BlueModal
      open={open}
      size="sm"
      title={<Trans i18nKey="teams.delete.title" components={{ name: <EntityName>{team.name}</EntityName> }} />}
      onClose={busy ? () => undefined : onClose}
      footer={
        <BlueButton variant="danger" fullWidth loading={busy} disabled={!matches} onClick={() => onConfirm(typed)}>
          {t('teams.delete.submit')}
        </BlueButton>
      }
    >
      <div className="stack">
        {code ? <BlueAlert variant="error">{errorLabel(code)}</BlueAlert> : null}
        <p>
          <Trans i18nKey="teams.delete.body" count={team.memberCount} components={{ strong: <strong /> }} />
        </p>
        <div className="blue-input delete-confirm">
          <label className="blue-input__label" htmlFor={inputId}>
            <Trans i18nKey="teams.delete.typeToConfirm" components={{ name: <EntityName>{team.name}</EntityName> }} />
          </label>
          <input
            id={inputId}
            className="blue-input__field"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && matches && !busy) onConfirm(typed);
            }}
            disabled={busy}
          />
        </div>
      </div>
    </BlueModal>
  );
}
