import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminUser } from '@weekly-meeting/shared';
import { BlueButton, BlueModal } from '../../components/blue';
import { EntityName } from '../../components/EntityName';
import { currentLanguage, type Language } from '../../i18n/language';
import { messages } from '../../i18n/messages';
import type { UserChange } from './useUsers';

/** "Activate <name/>?" with the highlighted name in place of the tag; the name itself stays as typed. */
function withName(template: string, name: ReactNode): ReactNode {
  const [before = '', after = ''] = template.split('<name/>');
  return (
    <>
      {before}
      {name}
      {after}
    </>
  );
}

/** What a change does, in words (in `language`). Activating needs no confirmation; everything else does. */
export function describeChange(
  user: AdminUser,
  change: UserChange,
  language: Language = currentLanguage(),
): { title: ReactNode; body: string; action: string; done: ReactNode; danger: boolean } {
  const words = messages(language).users.confirm;
  const name = <EntityName>{user.name}</EntityName>;
  if (change.kind === 'status') {
    return change.status === 'active'
      ? {
          title: withName(words.activateTitle, name),
          body: '',
          action: words.activate,
          done: withName(words.activated, name),
          danger: false,
        }
      : {
          title: withName(words.deactivateTitle, name),
          body: words.deactivateBody,
          action: words.deactivate,
          done: withName(words.deactivated, name),
          danger: true,
        };
  }
  return change.admin
    ? {
        title: withName(words.makeAdminTitle, name),
        body: words.makeAdminBody,
        action: words.makeAdmin,
        done: withName(words.madeAdmin, name),
        danger: false,
      }
    : {
        title: withName(words.removeAdminTitle, name),
        body: words.removeAdminBody,
        action: words.removeAdmin,
        done: withName(words.removedAdmin, name),
        danger: true,
      };
}

export function needsConfirmation(change: UserChange): boolean {
  return !(change.kind === 'status' && change.status === 'active');
}

export function ConfirmChange({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: { user: AdminUser; change: UserChange } | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // useTranslation re-renders the dialog when the language changes; describeChange reads the same language.
  const { t } = useTranslation();
  const text = pending ? describeChange(pending.user, pending.change) : null;
  return (
    <BlueModal
      open={pending !== null}
      // While saving, Escape and outside clicks do nothing: the change is already on its way.
      onClose={busy ? () => undefined : onCancel}
      size="sm"
      title={text?.title ?? ''}
      footer={
        <>
          <BlueButton variant="ghost" onClick={onCancel} disabled={busy}>
            {t('users.confirm.cancel')}
          </BlueButton>
          <BlueButton variant={text?.danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>
            {text?.action ?? t('users.confirm.confirm')}
          </BlueButton>
        </>
      }
    >
      <p>{text?.body}</p>
    </BlueModal>
  );
}
