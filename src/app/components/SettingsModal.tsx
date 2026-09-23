import { useEffect, useRef } from 'react';
import type { Prefs } from '../storage';
import type { Language } from '../../shared/lang';
import { useT } from '../i18n';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  prefs: Prefs;
  updatePrefs: (patch: Partial<Prefs>) => void;
  language: Language;
}

export default function SettingsModal({
  open,
  onClose,
  prefs,
  updatePrefs,
  language,
}: SettingsModalProps) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

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
    <div className="settings-backdrop" onClick={onClose} aria-hidden={!open}>
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
          <div className="settings-row">
            <div className="settings-label-wrap">
              <span className="settings-label">
                <span className="settings-icon">🌐</span> {t('settingsLanguageTitle')}
              </span>
            </div>
            <div className="settings-segment">
              <button
                type="button"
                className={`segment-btn${language === 'zh' ? ' active' : ''}`}
                onClick={() => updatePrefs({ language: 'zh' })}
                aria-pressed={language === 'zh'}
              >
                中文
              </button>
              <button
                type="button"
                className={`segment-btn${language === 'en' ? ' active' : ''}`}
                onClick={() => updatePrefs({ language: 'en' })}
                aria-pressed={language === 'en'}
              >
                English
              </button>
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
