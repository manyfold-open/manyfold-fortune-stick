/**
 * 外壳：加载一次 /api/state，用 location.hash 在三个页面之间切换（没有 router 依赖），
 * 并在部署设了密码而本浏览器还没给出时升起密码门。
 *
 * 外壳自己几乎不占地方 —— 一行牌记、一行页脚，中间全是机器和纸。宽屏上两侧再立
 * 两条竖排的铭牌，把版面撑开，免得所有东西挤在中间一小条里（窄屏不显示）。
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
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-chips" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="brand-name">问一签</span>
          <span className="brand-sub">{t('brandSub')}</span>
        </a>
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

      <span className="rail rail-left" aria-hidden>
        {t('railLeft')}
      </span>
      <span className="rail rail-right" aria-hidden>
        {t('railRight')}
      </span>

      <footer className="footer">
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
        <span className="footer-note">{t('footerNote')}</span>
      </footer>

      {gateOpen && <PasswordGate onSubmitted={refreshState} />}
    </main>
  );
}
