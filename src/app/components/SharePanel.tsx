/**
 * 分享结果。默认不放问题、完整解读和追问 —— 用户要放自己的问题必须主动勾选。
 * 系统分享用不了就退回下载；下载也不行时，至少给一段可以复制的短文字。
 */

import { useState } from 'react';
import { stickText, type FortuneStick } from '../../shared/sticks';
import type { Interpretation } from '../../shared/types';
import { useT } from '../i18n';
import { renderShareImage, shareImage, shareText } from '../share';
import type { Language } from '../../shared/lang';

export default function SharePanel(props: {
  stick: FortuneStick;
  /** 这一局的语言 —— 决定分享图上印哪一套字。 */
  language: Language;
  interpretation: Interpretation | null;
  question: string;
  onClose: () => void;
}) {
  const t = useT();
  const [includeQuestion, setIncludeQuestion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [fallbackText, setFallbackText] = useState('');

  const go = async () => {
    setBusy(true);
    setStatus('');
    setFallbackText('');
    try {
      const blob = await renderShareImage({
        stick: props.stick,
        interpretation: props.interpretation,
        question: props.question,
        includeQuestion,
        language: props.language,
      });
      const outcome = await shareImage(blob, props.stick, props.language);
      setStatus(outcome === 'shared' ? t('shareShared') : t('shareDownloaded'));
    } catch {
      setStatus(t('shareFailed'));
      setFallbackText(
        shareText(
          props.stick,
          props.interpretation?.meaning ?? stickText(props.stick, props.language).meaning,
          props.language,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="share-panel">
      <div className="share-head">
        <strong>{t('shareTitle')}</strong>
        <button type="button" className="text-action tiny" onClick={props.onClose}>
          {t('shareClose')}
        </button>
      </div>
      <p className="muted small">{t('shareNote')}</p>
      <label className="check">
        <input
          type="checkbox"
          checked={includeQuestion}
          onChange={(event) => setIncludeQuestion(event.target.checked)}
        />
        {t('shareIncludeQuestion')}
      </label>
      <button className="text-action strong" onClick={() => void go()} disabled={busy}>
        {busy ? t('shareBusy') : t('shareGo')}
      </button>
      {status && <p className="muted small">{status}</p>}
      {fallbackText && <textarea className="share-fallback" readOnly rows={3} value={fallbackText} />}
    </div>
  );
}
