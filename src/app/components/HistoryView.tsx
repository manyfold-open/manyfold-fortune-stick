/**
 * 求签记录。数据来自浏览器本地（src/app/storage.ts），所以打开就有，不用等网络。
 * 删除会同时清掉服务端那一行 —— 用户说删就是真的删掉。
 */

import { useState } from 'react';
import { detectLanguage } from '../../shared/lang';
import { stickByNo } from '../../shared/sticks';
import { api } from '../api';
import { clearRecords, deleteRecord, listRecords, type LocalRecord } from '../storage';
import StickFace from './StickFace';

const formatTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

export default function HistoryView() {
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
        <h2>求签记录</h2>
        <p className="muted">这台设备上还没有记录。求过的签会留在这里。</p>
        <a className="text-action" href="#/">
          去求一签
        </a>
      </section>
    );
  }

  return (
    <section className="history">
      <div className="history-head">
        <h2>求签记录</h2>
        {confirmClear ? (
          <span className="row">
            <button className="text-action danger" onClick={() => void removeAll()}>
              确认清空
            </button>
            <button className="text-action" onClick={() => setConfirmClear(false)}>
              取消
            </button>
          </span>
        ) : (
          <button className="text-action" onClick={() => setConfirmClear(true)}>
            清空全部
          </button>
        )}
      </div>
      <p className="muted small">记录只保存在这台设备的浏览器里。</p>

      {records.map((record) => {
        const stick = stickByNo(record.stickNo);
        if (!stick) return null;
        const open = openId === record.id;
        return (
          <article className="history-item" key={record.id}>
            <button className="history-summary" onClick={() => setOpenId(open ? null : record.id)}>
              <StickFace stick={stick} language={detectLanguage(record.question)} size="small" />
              <span className="history-meta">
                <span className="history-question">{record.question}</span>
                <span className="muted small">{formatTime(record.createdAt)}</span>
              </span>
              <span className="history-toggle" aria-hidden>
                {open ? '收起' : '展开'}
              </span>
            </button>

            {open && (
              <div className="history-body">
                {record.interpretation ? (
                  <>
                    <p className="lead">{record.interpretation.meaning}</p>
                    <p>{record.interpretation.answer}</p>
                    {record.interpretation.notice && (
                      <p>
                        <strong>值得留意：</strong>
                        {record.interpretation.notice}
                      </p>
                    )}
                    <p>
                      <strong>可以做的一件小事：</strong>
                      {record.interpretation.action}
                    </p>
                  </>
                ) : (
                  <p className="muted">这一次没有解签。</p>
                )}

                {record.followUps.length > 0 && (
                  <div className="history-followups">
                    <h4>追问</h4>
                    {record.followUps.map((message, index) => (
                      <div key={index} className={`bubble ${message.role}`}>
                        {message.content}
                      </div>
                    ))}
                  </div>
                )}

                <button className="text-action danger" onClick={() => void removeOne(record.id)}>
                  删除这条记录
                </button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
