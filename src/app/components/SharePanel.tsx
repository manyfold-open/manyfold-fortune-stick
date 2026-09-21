/**
 * 分享结果。默认不放问题、完整解读和追问 —— 用户要放自己的问题必须主动勾选。
 * 系统分享用不了就退回下载；下载也不行时，至少给一段可以复制的短文字。
 */

import { useState } from 'react';
import { stickText, type FortuneStick } from '../../shared/sticks';
import type { Interpretation } from '../../shared/types';
import { renderShareImage, shareImage, shareText } from '../share';

export default function SharePanel(props: {
  stick: FortuneStick;
  interpretation: Interpretation | null;
  question: string;
  onClose: () => void;
}) {
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
      });
      const outcome = await shareImage(blob, props.stick);
      setStatus(outcome === 'shared' ? '已经交给系统分享。' : '图片已保存到下载。');
    } catch {
      setStatus('图片这次没生成出来，可以先复制下面这段文字。');
      setFallbackText(shareText(props.stick, props.interpretation?.meaning ?? stickText(props.stick, 'zh').meaning));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="share-panel">
      <div className="share-head">
        <strong>分享结果</strong>
        <button type="button" className="text-action tiny" onClick={props.onClose}>
          收起
        </button>
      </div>
      <p className="muted small">图片里只有签号、等级、签诗和一句话签意，不包含你的解读和追问。</p>
      <label className="check">
        <input
          type="checkbox"
          checked={includeQuestion}
          onChange={(event) => setIncludeQuestion(event.target.checked)}
        />
        在图片中显示我的问题
      </label>
      <button className="text-action strong" onClick={() => void go()} disabled={busy}>
        {busy ? '生成中…' : '生成并分享'}
      </button>
      {status && <p className="muted small">{status}</p>}
      {fallbackText && <textarea className="share-fallback" readOnly rows={3} value={fallbackText} />}
    </div>
  );
}
