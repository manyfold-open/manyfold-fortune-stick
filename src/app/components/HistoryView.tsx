/**
 * 求签记录。数据来自浏览器本地（src/app/storage.ts），所以打开就有，不用等网络。
 * 删除会同时清掉服务端那一行 —— 用户说删就是真的删掉。
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
import { copyFor, useT } from '../i18n';
import { clearRecords, deleteRecord, listRecords, type LocalRecord } from '../storage';
import StickFace from './StickFace';

const formatTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

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
        <h2>{t('historyTitle')}</h2>
        <p className="muted">{t('historyEmpty')}</p>
        <a className="text-action" href="#/">
          {t('historyGoDraw')}
        </a>
      </section>
    );
  }

  return (
    <section className="history">
      <div className="history-head">
        <h2>{t('historyTitle')}</h2>
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
      <p className="muted small">{t('historyLocalNote')}</p>

      {records.map((record) => {
        const stick = stickByNo(record.stickNo);
        if (!stick) return null;
        const open = openId === record.id;
        // 这一条自己的语言 —— 标的是 agent 当初用那种语言写的字。
        const language = detectLanguage(record.question);
        const own = copyFor(language);
        return (
          <article className="history-item" key={record.id}>
            <button className="history-summary" onClick={() => setOpenId(open ? null : record.id)}>
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
                        <strong>{own.historyNoticeLabel}</strong>
                        {withoutDashes(record.interpretation.notice)}
                      </p>
                    )}
                    <p>
                      <strong>{own.historyActionLabel}</strong>
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
