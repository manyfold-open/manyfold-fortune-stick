/**
 * 求签记录。数据来自浏览器本地（src/app/storage.ts），所以打开就有，不用等网络。
 * 删除会同时清掉服务端那一行 —— 用户说删就是真的删掉。
 *
 * 版式跟求籤頁同一座神社：鳥居框住整頁，標題寫在掛在貫下面的木牌上（跟繪馬同一種木頭），
 * 每一條記錄是一張橫放的小御神籤 —— 朱紅雙線框、左邊籤頭寫籤號，展開是籤紙的背面。
 *
 * 这一页上有两种语言，别混：页面外壳（标题、展开、清空）跟右上角的界面开关走；
 * 每一条记录里面那几个小标题跟**那一条**自己的语言走，因为它们标的是 agent 当初
 * 用那种语言写下的文字，换个语言重新标注等于说错话。
 */

import { useState } from 'react';
import { detectLanguage } from '../../shared/lang';
import { withoutDashes } from '../../shared/text';
import { stickByNo } from '../../shared/sticks';
import { api } from '../api';
import { LEVEL_TONE } from '../constants';
import { copyFor, useT } from '../i18n';
import { clearRecords, deleteRecord, listRecords, type LocalRecord } from '../storage';
import StickFace from './StickFace';

const formatTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

/** 掛在鳥居貫下面的木牌：紅繩、淺木面、上面一行朱紅小字。 */
function Plaque({ caption, title }: { caption: string; title: string }) {
  return (
    <header className="history-plaque">
      <span className="history-plaque-cord" aria-hidden />
      <span className="history-plaque-caption" aria-hidden>
        {caption}
      </span>
      <h2>{title}</h2>
    </header>
  );
}

export default function HistoryView() {
  const t = useT();
  const [records, setRecords] = useState<LocalRecord[]>(() => listRecords());
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const removeOne = async (id: string) => {
    deleteRecord(id);
    setRecords(listRecords());
    await api(`/api/readings/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
  };

  const removeAll = async () => {
    const ids = records.map((record) => record.id);
    clearRecords();
    setRecords([]);
    setConfirmClear(false);
    await Promise.allSettled(
      ids.map((id) => api(`/api/readings/${encodeURIComponent(id)}`, { method: 'DELETE' })),
    );
  };

  if (records.length === 0) {
    return (
      <section className="history">
        <Plaque caption={t('historyCaption')} title={t('historyTitle')} />
        <div className="history-empty">
          <p className="muted">{t('historyEmpty')}</p>
          <a className="text-action history-go" href="#/">
            {t('historyGoDraw')}
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="history">
      <Plaque caption={t('historyCaption')} title={t('historyTitle')} />
      <div className="history-head">
        <p className="muted small">{t('historyLocalNote')}</p>
        {confirmClear ? (
          <span className="row">
            <button className="text-action danger" onClick={() => void removeAll()}>
              {t('historyClearConfirm')}
            </button>
            <button className="text-action" onClick={() => setConfirmClear(false)}>
              {t('historyCancel')}
            </button>
          </span>
        ) : (
          <button className="text-action" onClick={() => setConfirmClear(true)}>
            {t('historyClear')}
          </button>
        )}
      </div>

      {records.map((record) => {
        const stick = stickByNo(record.stickNo);
        if (!stick) return null;
        const open = openId === record.id;
        // 这一条自己的语言 —— 标的是 agent 当初用那种语言写的字。
        const language = detectLanguage(record.question);
        const own = copyFor(language);
        return (
          <article
            className={`history-item${open ? ' open' : ''}`}
            data-tone={LEVEL_TONE[stick.level].key}
            key={record.id}
          >
            <button className="history-summary" aria-expanded={open} onClick={() => setOpenId(open ? null : record.id)}>
              <StickFace stick={stick} language={language} size="small" />
              <span className="history-meta">
                <span className="history-question">{withoutDashes(record.question)}</span>
                <span className="muted small">{formatTime(record.createdAt)}</span>
              </span>
              <span className="history-toggle" aria-hidden>
                {open ? t('historyCollapse') : t('historyExpand')}
              </span>
            </button>

            {open && (
              <div className="history-body">
                {record.interpretation ? (
                  <>
                    <p className="lead">{withoutDashes(record.interpretation.meaning)}</p>
                    <p>{withoutDashes(record.interpretation.answer)}</p>
                    {record.interpretation.notice && (
                      <p>
                        <strong className="history-label">{own.historyNoticeLabel}</strong>
                        {withoutDashes(record.interpretation.notice)}
                      </p>
                    )}
                    <p>
                      <strong className="history-label">{own.historyActionLabel}</strong>
                      {withoutDashes(record.interpretation.action)}
                    </p>
                  </>
                ) : (
                  <p className="muted">{t('historyNoReading')}</p>
                )}

                {record.followUps.length > 0 && (
                  <div className="history-followups">
                    <h4>{t('historyFollowUps')}</h4>
                    {record.followUps.map((message, index) => (
                      <div key={index} className={`bubble ${message.role}`}>
                        <span className="bubble-role" aria-hidden="true">
                          {t(message.role === 'user' ? 'followUpRoleUser' : 'followUpRoleAgent')}
                        </span>
                        {withoutDashes(message.content)}
                      </div>
                    ))}
                  </div>
                )}

                <button className="text-action danger" onClick={() => void removeOne(record.id)}>
                  {t('historyDelete')}
                </button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
