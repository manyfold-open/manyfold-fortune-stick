/**
 * 继续追问：在结果页里就地展开的一小块对话。
 *
 * 追问永远基于同一支签 —— 这条规则由服务端保证（handleFollowUp 从 readings 行读回
 * 问题、签和解读，再拼进提示词），这里不做任何和签有关的判断，也没有重新抽签的入口。
 *
 * 语言分两处：输入框、发送键这些外壳跟界面走；三句快捷问句跟**这一局**走，
 * 因为点下去就是把那句话发给 agent，而 agent 回的是这一局锁定的那种语言。
 */

import { useEffect, useRef, useState } from 'react';
import type { FollowUpMessage } from '../../shared/types';
import { api } from '../api';
import { copyFor, useT } from '../i18n';
import { streamFollowUp } from '../sse';
import type { Language } from '../../shared/lang';

export default function FollowUp(props: {
  readingId: string;
  /** 这一局的语言 —— 决定快捷问句用哪种语言发出去。 */
  language: Language;
  onMessages: (messages: FollowUpMessage[]) => void;
}) {
  const t = useT();
  const quick = copyFor(props.language);
  const [messages, setMessages] = useState<FollowUpMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState<string | null>(null);
  const [error, setError] = useState('');
  const log = useRef<HTMLDivElement | null>(null);
  const { readingId, onMessages } = props;

  useEffect(() => {
    let cancelled = false;
    void api<{ messages: FollowUpMessage[] }>(`/api/readings/${encodeURIComponent(readingId)}/messages`)
      .then((body) => {
        if (cancelled) return;
        setMessages(body.messages);
        onMessages(body.messages);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [readingId, onMessages]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages, live]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || live !== null) return;
    setDraft('');
    setError('');
    setMessages((current) => [
      ...current,
      { id: -1, role: 'user', content: question, status: 'complete', error: null, createdAt: new Date().toISOString() },
    ]);
    setLive('');
    try {
      await streamFollowUp(readingId, question, (event) => {
        if (event.type === 'text') setLive(event.text);
        if (event.type === 'error') setError(event.message);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLive(null);
      // 以服务端存下的为准重新拉一次，看到的就是留下来的。
      await api<{ messages: FollowUpMessage[] }>(`/api/readings/${encodeURIComponent(readingId)}/messages`)
        .then((body) => {
          setMessages(body.messages);
          onMessages(body.messages);
        })
        .catch(() => undefined);
    }
  };

  return (
    <div className="followup">
      <div className="followup-log" ref={log}>
        {messages.length === 0 && live === null && (
          <p className="muted small">{t('followUpEmpty')}</p>
        )}
        {messages.map((message, index) => (
          <div key={`${message.id}-${index}`} className={`bubble ${message.role}`}>
            {message.content || message.error || ''}
          </div>
        ))}
        {live !== null && <div className="bubble agent">{live || '…'}</div>}
      </div>

      {error && <p className="field-error">{error}</p>}

      <div className="quick-asks">
        {[quick.followUpQuick1, quick.followUpQuick2, quick.followUpQuick3].map((question) => (
          <button
            key={question}
            type="button"
            className="text-action tiny"
            disabled={live !== null}
            onClick={() => void ask(question)}
          >
            {question}
          </button>
        ))}
      </div>

      <form
        className="followup-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={live !== null ? t('followUpAnswering') : t('followUpPlaceholder')}
          maxLength={200}
          disabled={live !== null}
          aria-label={t('followUpLabel')}
        />
        <button className="text-action" type="submit" disabled={!draft.trim() || live !== null}>
          {live !== null ? '…' : t('followUpSend')}
        </button>
      </form>
    </div>
  );
}
