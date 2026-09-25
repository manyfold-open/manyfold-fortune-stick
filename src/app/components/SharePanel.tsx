/**
 * 分享结果。默认不放问题、完整解读和追问 —— 用户要放自己的问题必须主动勾选。
 * 系统分享用不了就退回下载；下载也不行时，至少给一段可以复制的短文字。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { stickText, type FortuneStick } from '../../shared/sticks';
import type { Interpretation } from '../../shared/types';
import { useT } from '../i18n';
import { renderShareImage, shareImage, shareText, type ShareOutcome } from '../share';
import { recordShare } from '../visit';
import { track } from '../analytics';
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
  const [story, setStory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [fallbackText, setFallbackText] = useState('');
  const sharingRef = useRef(false);

  /*
   * 面板一打开（和每次改选项）就在背景把图画好。iOS 只在点击后很短的时间内准叫出分享面板：
   * 以前按下才开始画（等字体、画二维码、画 1080 宽的图），画完再叫就被拒，手机上分享等于永远失败。
   * 现在按下时图已经在手上，直接叫。
   */
  const key = `${includeQuestion ? 'q' : '-'}${story ? 's' : 'p'}`;
  const ready = useRef<{ key: string; blob: Blob } | null>(null);
  const pending = useRef<{ key: string; promise: Promise<Blob> } | null>(null);
  const { stick, interpretation, question, language } = props;
  const render = useCallback(
    (withQuestion: boolean, asStory: boolean, forKey: string): Promise<Blob> => {
      if (pending.current?.key === forKey) return pending.current.promise;
      const promise = renderShareImage({
        stick,
        interpretation,
        question,
        includeQuestion: withQuestion,
        language,
        format: asStory ? 'story' : 'post',
      });
      pending.current = { key: forKey, promise };
      void promise
        .then((blob) => {
          if (pending.current?.key === forKey) ready.current = { key: forKey, blob };
        })
        .catch(() => undefined);
      return promise;
    },
    [stick, interpretation, question, language],
  );
  useEffect(() => {
    void render(includeQuestion, story, key).catch(() => undefined);
  }, [render, includeQuestion, story, key]);

  const fail = () => {
    setStatus(t('shareFailed'));
    setFallbackText(shareText(stick, interpretation?.meaning ?? stickText(stick, language).meaning, language));
  };

  const go = () => {
    if (sharingRef.current) return;
    setStatus('');
    setFallbackText('');
    const done = (outcome: ShareOutcome) => {
      // Closing the share sheet is not a share: say nothing and count nothing.
      if (outcome === 'cancelled') return;
      recordShare(outcome === 'shared' ? 'sent' : 'downloaded');
      track('reading_shared', { method: outcome === 'shared' ? 'share' : 'download' });
      setStatus(outcome === 'shared' ? t('shareShared') : t('shareDownloaded'));
    };
    // 图好了：在这一下点击里直接叫分享，前面不能有任何 await
    if (ready.current?.key === key) {
      sharingRef.current = true;
      void shareImage(ready.current.blob, stick, language)
        .then(done, fail)
        .finally(() => {
          sharingRef.current = false;
        });
      return;
    }
    // 还没画完（刚打开就点）：等它画完再分享。iOS 可能已经不准叫面板了，那就退回下载或复制文字
    sharingRef.current = true;
    setBusy(true);
    void render(includeQuestion, story, key)
      .then((blob) => shareImage(blob, stick, language))
      .then(done, fail)
      .finally(() => {
        sharingRef.current = false;
        setBusy(false);
      });
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
      <label className="check">
        <input type="checkbox" checked={story} onChange={(event) => setStory(event.target.checked)} />
        {t('shareStory')}
      </label>
      <button className="text-action strong" onClick={go} disabled={busy}>
        {busy ? t('shareBusy') : t('shareGo')}
      </button>
      <p className="muted small">{t('shareLinkNote')}</p>
      {status && (
        <p className="muted small share-status" role="status" aria-live="polite">
          {status}
        </p>
      )}
      {fallbackText && <textarea className="share-fallback" readOnly rows={3} value={fallbackText} />}
    </div>
  );
}
