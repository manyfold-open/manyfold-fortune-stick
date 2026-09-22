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
      <h2>{t('privacyTitle')}</h2>
      <p className="muted">{t('privacyIntro')}</p>

      <h3>{t('privacyStoredTitle')}</h3>
      <ul>
        <li>{t('privacyStoredRecords')}</li>
        <li>{t('privacyStoredPrefs')}</li>
        <li>{t('privacyStoredPassword')}</li>
      </ul>

      <h3>{t('privacyServerTitle')}</h3>
      <ul>
        <li>{t('privacyServerReadings')}</li>
        <li>{t('privacyServerAgents')}</li>
        <li>{t('privacyServerRetention')}</li>
      </ul>

      <h3>{t('privacyThirdPartyTitle')}</h3>
      <ul>
        <li>{t('privacyManyfold')}</li>
        <li>{t('privacyFonts')}</li>
        <li>{t('privacyCloudflare')}</li>
      </ul>

      <h3>{t('privacyCookiesTitle')}</h3>
      <p className="muted">{t('privacyCookies')}</p>
      <p className="muted">{t('privacyAnalytics')}</p>

      <h3>{t('privacySharingTitle')}</h3>
      <p className="muted">{t('privacySharing')}</p>

      <h3>{t('privacyControlsTitle')}</h3>
      <p className="muted">{t('privacyControls')}</p>
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
    </section>
  );
}
