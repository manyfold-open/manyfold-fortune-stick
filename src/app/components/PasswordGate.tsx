/**
 * Shown on /settings when the deployment has ADMIN_PASSWORD set and this browser
 * has not provided it (or provided a wrong one). The password lives in
 * sessionStorage — gone when the tab closes, never in a cookie, never in a URL.
 */

import { useState } from 'react';
import { setStoredPassword } from '../api';
import { useT } from '../i18n';

export default function PasswordGate(props: { onSubmitted: () => Promise<void> }) {
  const t = useT();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setStoredPassword(value.trim());
    await props.onSubmitted();
    setSubmitting(false);
    setTouched(true);
  };

  return (
    <div className="overlay">
      <form className="dialog" onSubmit={(event) => void submit(event)}>
        <h2>{t('gateTitle')}</h2>
        <p className="muted">{t('gateBody')}</p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('gateLabel')}
          aria-label={t('gateLabel')}
        />
        {touched && <div className="notice error">{t('gateWrong')}</div>}
        <button className="text-action strong" type="submit" disabled={submitting || !value.trim()}>
          {submitting ? t('gateChecking') : t('gateSubmit')}
        </button>
      </form>
    </div>
  );
}
