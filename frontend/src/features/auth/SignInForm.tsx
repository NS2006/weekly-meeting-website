import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MockSignInRequest } from '@weekly-meeting/shared';
import { BlueButton, BlueInput } from '../../components/blue';

/** Email + name, no password: the mock stands in for Apps Gateway, so nobody types a real password here. */
export function SignInForm({ busy, onSubmit }: { busy: boolean; onSubmit: (identity: MockSignInRequest) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const ready = email.trim() !== '' && name.trim() !== '';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    onSubmit({ email: email.trim(), name: name.trim() });
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <BlueInput
        label={t('auth.email')}
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        placeholder={t('auth.emailPlaceholder')}
        maxLength={255}
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
      />
      <BlueInput
        label={t('auth.name')}
        type="text"
        name="name"
        autoComplete="name"
        placeholder={t('auth.namePlaceholder')}
        maxLength={255}
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
      />
      <BlueButton type="submit" variant="primary" fullWidth loading={busy} disabled={!ready}>
        {t('auth.submit')}
      </BlueButton>
    </form>
  );
}
