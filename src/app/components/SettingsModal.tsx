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

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

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
                <span className="settings-icon">🔔</span> {language === 'zh' ? '参拜音效' : 'Shrine Audio'}
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
                <span className="settings-icon">🌸</span> {language === 'zh' ? '落樱与微动' : 'Visual Motion'}
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
                {language === 'zh' ? '灵动' : 'Active'}
              </button>
              <button
                type="button"
                className={`segment-btn${prefs.reducedMotion ? ' active' : ''}`}
                onClick={() => updatePrefs({ reducedMotion: true })}
                aria-pressed={prefs.reducedMotion}
              >
                {language === 'zh' ? '宁静' : 'Calm'}
              </button>
            </div>
          </div>

          {/* 语言设定 */}
          <div className="settings-row">
            <div className="settings-label-wrap">
              <span className="settings-label">
                <span className="settings-icon">🌐</span> {language === 'zh' ? '界面语言' : 'Language'}
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
