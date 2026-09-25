import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { Prefs } from '../storage';
import { HTML_LANG, LANGUAGES, type Language } from '../../shared/lang';

/** 设置里那一排语言按钮上的字：每种语言用自己的文字写。 */
const SEGMENT_LABEL: Record<Language, string> = { zh: '中文', en: 'English', ja: '日本語', ko: '한국어' };
import { useT } from '../i18n';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** 頂欄的設定鈕。桌機上面板從它正下方掉出來，手機上不用（照樣從底部滑上來） */
  anchorRef?: RefObject<HTMLElement | null>;
  prefs: Prefs;
  updatePrefs: (patch: Partial<Prefs>) => void;
  language: Language;
}

export default function SettingsModal({
  open,
  onClose,
  anchorRef,
  prefs,
  updatePrefs,
  language,
}: SettingsModalProps) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // 量設定鈕的位置，交給 CSS 變數；只有桌機的樣式會用到。視窗改大小時跟著重量
  const [anchor, setAnchor] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = anchorRef?.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({
        '--anchor-top': `${Math.round(rect.bottom + 10)}px`,
        '--anchor-right': `${Math.round(window.innerWidth - rect.right)}px`,
        '--anchor-width': `${Math.round(rect.width)}px`,
      } as CSSProperties);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, anchorRef]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Move focus into the dialog, keep Tab inside it, and hand focus back to whatever opened it
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = dialogRef.current.querySelectorAll<HTMLElement>('button, a[href]');
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="settings-backdrop" onClick={onClose} aria-hidden={!open} style={anchor}>
      <div
        className="settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
      >
        <div className="settings-head">
          <div className="settings-title-group">
            <span className="settings-torii-icon" aria-hidden="true">⛩️</span>
            <h2 id="settings-title" className="settings-title">
              {t('shrineSettingsTitle')}
            </h2>
          </div>
          <button
            type="button"
            className="text-action settings-close"
            ref={closeRef}
            onClick={onClose}
            aria-label={t('settingsClose')}
          >
            ✕
          </button>
        </div>

        <div className="settings-body">
          {/* 声音效果 */}
          <div className="settings-row">
            <div className="settings-label-wrap">
              <span className="settings-label">
                <span className="settings-icon">🔔</span> {t('settingsSoundTitle')}
              </span>
              <span className="settings-desc">{t('settingsSoundDesc')}</span>
            </div>
            <div className="settings-segment">
              <button
                type="button"
                className={`segment-btn${prefs.sound ? ' active' : ''}`}
                onClick={() => updatePrefs({ sound: true })}
                aria-pressed={prefs.sound}
              >
                {t('footerSoundOn')}
              </button>
              <button
                type="button"
                className={`segment-btn${!prefs.sound ? ' active' : ''}`}
                onClick={() => updatePrefs({ sound: false })}
                aria-pressed={!prefs.sound}
              >
                {t('footerSoundOff')}
              </button>
            </div>
          </div>

          {/* 画面动效 */}
          <div className="settings-row">
            <div className="settings-label-wrap">
              <span className="settings-label">
                <span className="settings-icon">🌸</span> {t('settingsMotionTitle')}
              </span>
              <span className="settings-desc">{t('settingsMotionDesc')}</span>
            </div>
            <div className="settings-segment">
              <button
                type="button"
                className={`segment-btn${!prefs.reducedMotion ? ' active' : ''}`}
                onClick={() => updatePrefs({ reducedMotion: false })}
                aria-pressed={!prefs.reducedMotion}
              >
                {t('settingsMotionActive')}
              </button>
              <button
                type="button"
                className={`segment-btn${prefs.reducedMotion ? ' active' : ''}`}
                onClick={() => updatePrefs({ reducedMotion: true })}
                aria-pressed={prefs.reducedMotion}
              >
                {t('settingsMotionCalm')}
              </button>
            </div>
          </div>

          {/* 语言设定 */}
          <div className="settings-row lang-row">
            <div className="settings-label-wrap">
              <span className="settings-label">
                <span className="settings-icon">🌐</span> {t('settingsLanguageTitle')}
              </span>
            </div>
            <div className="settings-segment">
              {LANGUAGES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`segment-btn${language === option ? ' active' : ''}`}
                  onClick={() => updatePrefs({ language: option })}
                  aria-pressed={language === option}
                  lang={HTML_LANG[option]}
                  data-lang={option}
                >
                  {SEGMENT_LABEL[option]}
                </button>
              ))}
            </div>
          </div>

          {/* 隐私政策 & 开源信息 */}
          <div className="settings-links-card">
            <a
              href="#privacy"
              className="settings-link"
              onClick={onClose}
            >
              <span className="settings-link-left">
                <span className="settings-icon">🔒</span>
                <span>{t('privacyTitle')}</span>
              </span>
              <span className="settings-link-arrow">→</span>
            </a>

            <a
              href="https://github.com/manyfold-open/manyfold-fortune-stick"
              target="_blank"
              rel="noopener noreferrer"
              className="settings-link"
            >
              <span className="settings-link-left">
                <span className="settings-icon">🏷️</span>
                <span>Manyfold AI · GitHub</span>
              </span>
              <span className="settings-link-arrow">↗</span>
            </a>
          </div>

          {/* 神社签规小语 */}
          <div className="settings-motto-seal">
            <span className="motto-marks">「</span>
            <span className="motto-text">{t('footerNote')}</span>
            <span className="motto-marks">」</span>
          </div>
        </div>
      </div>
    </div>
  );
}
