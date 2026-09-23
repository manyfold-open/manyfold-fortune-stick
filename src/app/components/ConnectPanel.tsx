/**
 * Device-code handshake against Manyfold: we open their consent page in a popup
 * and poll our own worker, which holds the device code. Tokens are minted on
 * Manyfold's side at poll time and land encrypted in D1 — they never reach the
 * browser, so nothing here ever holds a credential.
 *
 * The userCode is displayed prominently on purpose: comparing it against the code
 * on Manyfold's page is the flow's only anti-phishing check.
 */

import { useEffect, useRef, useState } from 'react';
import type { ConnectSession, PollOutcome } from '../../shared/types';
import { withoutDashes } from '../../shared/text';
import { api, errorMessage } from '../api';
import { useT } from '../i18n';

export default function ConnectPanel(props: {
  /** In-flight handshake recovered from /api/state, so a reload resumes it. */
  initialSession: ConnectSession | null;
  onConnected: () => Promise<void>;
}) {
  const t = useT();
  const [session, setSession] = useState<ConnectSession | null>(props.initialSession);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PollOutcome | null>(null);
  const popup = useRef<Window | null>(null);

  const openConsent = (url: string) => {
    popup.current = window.open(url, 'manyfold-connect', 'width=520,height=760,noopener,noreferrer');
    if (!popup.current) {
      setError(t('connectPopupBlocked'));
    }
  };

  const start = async () => {
    setStarting(true);
    setError('');
    setResult(null);
    try {
      const started = await api<{ connect: ConnectSession }>('/api/connect', { method: 'POST' });
      setSession(started.connect);
      openConsent(started.connect.authUrl);
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    const current = session;
    setSession(null);
    popup.current?.close();
    if (current) {
      await api(`/api/connect/${encodeURIComponent(current.connectId)}`, { method: 'DELETE' }).catch(
        () => undefined,
      );
    }
  };

  // Polls while a session is live. Manyfold's session TTL is ~15 minutes; the
  // interval stops on any terminal status so an abandoned popup goes quiet.
  useEffect(() => {
    if (!session) return;
    let stopped = false;
    const tick = async () => {
      try {
        const poll = await api<PollOutcome>(
          `/api/connect/${encodeURIComponent(session.connectId)}/poll`,
          { method: 'POST' },
        );
        if (stopped || poll.status === 'pending') return;
        setResult(poll);
        setSession(null);
        popup.current?.close();
        if (poll.status === 'approved') await props.onConnected();
      } catch (cause) {
        if (stopped) return;
        setError(errorMessage(cause, t));
        setSession(null);
      }
    };
    const timer = setInterval(() => void tick(), 2_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [session, props.onConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="connect-panel">
      {!session && (
        <button className="text-action strong" onClick={() => void start()} disabled={starting}>
          {starting ? t('connectOpening') : t('connectStart')}
        </button>
      )}

      {session && (
        <div className="connect-waiting">
          <div className="connect-code">
            <small>{t('connectCodeLabel')}</small>
            <strong>{session.userCode}</strong>
          </div>
          <p className="muted">{t('connectCodeNote')}</p>
          <p className="muted">{t('connectWaiting')}</p>
          <div className="row">
            <button className="text-action" onClick={() => openConsent(session.authUrl)}>
              {t('connectReopen')}
            </button>
            <button className="text-action danger" onClick={() => void cancel()}>
              {t('connectCancel')}
            </button>
          </div>
        </div>
      )}

      {!session && !result && (
        <p className="muted">{t('connectIntro')}</p>
      )}

      {result?.status === 'denied' && (
        <div className="notice error">{t('connectDenied')}</div>
      )}
      {result?.status === 'expired' && (
        <div className="notice error">{t('connectExpired')}</div>
      )}
      {result?.status === 'approved' && (
        <div className="connect-result">
          <strong>
            {result.agents?.length
              ? t('connectedCount', { count: result.agents.length })
              : t('connectedNone')}
          </strong>
          {(result.agents ?? []).map((agent) => (
            <div className="connect-result-row" key={agent.agentId}>
              <span>✓ {withoutDashes(agent.name)}</span>
              {!agent.verified && (
                <em className="warn">
                  {t('settingsUnverified')}
                  {agent.warning ? `, ${withoutDashes(agent.warning)}` : ''}
                </em>
              )}
            </div>
          ))}
          {(result.failed ?? []).map((entry) => (
            <div className="connect-result-row failed" key={entry.name}>
              <span>✗ {entry.name}</span>
              <em className="warn">{withoutDashes(entry.error)}</em>
            </div>
          ))}
        </div>
      )}

      {error && <div className="notice error">{error}</div>}
    </div>
  );
}
