/**
 * 外壳：加载一次 /api/state，用 location.hash 在三个页面之间切换（没有 router 依赖）。
 * 游戏页公开可玩；密码门只在部署者打开设置页时出现。
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

import { lazy, Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import type { AppState } from '../shared/types';
import { api, onUnauthorized } from './api';
import FortuneGame from './components/FortuneGame';
import PasswordGate from './components/PasswordGate';
import SettingsModal from './components/SettingsModal';
import SharedStickView from './components/SharedStickView';
import { parseSharedStick } from '../shared/share-link';
import ShrineBackdrop from './components/ShrineBackdrop';
import { LanguageProvider, useT, useUiLanguage } from './i18n';
import { getPrefs, setCurrentReadingId, setPrefs, type Prefs } from './storage';
import { installAudioUnlock } from './sound';
import { appUrl, BASE } from './base';

type Route = 'game' | 'history' | 'settings' | 'privacy';

/**
 * 回到求籤頁。#history、#privacy 這種 hash 頁只清 hash，不整頁重載；
 * /privacy、/settings 是真的路徑（頁腳就連到 /privacy），只清 hash 會留在原頁，
 * 那就照 href 正常導回挂载点。
 */
const goToGame = (event: MouseEvent<HTMLAnchorElement>) => {
  if (location.pathname.replace(/\/+$/, '') !== BASE) return;
  event.preventDefault();
  if (location.hash) location.hash = '';
};

const routeFromHash = (): Route => {
  const hash = location.hash.replace(/^#\/?/, '');
  const pathname = location.pathname.slice(BASE.length).replace(/\/+$/, '') || '/';
  if (pathname === '/privacy' || hash === 'privacy') return 'privacy';
  if (pathname === '/settings' || hash === 'settings') return 'settings';
  if (hash === 'history') return 'history';
  return 'game';
};

// 首屏只要籤筒：記錄、隱私、部署設定這三頁用到才下載，打開遊戲時少抓一截程式
const HistoryView = lazy(() => import('./components/HistoryView'));
const PrivacyView = lazy(() => import('./components/PrivacyView'));
const SettingsView = lazy(() => import('./components/SettingsView'));

export default function App() {
  const [prefs, setPrefsState] = useState<Prefs>(() => getPrefs());

  // 手機上的聲音要在「放手」那一下叫醒（sound.ts 的 installAudioUnlock）。開關用 ref 讀，
  // 切換聲音時不用重掛監聽
  const soundOn = useRef(prefs.sound);
  soundOn.current = prefs.sound;
  useEffect(() => installAudioUnlock(() => soundOn.current), []);

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsTriggerRef = useRef<HTMLButtonElement | null>(null);
  /**
   * 左上角 logo 在求籤頁上被點了幾次。求籤頁的網址本來就沒有 #，goToGame 清不了什麼，
   * 以前就是點了毫無反應；現在交給 FortuneGame：看著結果時回到空白繪馬（跟「再求一籤」一樣）。
   */
  const [homeTaps, setHomeTaps] = useState(0);
  /** 朋友分享來的那一支（?s=13&l=en）。有它，求籤頁先給人看那張籤紙，底下一行「求一支自己的」。 */
  const [shared, setShared] = useState(() => parseSharedStick(location.search));
  /** 看完朋友那支，去求自己的：網址上的 ?s= 拿掉（重新整理不會又回來），換成求籤頁 */
  const leaveShared = () => {
    const url = new URL(location.href);
    url.searchParams.delete('s');
    url.searchParams.delete('l');
    history.replaceState(history.state, '', url.toString());
    setShared(null);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    if (shared) {
      event.preventDefault();
      leaveShared();
      if (location.hash) location.hash = '';
      return;
    }
    if (route === 'game' && location.pathname.replace(/\/+$/, '') === BASE) {
      event.preventDefault();
      setHomeTaps((n) => n + 1);
      return;
    }
    startFresh(event);
  };
  /**
   * 從記錄、隱私頁回求籤頁（logo 或「Draw a stick」）：跟在求籤頁點 logo 一樣是一局新的 ——
   * 以前會回到上一支籤的結果，按鈕寫著「求一支」卻打開舊的那張。舊的那支還在記錄裡。
   */
  const startFresh = (event: MouseEvent<HTMLAnchorElement>) => {
    setCurrentReadingId(null);
    goToGame(event);
  };

  const refreshState = useCallback(async () => {
    try {
      const next = await api<AppState>('/api/state');
      setState(next);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      if (route === 'settings') setGateOpen(true);
    });
    void refreshState();
    return () => onUnauthorized(null);
  }, [refreshState, route]);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 切換路由時回到頁頂
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  useEffect(() => {
    setGateOpen(route === 'settings' && Boolean(state?.adminRequired && !state.adminOk));
  }, [route, state]);

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

  // <html lang> 决定读屏软件怎么念这一页，所以它得跟着界面语言走，不能钉死在一种语言上。
  // 标题和描述同理 —— 标签页上显示的是当前这个人看得懂的那个名字。
  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en-GB' : 'zh-CN';
    document.title = t('documentTitle');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', t('documentDescription'));
  }, [language, t]);

  /* /api/state 只管兩件事：解籤的 agent 接上了沒有、設定頁的密碼。寫問題、抽籤都用不到它，
     所以不再整頁擋著等它（以前一打開是一整頁「Preparing the shrine…」）。
     還沒回來是 null（先不預解籤）；拿不到就當沒接上，籤照樣能抽，解籤那一步再說清楚。
     只有設定頁真的要它，載入中和失敗重試都留在設定頁自己那塊。 */
  const interpreterReady = state ? state.interpreterReady : loadError ? false : null;
  const settingsPending =
    route === 'settings' && !state ? (
      loadError ? (
        <p className="stage-loading">
          {t('loadFailed', { detail: loadError })}{' '}
          <button type="button" className="text-action" onClick={() => void refreshState()}>
            {t('retry')}
          </button>
        </p>
      ) : (
        <p className="loading-line" role="status">
          {t('loading')}
        </p>
      )
    ) : null;

  return (
    <main className={`shell${prefs.reducedMotion ? ' calm' : ''}`}>
      {/* 神社（鳥居、注連繩、落櫻花瓣）貫穿整個御神籤體驗，任何頁面皆沉浸如初 */}
      <ShrineBackdrop calm={prefs.reducedMotion} />
      <header className="topbar">
        <a
          className="brand"
          href={appUrl('/')}
          onClick={goHome}
          aria-label={t('brandTitle')}
        >
          <span className="brand-torii" aria-hidden="true">⛩️</span>
          <span className="brand-title">{t('brandTitle')}</span>
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
          <a
            className="text-action history-link"
            href={route === 'game' ? '#history' : appUrl('/')}
            onClick={route === 'game' ? undefined : startFresh}
          >
            <span className="history-link-label">{route === 'game' ? t('navHistory') : t('navBackToGame')}</span>
          </a>
          <button
            type="button"
            className="text-action settings-trigger"
            ref={settingsTriggerRef}
            aria-label={t('navSettings')}
            onClick={() => setSettingsOpen(true)}
          >
            <span className="settings-trigger-icon" aria-hidden="true">⚙️</span>
            <span className="settings-trigger-label">{t('navSettings')}</span>
          </button>
        </span>
      </header>

      <Suspense fallback={null}>
        {settingsPending}
        {route === 'settings' && state?.adminOk && (
        <SettingsView
          agents={state.agents}
          initialSession={state.connect.session}
          refreshState={refreshState}
        />
      )}
      {route === 'history' && <HistoryView />}
      {route === 'privacy' && <PrivacyView />}
      </Suspense>
      {route === 'game' && shared && <SharedStickView shared={shared} onDrawOwn={leaveShared} />}
      {route === 'game' && !shared && (
        <FortuneGame prefs={prefs} interpreterReady={interpreterReady} homeTaps={homeTaps} />
      )}

      <footer className="footer">
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

        <a className="footer-credit-link footer-privacy" href={appUrl('/privacy')}>
          {t('privacyNav')}
        </a>
      </footer>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        anchorRef={settingsTriggerRef}
        prefs={prefs}
        updatePrefs={updatePrefs}
        language={language}
      />

      {gateOpen && <PasswordGate onSubmitted={refreshState} />}
    </main>
  );
}
