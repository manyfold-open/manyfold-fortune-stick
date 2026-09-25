/**
 * 设置页，只通过 #settings 这个 URL 进入，主界面上没有入口 —— 它给部署这个游戏的人用，
 * 不是玩家流程的一部分。
 *
 * 这里管理解签用的 Manyfold agent：看状态、重跑（免费的）鉴权探测、断开、再连。
 * 重新授权一个已经连着的 agent 会就地换掉它的 token，不会多出一条。
 */

import { useState } from 'react';
import type { ConnectedAgent, ConnectSession } from '../../shared/types';
import { withoutDashes } from '../../shared/text';
import { api, errorMessage } from '../api';
import { useT } from '../i18n';
import ConnectPanel from './ConnectPanel';
import StatsPanel from './StatsPanel';

export default function SettingsView(props: {
  agents: ConnectedAgent[];
  initialSession: ConnectSession | null;
  refreshState: () => Promise<void>;
}) {
  const t = useT();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const verify = async (agentId: string) => {
    setBusyId(agentId);
    setError('');
    try {
      await api(`/api/agents/${encodeURIComponent(agentId)}/verify`, { method: 'POST' });
      await props.refreshState();
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setBusyId(null);
    }
  };

  const disconnect = async (agentId: string) => {
    setBusyId(agentId);
    setError('');
    try {
      await api(`/api/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
      setConfirmId(null);
      await props.refreshState();
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="panel">
      <h2>{t('settingsTitle')}</h2>
      <p className="muted small">{t('settingsUrlOnly')}</p>

      <h3>{t('settingsAgentsTitle')}</h3>
      {props.agents.length === 0 && <p className="muted">{t('settingsNoAgents')}</p>}
      {props.agents.length > 1 && <p className="muted small">{t('settingsMultiNote')}</p>}

      <div className="agent-list">
        {props.agents.map((agent) => (
          <div className="agent-card" key={agent.agentId}>
            <div className="agent-card-main">
              <div className="agent-card-title">
                <strong>{withoutDashes(agent.name)}</strong>
                {agent.verified ? (
                  <span className="badge ok">{t('settingsVerified')}</span>
                ) : (
                  <span className="badge warn" title={agent.warning ?? undefined}>
                    {t('settingsUnverified')}
                  </span>
                )}
              </div>
              {agent.description && <p className="muted">{withoutDashes(agent.description)}</p>}
              <p className="muted small">
                {t('settingsConnectedAt', {
                  host: new URL(agent.rpcUrl).host,
                  time: new Date(agent.connectedAt).toLocaleString(),
                })}
                {agent.expiresAt
                  ? t('settingsExpiresAt', { time: new Date(agent.expiresAt).toLocaleString() })
                  : ''}
              </p>
              {agent.warning && <p className="warn small">⚠ {withoutDashes(agent.warning)}</p>}
            </div>
            <div className="agent-card-actions">
              <button
                className="text-action"
                onClick={() => void verify(agent.agentId)}
                disabled={busyId === agent.agentId}
              >
                {busyId === agent.agentId ? t('settingsChecking') : t('settingsReverify')}
              </button>
              {confirmId === agent.agentId ? (
                <span className="row">
                  <button
                    className="text-action danger"
                    onClick={() => void disconnect(agent.agentId)}
                    disabled={busyId === agent.agentId}
                  >
                    {t('settingsDisconnectConfirm')}
                  </button>
                  <button className="text-action" onClick={() => setConfirmId(null)}>
                    {t('settingsKeep')}
                  </button>
                </span>
              ) : (
                <button className="text-action danger" onClick={() => setConfirmId(agent.agentId)}>
                  {t('settingsDisconnect')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <div className="notice error">{error}</div>}

      <h3>{t('settingsMoreTitle')}</h3>
      <p className="muted">{t('settingsMoreNote')}</p>
      <ConnectPanel initialSession={props.initialSession} onConnected={props.refreshState} />

      <h3>{t('statsTitle')}</h3>
      <StatsPanel />

      <h3>{t('settingsAboutTitle')}</h3>
      <p className="muted">{t('settingsAboutBody')}</p>
    </section>
  );
}
