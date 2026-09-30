/**
 * Where agent failures go, on #settings. A failed interpretation still hands
 * the visitor the stick's own text on a 200, and a failed 追问 is an error
 * inside a stream that already answered 200, so without this the deployer only
 * hears about it from the visitor. See src/worker/alerts.ts.
 *
 * The webhook URL goes in and never comes back out: the Worker seals it and
 * only ever reports whether one is set.
 */

import { useEffect, useState } from 'react';
import type { AlertsView } from '../../shared/types';
import { withoutDashes } from '../../shared/text';
import { api, errorMessage } from '../api';
import { useT } from '../i18n';

export default function AlertsPanel() {
  const t = useT();
  const [view, setView] = useState<AlertsView | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void run(async () => setView(await api<AlertsView>('/api/alerts')));
  }, []);

  const save = () =>
    run(async () => {
      const result = await api<{ delivered: boolean; alerts: AlertsView }>('/api/alerts/discord', {
        method: 'PUT',
        body: JSON.stringify({ url: url.trim() }),
      });
      setView(result.alerts);
      setUrl('');
      setNote(result.delivered ? t('alertsSaved') : t('alertsSavedUndelivered'));
    });

  const remove = () =>
    run(async () => {
      const result = await api<{ alerts: AlertsView }>('/api/alerts/discord', { method: 'DELETE' });
      setView(result.alerts);
    });

  const kindLabel = (kind: string) =>
    kind === 'interpret' ? t('alertsKindInterpret') : kind === 'follow-up' ? t('alertsKindFollowUp') : kind;

  return (
    <div className="alerts-panel">
      <p className="muted">{t('alertsNote')}</p>

      {view && (
        <p className="small">
          {view.discord.configured ? (
            <span className="badge ok">{t('alertsConnected')}</span>
          ) : (
            <span className="badge warn">{t('alertsNoWebhook')}</span>
          )}{' '}
          {view.failing && view.failingSince ? (
            <span className="warn">
              ⚠ {t('alertsFailingSince', { time: new Date(view.failingSince).toLocaleString() })}
            </span>
          ) : (
            <span className="muted">{t('alertsHealthy')}</span>
          )}
        </p>
      )}

      <form
        className="alerts-webhook row"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <input
          type="password"
          autoComplete="off"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={view?.discord.configured ? t('alertsReplace') : 'https://discord.com/api/webhooks/…'}
          aria-label={t('alertsInputLabel')}
        />
        <button className="text-action strong" type="submit" disabled={busy || !url.trim()}>
          {busy ? t('alertsSaving') : t('alertsSave')}
        </button>
        {view?.discord.configured && (
          <button className="text-action danger" type="button" onClick={() => void remove()} disabled={busy}>
            {t('alertsRemove')}
          </button>
        )}
      </form>

      {note && <div className="notice">{note}</div>}
      {error && <div className="notice error">{error}</div>}

      {view && view.failures.length > 0 && (
        <>
          <p className="muted small">{t('alertsRecent')}</p>
          <ul className="alerts-list small">
            {view.failures.map((failure, index) => (
              <li key={`${failure.at}-${index}`}>
                <span className="muted">{new Date(failure.at).toLocaleString()}</span> · {kindLabel(failure.kind)} ·{' '}
                <code>{withoutDashes(failure.reason)}</code>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
