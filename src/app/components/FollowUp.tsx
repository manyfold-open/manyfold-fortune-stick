/**
 * 继续追问：在结果页里就地展开的对话，采用【方案 A：附笺折叠·最新展开】。
 *
 * 追问永远基于同一支签 —— 这条规则由服务端保证（handleFollowUp 从 readings 行读回
 * 问题、签和解读，再拼进提示词）。
 *
 * 历史多轮追问自动收纳为紧凑票签，避免纸卷无限拉长；
 * 输入框升级为自适应高度 Textarea，支持多行长文本输入。
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import type { FollowUpMessage } from '../../shared/types';
import { withoutDashes } from '../../shared/text';
import { api, errorMessage } from '../api';
import { FOLLOW_UP_MAX } from '../constants';
import { copyFor, useT } from '../i18n';
import { streamFollowUp } from '../sse';
import { track } from '../analytics';
import type { Language } from '../../shared/lang';

interface FollowUpRound {
  id: string | number;
  user: FollowUpMessage;
  agent?: FollowUpMessage;
}

function roundOrdinal(num: number, lang: Language): string {
  // 大写数字只有中文读者认得；日文、韩文和英文一样用 Q1、Q2
  if (lang !== 'zh') return `Q${num}`;
  const digits = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖', '拾'];
  if (num <= 10) return digits[num];
  return `第${num}問`;
}

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
  const [expandedRounds, setExpandedRounds] = useState<Record<string | number, boolean>>({});
  const log = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { readingId, onMessages } = props;

  useEffect(() => {
    let cancelled = false;
    void api<{ messages: FollowUpMessage[] }>(`/api/readings/${encodeURIComponent(readingId)}/messages`)
      .then((body) => {
        if (cancelled) return;
        const clean = body.messages.map((message) => ({
          ...message,
          content: withoutDashes(message.content),
          error: message.error ? withoutDashes(message.error) : null,
        }));
        setMessages(clean);
        onMessages(clean);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [readingId, onMessages]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages, live]);

  // 将消息配对为 [问, 答] 轮次
  const rounds = useMemo(() => {
    const list: FollowUpRound[] = [];
    let current: FollowUpRound | null = null;
    for (const msg of messages) {
      if (msg.role === 'user') {
        if (current) list.push(current);
        current = { id: msg.id, user: msg };
      } else if (msg.role === 'agent') {
        if (current) {
          current.agent = msg;
          list.push(current);
          current = null;
        } else {
          list.push({
            id: msg.id,
            user: {
              id: -2,
              role: 'user',
              content: '···',
              status: 'complete',
              error: null,
              createdAt: msg.createdAt,
            },
            agent: msg,
          });
        }
      }
    }
    if (current) list.push(current);
    return list;
  }, [messages]);

  const toggleRound = (id: string | number) => {
    setExpandedRounds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const ask = async (text: string) => {
    const question = withoutDashes(text.trim());
    if (!question || live !== null) return;
    setDraft('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setError('');
    track('follow_up_asked');
    setMessages((current) => [
      ...current,
      {
        id: -Date.now(),
        role: 'user',
        content: question,
        status: 'complete',
        error: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    setLive('');
    try {
      await streamFollowUp(readingId, question, (event) => {
        if (event.type === 'text') setLive(withoutDashes(event.text));
        if (event.type === 'error') setError(withoutDashes(event.message));
      });
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setLive(null);
      // 以服务端存下的为准重新拉一次
      await api<{ messages: FollowUpMessage[] }>(`/api/readings/${encodeURIComponent(readingId)}/messages`)
        .then((body) => {
          const clean = body.messages.map((message) => ({
            ...message,
            content: withoutDashes(message.content),
            error: message.error ? withoutDashes(message.error) : null,
          }));
          setMessages(clean);
          onMessages(clean);
        })
        .catch(() => undefined);
    }
  };

  const handleDraftChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(withoutDashes(event.target.value));
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  };

  return (
    <div className="followup">
      <div className="followup-log" ref={log}>
        {rounds.length === 0 && live === null && (
          <p className="muted small">{t('followUpEmpty')}</p>
        )}

        {rounds.map((round, index) => {
          const isLatest = index === rounds.length - 1;
          const isStreamingThisRound = isLatest && live !== null;
          // 方案 A：除最后一轮默认展开外，早期历史默认折叠收纳
          const isExpanded = isLatest || Boolean(expandedRounds[round.id]);

          return (
            <div
              key={`${round.id}-${index}`}
              className={`followup-round ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}
            >
              {!isLatest ? (
                // 历史折叠小票摘要条
                <button
                  type="button"
                  className="followup-ticket-summary"
                  onClick={() => toggleRound(round.id)}
                  aria-expanded={isExpanded}
                >
                  <span className="ticket-idx">{roundOrdinal(index + 1, props.language)}</span>
                  <span className="ticket-q-truncate">{round.user.content}</span>
                  <span className="ticket-toggle-badge">
                    {isExpanded ? `${t('historyCollapse')} ▴` : `${t('historyExpand')} ▾`}
                  </span>
                </button>
              ) : null}

              {isExpanded && (
                <div className="followup-round-content">
                  <div className="bubble user">
                    <span className="bubble-role" aria-hidden="true">
                      {t('followUpRoleUser')}
                    </span>
                    {round.user.content}
                  </div>
                  {round.agent ? (
                    <div className="bubble agent">
                      <span className="bubble-role" aria-hidden="true">
                        {t('followUpRoleAgent')}
                      </span>
                      {round.agent.content || round.agent.error || ''}
                    </div>
                  ) : isStreamingThisRound ? (
                    <div className="bubble agent streaming">
                      <span className="bubble-role" aria-hidden="true">
                        {t('followUpRoleAgent')}
                      </span>
                      {live || '…'}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
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
        <textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          onChange={handleDraftChange}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void ask(draft);
            }
          }}
          placeholder={live !== null ? t('followUpAnswering') : t('followUpPlaceholder')}
          maxLength={FOLLOW_UP_MAX}
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
