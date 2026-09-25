import { useState } from 'react';
import { measuring, setConsent, storedConsent, type Consent } from '../analytics';
import { setStoredPassword } from '../api';
import { useT } from '../i18n';
import { clearLocalData } from '../storage';

export default function PrivacyView(props: {
  /** /api/state 的 consentRequired：沒答過的人，統計一開始是開是關就看它。null 當作要先問。 */
  consentRequired: boolean | null;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  // 這一頁有沒有 Google 標籤，決定下面那一節照哪一份寫：沒設 GA_MEASUREMENT_ID 的部署一個字都不提它
  const analytics = measuring();
  const [chosen, setChosen] = useState<Consent | null>(storedConsent);
  const consent: Consent = chosen ?? (props.consentRequired === false ? 'granted' : 'denied');
  const choose = (choice: Consent) => {
    setConsent(choice);
    setChosen(choice);
  };

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
            <li>{t('privacyTarotBridge')}</li>
            <li>{t('privacyFonts')}</li>
            <li>{t('privacyCloudflare')}</li>
          </ul>
        </div>

        <div className="privacy-section">
          <h3>{t('privacyCookiesTitle')}</h3>
          {analytics ? (
            <>
              <p>{t('privacyCookiesGoogle')}</p>
              <p>{t('privacyAnalyticsGoogle')}</p>
              <p>{t('privacyOwnCounts')}</p>
              <div className="privacy-consent">
                <p>{t(consent === 'granted' ? 'privacyConsentOn' : 'privacyConsentOff')}</p>
                <span className="row">
                  <button
                    type="button"
                    className="text-action"
                    aria-pressed={consent === 'granted'}
                    onClick={() => choose('granted')}
                  >
                    {t('privacyConsentAllow')}
                  </button>
                  <button
                    type="button"
                    className="text-action"
                    aria-pressed={consent === 'denied'}
                    onClick={() => choose('denied')}
                  >
                    {t('privacyConsentRefuse')}
                  </button>
                </span>
              </div>
            </>
          ) : (
            <>
              <p>{t('privacyCookies')}</p>
              <p>{t('privacyAnalytics')}</p>
            </>
          )}
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
