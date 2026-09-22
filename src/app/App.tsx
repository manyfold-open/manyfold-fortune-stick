/**
 * 外壳：加载一次 /api/state，用 location.hash 在三个页面之间切换（没有 router 依赖），
 * 并在部署设了密码而本浏览器还没给出时升起密码门。
 *
 * 外壳自己几乎不占地方 —— 一行牌记、一行页脚，中间全是机器和纸。两侧曾经立过
 * 两条竖排的装饰铭牌，撤掉了：它们把视线往外拉，而这一屏要看的只有中间那台机器。
 *
 * 设置页只留 URL 入口（#settings），主界面上不放按钮 —— 它是部署者用的，
 * 不是玩家流程的一部分。
 *
 * 语言分两层，别混：右上角的开关换的是**界面**（这一层），签纸和解读的语言由
 * 问题本身决定、印出来就定死（src/shared/lang.ts）。Shell 负责把界面语言
 * 供给下面所有组件，除此之外不碰任何一张已经印好的签。
 */

import { useCallback, useEffect, useState } from 'react';
import type { AppState } from '../shared/types';
import { api, onUnauthorized } from './api';
import AmbientMotes from './components/AmbientMotes';
import FortuneGame from './components/FortuneGame';
import HistoryView from './components/HistoryView';
import PasswordGate from './components/PasswordGate';
import SettingsView from './components/SettingsView';
import { LanguageProvider, useT, useUiLanguage } from './i18n';
import { getPrefs, setPrefs, type Prefs } from './storage';

type Route = 'game' | 'history' | 'settings';

const routeFromHash = (): Route => {
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash === 'settings') return 'settings';
  if (hash === 'history') return 'history';
  return 'game';
};

export default function App() {
  const [prefs, setPrefsState] = useState<Prefs>(() => getPrefs());

  const updatePrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefsState(next);
    setPrefs(next);
  };

  // Shell 在 provider 里面，这样它自己也能用 useT —— 全站只有一条取文案的路径。
  return (
    <LanguageProvider language={prefs.language}>
      <Shell prefs={prefs} updatePrefs={updatePrefs} />
    </LanguageProvider>
  );
}

function Shell(props: { prefs: Prefs; updatePrefs: (patch: Partial<Prefs>) => void }) {
  const { prefs, updatePrefs } = props;
  const t = useT();
  const language = useUiLanguage();
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [gateOpen, setGateOpen] = useState(false);

  const refreshState = useCallback(async () => {
    try {
      const next = await api<AppState>('/api/state');
      setState(next);
      setLoadError('');
      setGateOpen(next.adminRequired && !next.adminOk);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    onUnauthorized(() => setGateOpen(true));
    void refreshState();
    return () => onUnauthorized(null);
  }, [refreshState]);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 滑鼠與觸控動態燈光視差：在桌面模擬真實頭頂燈的微小光影流轉
  useEffect(() => {
    if (prefs.reducedMotion) return;
    const onPointerMove = (e: PointerEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const nx = Math.max(0, Math.min(1, e.clientX / w));
      const ny = Math.max(0, Math.min(1, e.clientY / h));
      const lampX = 43 + (nx - 0.5) * 14;
      const lampY = 28 + (ny - 0.5) * 10;
      const foilPos = Math.round(15 + nx * 70);
      document.documentElement.style.setProperty('--lamp-x', `${lampX.toFixed(2)}%`);
      document.documentElement.style.setProperty('--lamp-y', `${lampY.toFixed(2)}%`);
      document.documentElement.style.setProperty('--lamp-foil', `${foilPos}%`);
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.style.removeProperty('--lamp-x');
      document.documentElement.style.removeProperty('--lamp-y');
      document.documentElement.style.removeProperty('--lamp-foil');
    };
  }, [prefs.reducedMotion]);

  // <html lang> 决定读屏软件怎么念这一页，所以它得跟着界面语言走，不能钉死在 zh-CN。
  // 标题和描述同理 —— 标签页上显示的是当前这个人看得懂的那个名字。
  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title = t('documentTitle');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', t('documentDescription'));
  }, [language, t]);

  if (loadError) {
    return (
      <main className="shell">
        <p className="stage-loading">
          {t('loadFailed', { detail: loadError })}{' '}
          <button type="button" className="text-action" onClick={() => void refreshState()}>
            {t('retry')}
          </button>
        </p>
      </main>
    );
  }
  if (!state) {
    return (
      <main className="shell">
        <p className="stage-loading">{t('loading')}</p>
      </main>
    );
  }

  return (
    <main className={`shell${prefs.reducedMotion ? ' calm' : ''}`}>
      <AmbientMotes reducedMotion={prefs.reducedMotion} />
      <header className="topbar">
        <span className="topbar-actions">
          {/* 只换界面。已经印出来的签一个字都不会动。 */}
          <button
            type="button"
            className="text-action lang-switch"
            aria-label={t('langSwitchLabel')}
            onClick={() => updatePrefs({ language: language === 'zh' ? 'en' : 'zh' })}
          >
            {t('langSwitch')}
          </button>
          <a className="text-action" href={route === 'game' ? '#history' : '#/'}>
            {route === 'game' ? t('navHistory') : t('navBackToGame')}
          </a>
        </span>
      </header>

      {route === 'settings' && (
        <SettingsView
          agents={state.agents}
          initialSession={state.connect.session}
          refreshState={refreshState}
        />
      )}
      {route === 'history' && <HistoryView />}
      {route === 'game' && (
        <FortuneGame prefs={prefs} interpreterReady={state.interpreterReady} />
      )}

      <footer className="footer">
        <div className="footer-prefs">
          <button
            type="button"
            className="text-action tiny"
            aria-pressed={prefs.sound}
            onClick={() => updatePrefs({ sound: !prefs.sound })}
          >
            {t('footerSound', { state: prefs.sound ? t('footerSoundOn') : t('footerSoundOff') })}
          </button>
          <button
            type="button"
            className="text-action tiny"
            aria-pressed={prefs.reducedMotion}
            onClick={() => updatePrefs({ reducedMotion: !prefs.reducedMotion })}
          >
            {t('footerMotion', {
              state: prefs.reducedMotion ? t('footerMotionReduced') : t('footerMotionNormal'),
            })}
          </button>
        </div>

        <div className="footer-credits">
          <a
            href="https://manyfold.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-credit-link"
          >
            <span>powered by</span>
            <svg
              className="manyfold-logo"
              viewBox="8 14 116 68"
              aria-hidden="true"
              focusable="false"
            >
              <polygon points="10,80 35,15 47.5,15 22.5,80" fill="currentColor" opacity="0.95" />
              <polygon points="35,15 60,80 47.5,15 72.5,80" fill="currentColor" opacity="0.5" />
              <polygon points="60,80 85,15 72.5,80 97.5,15" fill="currentColor" opacity="0.95" />
              <polygon points="85,15 110,80 97.5,15 122.5,80" fill="currentColor" opacity="0.5" />
            </svg>
            <span className="manyfold-word">Manyfold</span>
          </a>
          <a
            href="https://github.com/manyfold-open/manyfold-fortune-stick"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-credit-link"
          >
            Open source · fork it on GitHub
          </a>
        </div>

        <span className="footer-note">{t('footerNote')}</span>
      </footer>

      {gateOpen && <PasswordGate onSubmitted={refreshState} />}
    </main>
  );
}
