import { useState } from 'react';
import { setStoredPassword } from '../api';
import { useT } from '../i18n';
import { clearLocalData } from '../storage';

export default function PrivacyView() {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);

  const clear = () => {
    clearLocalData();
    setStoredPassword('');
    setConfirming(false);
    setCleared(true);
  };

  return (
    <section className="panel privacy">
      <div className="privacy-card">
        <header className="privacy-head">
          <span className="privacy-badge">{t('privacyBadge')}</span>
          <h2>{t('privacyTitle')}</h2>
          <div className="privacy-divider" />
        </header>

        <p className="privacy-intro">{t('privacyIntro')}</p>

        <div className="privacy-section">
          <h3>{t('privacyStoredTitle')}</h3>
          <ul>
            <li>{t('privacyStoredRecords')}</li>
            <li>{t('privacyStoredPrefs')}</li>
            <li>{t('privacyStoredPassword')}</li>
          </ul>
        </div>

        <div className="privacy-section">
          <h3>{t('privacyServerTitle')}</h3>
          <ul>
            <li>{t('privacyServerReadings')}</li>
            <li>{t('privacyServerAgents')}</li>
            <li>{t('privacyServerRetention')}</li>
          </ul>
        </div>

        <div className="privacy-section">
          <h3>{t('privacyThirdPartyTitle')}</h3>
          <ul>
            <li>{t('privacyManyfold')}</li>
            <li>{t('privacyFonts')}</li>
            <li>{t('privacyCloudflare')}</li>
          </ul>
        </div>

        <div className="privacy-section">
          <h3>{t('privacyCookiesTitle')}</h3>
          <p>{t('privacyCookies')}</p>
          <p>{t('privacyAnalytics')}</p>
        </div>

        <div className="privacy-section">
          <h3>{t('privacySharingTitle')}</h3>
          <p>{t('privacySharing')}</p>
        </div>

        <div className="privacy-section">
          <h3>{t('privacyControlsTitle')}</h3>
          <p>{t('privacyControls')}</p>
          <div className="privacy-controls-action">
            {!confirming ? (
              <button type="button" className="text-action danger" onClick={() => setConfirming(true)}>
                {t('privacyClearButton')}
              </button>
            ) : (
              <span className="row">
                <button type="button" className="text-action danger" onClick={clear}>
                  {t('privacyClearConfirm')}
                </button>
                <button type="button" className="text-action" onClick={() => setConfirming(false)}>
                  {t('privacyClearCancel')}
                </button>
              </span>
            )}
            {cleared && <p className="notice">{t('privacyCleared')}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
