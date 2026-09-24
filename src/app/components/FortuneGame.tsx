/**
 * 一局完整的求签：写下问题 → 按下印键 → 打印机吐出签纸 → 解签 → 分享／追问／再求一签。
 *
 * 两条必须守住的规则：
 *  1. 签在按下印键时由服务端抽定并落库，浏览器只记住 readingId。刷新、解签失败、
 *     重试解签都只会读回同一支签 —— 这个组件里没有任何一条路径能重新抽签，
 *     除非用户自己点「再求一签」。走纸动画只是在放已经定下来的那张纸。
 *  2. 签诗在解签中和解签失败时都保持可见。
 *
 * 界面上所有的提示都走打印机的屏（LCD），页面本身不再出现第二处提示文案。
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { FollowUpMessage, Reading } from '../../shared/types';
import { api, ApiError, errorMessage } from '../api';
import { EJECT_MS, LEVEL_TONE, PRINT_MS, QUESTION_MIN, QUESTION_MAX } from '../constants';
import { useT } from '../i18n';
import {
  bambooRattle,
  motor,
  paperRollRumble,
  paperSettleSound,
  press as pressSound,
  stampSound,
  suzu,
  typeTick,
} from '../sound';
import {
  getCurrentReadingId,
  saveRecord,
  setCurrentReadingId,
  type LocalFollowUp,
  type Prefs,
} from '../storage';
import { acceptsGesture, chimeAtSlip, drawStartSound, enterDraws } from '../../shared/cylinder/interaction';
import { EmaChrome } from './Ema';
import QuestionForm from './QuestionForm';
import ReadingResult, { type EmaRect } from './ReadingResult';
import StickFace from './StickFace';

/*
 * 3D 籤筒連同 three.js 是整包程式裡最大的一塊（光 three 的渲染器就五百多 KB）。
 * 拆成自己一包、程式一跑起來就開始抓：鳥居、繪馬、頂欄先出來，使用者可以先寫問題，
 * 籤筒到了再淡入；重新整理停在解籤頁的人則完全不用等它。
 */
const cylinder3d = import('./FortuneCylinder3D');
const FortuneCylinder3D = lazy(() => cylinder3d);

/** 籤筒還沒到時佔住同一塊版面（同一組 class），它到了不會把頁面推動 */
function CylinderPlaceholder() {
  return (
    <div className="roll-stage cyl3d-stage cyl3d-loading" aria-hidden>
      <div className="cyl3d-canvas-wrapper" />
      <div className="roll-action-area">
        <div className="cyl3d-status">
          <p className="roll-hint" />
        </div>
      </div>
    </div>
  );
}

// 另外三個器具只在 ?vessel= 才用得到：拆出去，一般人打開遊戲不必下載它們
const FortuneCylinder = lazy(() => import('./FortuneCylinder'));
const FortunePaperRoll = lazy(() => import('./FortunePaperRoll'));
const Printer = lazy(() => import('./Printer'));

type Phase = 'ask' | 'printing' | 'ejecting';

/** 解籤。訊息 id 由伺服器照這一列的 updated_at 算（AGENTS.md 第 14 條），同一個請求不會被算兩次。 */
const requestInterpretation = (id: string): Promise<Reading> =>
  api<{ reading: Reading }>(`/api/readings/${encodeURIComponent(id)}/interpret`, { method: 'POST' }).then(
    (body) => body.reading,
  );

interface Fault {
  code: string;
  text: string;
}

type Vessel = 'cylinder' | 'printer' | 'roll' | 'cylinder3d';

const isVessel = (v: string | null): v is Vessel =>
  v === 'cylinder' || v === 'printer' || v === 'roll' || v === 'cylinder3d';

export default function FortuneGame(props: {
  prefs: Prefs;
  interpreterReady: boolean;
  /** 左上角 logo 在這一頁被點的次數（App 數）。每多一下就回到起點，見下面的 effect。 */
  homeTaps?: number;
}) {
  const t = useT();
  const [question, setQuestion] = useState(() => {
    try {
      return new URL(window.location.href).searchParams.get('q') || '';
    } catch {
      return '';
    }
  });
  const [phase, setPhase] = useState<Phase>(() => {
    try {
      const p = new URL(window.location.href).searchParams.get('dev_phase');
      if (p === 'printing' || p === 'ejecting') return p as Phase;
    } catch {
      /* ignore */
    }
    return 'ask';
  });
  const [reading, setReading] = useState<Reading | null>(null);
  const [sheet, setSheet] = useState<Reading | null>(() => {
    try {
      if (new URL(window.location.href).searchParams.get('dev_phase') === 'ejecting') {
        return {
          id: 'demo',
          question: '今年我的事業運勢如何？',
          language: 'zh',
          status: 'revealed',
          interpretation: null,
          stick: {
            no: 1,
            level: '上上签',
            title: '大吉',
            poem: ['天開文運喜臨門', '萬事亨通福滿門'],
            explanation: '萬事大吉',
          },
          createdAt: new Date().toISOString(),
        } as unknown as Reading;
      }
    } catch {
      /* ignore */
    }
    return null;
  });
  const [interpreting, setInterpreting] = useState(false);
  const [fault, setFault] = useState<Fault | null>(null);
  const [restoring, setRestoring] = useState(true);
  /**
   * 器具选择列已经收掉，籤筒 v2 就是这个产品。
   *
   * 只认 `?vessel=`，不再读 localStorage —— 存着的旧选择会把老使用者钉在一个
   * 他再也切不回来的器具上（切换列没了，没有 UI 可以改）。其余三个器具程式码留着，
   * 用 ?vessel=cylinder / printer / roll 还是进得去。
   */
  const [vessel] = useState<Vessel>(() => {
    try {
      const v = new URL(window.location.href).searchParams.get('vessel');
      if (isVessel(v)) return v;
    } catch {
      /* ignore */
    }
    return 'cylinder3d';
  });

  /** 籤筒 v2 的出籤時機由元件回報（搖多久是使用者決定的），這裡先擱著那支籤。 */
  const pendingReading = useRef<Reading | null>(null);
  const timers = useRef<number[]>([]);
  const stopMotor = useRef<(() => void) | null>(null);
  /** 输入框本体。例句在机器下方，填完字要把光标送回这里，所以 ref 归这一层。 */
  const askField = useRef<HTMLTextAreaElement | null>(null);
  /** 沒寫問題就去攪籤筒的次數 —— 每加一，繪馬晃一下（QuestionForm 的 nudge）。 */
  const [askNudge, setAskNudge] = useState(0);
  /** 出籤途中那塊繪馬。交棒時量它在哪，結果頁的繪馬從這裡滑過去 —— 同一塊牌子，不是換一塊。 */
  const emaRef = useRef<HTMLDivElement | null>(null);
  const [emaFrom, setEmaFrom] = useState<EmaRect | null>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(
    () => () => {
      clearTimers();
      stopMotor.current?.();
    },
    [clearTimers],
  );

  // 刷新页面后恢复当前这一支签和已经生成的解读。
  useEffect(() => {
    const id = getCurrentReadingId();
    if (!id) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    void api<{ reading: Reading }>(`/api/readings/${encodeURIComponent(id)}`)
      .then((body) => {
        if (cancelled) return;
        setReading(body.reading);
        setQuestion(body.reading.question);
      })
      .catch((cause) => {
        // 记录在服务端不存在了（被清过），就别一直卡着一个空的当前签。
        if (cause instanceof ApiError && cause.status === 404) setCurrentReadingId(null);
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 恢復簽或回首頁提問時，確保滾動位置在頂部
  useEffect(() => {
    if (!restoring && phase === 'ask' && !reading) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [restoring, phase, reading]);

  const triggerHaptic = useCallback((pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        /* Ignore on restricted environments */
      }
    }
  }, []);

  const draw = useCallback(async () => {
    // 按键自己在打印中就禁用了，这里再挡一道：抽签是这个游戏最不能出错的一步，
    // 多一支签就等于把用户刚看到的那一支换掉了。
    if (phase !== 'ask') return;

    const length = [...question.trim()].length;
    if (length === 0) return setFault({ code: 'E-01', text: t('faultEmpty') });
    if (length < QUESTION_MIN) {
      return setFault({ code: 'E-02', text: t('faultTooShort', { min: QUESTION_MIN }) });
    }
    if (length > QUESTION_MAX) {
      return setFault({ code: 'E-03', text: t('faultTooLong', { max: QUESTION_MAX }) });
    }

    setFault(null);
    setPhase('printing');
    const calm = props.prefs.reducedMotion;
    triggerHaptic(22);
    if (props.prefs.sound) {
      // 判斷抽成 shared/cylinder/interaction.ts：以前這裡寫 vessel === 'cylinder'，
      // 3D 籤筒就掉進預設分支，放了印表機的按鍵聲加馬達聲
      const cue = drawStartSound(vessel);
      if (cue === 'rattle') {
        stopMotor.current = bambooRattle(PRINT_MS);
      } else if (cue === 'rumble') {
        stopMotor.current = paperRollRumble(PRINT_MS);
      } else if (cue === 'printer') {
        pressSound();
        if (!calm) stopMotor.current = motor(PRINT_MS);
      }
    }
    if (!calm) {
      // 步进电机微脉冲触感
      triggerHaptic([10, 65, 10, 65, 10, 65, 10]);
    }

    try {
      const body = await api<{ reading: Reading }>('/api/readings', {
        method: 'POST',
        body: JSON.stringify({ question }),
      });
      setCurrentReadingId(body.reading.id);
      saveRecord(body.reading);

      if (calm) {
        setReading(body.reading);
        setPhase('ask');
        return;
      }

      // 籤筒 v2：摇多久由使用者决定，固定计时器就不对了 —— 演完由 onRevealed 回报。
      if (vessel === 'cylinder3d') {
        setSheet(body.reading);
        pendingReading.current = body.reading;
        setPhase('ejecting');
        return;
      }

      // 纸开始往外走，走完再把画面交给结果页 —— 中间这段时间签已经定死了。
      setSheet(body.reading);
      // 滚印机要把签纸整张碾出来再停稳，比签筒多留一点时间。
      const ejectDuration = vessel === 'roll' ? 2200 : vessel === 'cylinder' ? 1200 : EJECT_MS;
      timers.current.push(
        window.setTimeout(() => {
          triggerHaptic([35, 40, 18]);
          if (props.prefs.sound) {
            suzu(body.reading.stick.level);
            stampSound(body.reading.stick.level);
          }
          setPhase('ejecting');
        }, PRINT_MS),
        window.setTimeout(() => {
          setReading(body.reading);
          setSheet(null);
          setPhase('ask');
        }, PRINT_MS + ejectDuration),
      );
    } catch (cause) {
      stopMotor.current?.();
      setPhase('ask');
      setFault({ code: 'ERROR', text: errorMessage(cause, t) });
    }
  }, [phase, question, props.prefs.reducedMotion, props.prefs.sound, t, vessel]);

  /**
   * 抽完就在背景先解籤：籤紙一攤開，按「解签」多半已經解好了，不用再對著骨架等好幾秒。
   * 代價是每一支抽出來的籤都會送一次（連沒按解籤的也算）—— 使用者同意這樣換速度。
   * 只在新抽的那一刻做（重新整理、從記錄打開的不做）；背景這一次失敗不吭聲，按下去時照常再解。
   * 解好的時候人已經去求下一支了，就只存進記錄，不去動畫面上那一張。
   */
  const warm = useRef<{ id: string; promise: Promise<Reading> } | null>(null);
  const shownId = useRef<string | null>(null);
  shownId.current = reading?.id ?? null;
  const warmUp = useCallback(
    (drawn: Reading) => {
      if (!props.interpreterReady || drawn.interpretation) return;
      const promise = requestInterpretation(drawn.id);
      warm.current = { id: drawn.id, promise };
      void promise
        .then((next) => {
          saveRecord(next);
          if (shownId.current === next.id) setReading((now) => (now && !now.interpretation ? next : now));
        })
        .catch(() => undefined)
        .finally(() => {
          if (warm.current?.promise === promise) warm.current = null;
        });
    },
    [props.interpreterReady],
  );

  /** 籤筒 v2 演完了：这时候才把画面交给结果页。 */
  const revealDone = useCallback(() => {
    const drawn = pendingReading.current;
    if (!drawn) return;
    pendingReading.current = null;
    if (props.prefs.sound) {
      // 3D 籤筒的鈴聲已經在號碼印上籤身那一格響過了，這裡只剩籤紙的蓋章聲
      if (chimeAtSlip(vessel)) suzu(drawn.stick.level);
      stampSound(drawn.stick.level);
    }
    const box = emaRef.current?.getBoundingClientRect();
    setEmaFrom(box ? { top: box.top, left: box.left, width: box.width, height: box.height } : null);
    shownId.current = drawn.id;
    setReading(drawn);
    setSheet(null);
    setPhase('ask');
    warmUp(drawn);
  }, [props.prefs.sound, vessel, warmUp]);

  const interpret = useCallback(async () => {
    if (!reading || interpreting) return;
    setInterpreting(true);
    setFault(null);
    // 背景已經在解這一支（warmUp）：接著等同一個請求，不再送一次 —— 送兩次就是解兩次、扣兩次
    const pending = warm.current?.id === reading.id ? warm.current.promise : null;
    warm.current = null;
    try {
      const next = pending
        ? await pending.catch(() => requestInterpretation(reading.id))
        : await requestInterpretation(reading.id);
      setReading(next);
      saveRecord(next);
    } catch (cause) {
      setFault({ code: 'ERROR', text: errorMessage(cause, t) });
    } finally {
      setInterpreting(false);
    }
  }, [reading, interpreting, t]);

  const onFollowUpMessages = useCallback(
    (messages: FollowUpMessage[]) => {
      if (!reading) return;
      const followUps: LocalFollowUp[] = messages.map((message) => ({
        role: message.role,
        content: message.content || message.error || '',
      }));
      saveRecord(reading, followUps);
    },
    [reading],
  );

  /** 再求一签：清空上一次的问题，回到打印机前，开启全新一轮。 */
  const restart = useCallback(() => {
    if (props.prefs.sound) paperSettleSound(0.22);
    triggerHaptic(20);
    clearTimers();
    stopMotor.current?.();
    pendingReading.current = null;
    warm.current = null;
    setCurrentReadingId(null);
    setReading(null);
    setSheet(null);
    setEmaFrom(null);
    setQuestion('');
    setFault(null);
    setPhase('ask');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [clearTimers, props.prefs.sound, triggerHaptic]);

  /*
   * 點 logo = 回首頁。看著結果時就是「再求一籤」那一步：清掉這一局、回到空白繪馬 ——
   * 不抽籤（籤只能攪出來），抽過的那支留在「你的籤」裡。攪籤、出籤途中不理它：那支籤已經在
   * 伺服器定下來了，半路打斷，使用者就只能去記錄裡才看得到它。
   * 只看「變了」：路由切回來時元件重新掛上，那時的次數不算一次點擊。
   */
  const homeSeen = useRef(props.homeTaps ?? 0);
  useEffect(() => {
    const taps = props.homeTaps ?? 0;
    if (taps === homeSeen.current) return;
    homeSeen.current = taps;
    if (restoring || phase !== 'ask') return;
    if (reading) restart();
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [props.homeTaps, restoring, phase, reading, restart]);

  if (restoring) {
    return (
      <section className="stage">
        <div className="loading-shrine" role="status" aria-live="polite">
          <div className="loading-shrine-emblem" aria-hidden="true">
            <span className="loading-shrine-torii">⛩️</span>
            <span className="loading-shrine-sakura">🌸</span>
          </div>
          <p className="loading-shrine-text">{t('restoring')}</p>
        </div>
      </section>
    );
  }

  if (reading) {
    return (
      <ReadingResult
        reading={reading}
        interpreting={interpreting}
        error={fault?.text ?? ''}
        onInterpret={() => void interpret()}
        onFollowUpMessages={onFollowUpMessages}
        onRestart={restart}
        sound={props.prefs.sound}
        emaFrom={emaFrom}
      />
    );
  }

  const typed = [...question.trim()].length;
  const printing = phase !== 'ask';
  const lcd = fault
    ? { code: fault.code, message: fault.text, alert: true }
    : printing
      ? { code: 'PRINT', message: t('lcdPrinting'), alert: false }
      : typed === 0
        ? props.interpreterReady
          ? { code: 'READY', message: t('lcdWriteSomething'), alert: false }
          : { code: 'WARN', message: t('lcdNoInterpreter'), alert: true }
        : { code: 'READY', message: t('lcdPressKey'), alert: false };

  /* 例句：印表機這些器具放在机器下方，不在提问和机器中间 —— 夹在中间会把本该挨着的两样推开。
     3D 籤筒例外，放在題目框正下方：籤筒是一整面畫布，使用者要一個螢幕看完，
     例句接著題目才讀得順（2026-09-23 使用者回饋）。

     点一句就把它填进输入框，光标跟着回到框里，接着改还是直接按印都行。
     例句跟着界面语言：它们是机器给的提示，不是已经印出来的纸；点了哪一句
     就等于用那种语言提问，这一局的语言也就跟着定了（detectLanguage）。

     写了字就让它们退场，但**不卸载** —— 卸载的话这一块高度归零，整台机器会
     往下跳。给容器写死一个 min-height 是猜不准的：三句话在窄屏上会换行，
     高度跟着视口变。留在原地淡出，高度就永远是它自己那么高。
     退场时按钮要一起 disabled，否则看不见却还能被 Tab 选中。 */
  const suggestions = (
    <div className={`suggest-slot${printing ? ' spent' : ''}`}>
      <ul
        className={`suggestions${printing ? ' spent' : ''}`}
        aria-hidden={printing}
        data-lang={props.prefs.language}
      >
        {[t('exampleToday'), t('example1'), t('example2'), t('example3')].map((example) => {
          const isSelected = question === example;
          return (
            <li key={example}>
              <button
                type="button"
                className={`text-action${isSelected ? ' selected' : ''}`}
                disabled={printing}
                onClick={() => {
                  if (props.prefs.sound) typeTick(0.08);
                  setQuestion(example);
                  askField.current?.focus();
                }}
              >
                {example}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <section className="stage" data-tone={sheet ? LEVEL_TONE[sheet.stick.level].key : undefined}>
      <div className={`ask-slot${printing ? ' printed' : ''}`}>
        {printing ? (
          vessel === 'cylinder3d' ? (
            <div className="ask-zone" ref={emaRef}>
              <EmaChrome>
                {/* 包在跟輸入框同一個 .ask-grow 裡：高度由同一份隱藏副本撐開，
                    攪夠了那一刻輸入框換成印好的字，繪馬一 px 都不變（手還按著籤，籤筒不能動） */}
                <div className="ask-grow" data-value={question}>
                  <p className="asked">{question}</p>
                </div>
              </EmaChrome>
            </div>
          ) : (
            <p className="asked">{question}</p>
          )
        ) : (
          <QuestionForm
            value={question}
            onChange={setQuestion}
            // 3D 籤筒的籤只能攪出來：Enter 只是寫完了，收起游標（手機收起鍵盤）
            onSubmit={() => (enterDraws(vessel) ? void draw() : askField.current?.blur())}
            inputRef={askField}
            sound={props.prefs.sound}
            nudge={askNudge}
          />
        )}
      </div>

      {vessel === 'cylinder3d' && suggestions}

      <Suspense fallback={null}>
      {vessel === 'cylinder3d' ? (
        <div className="roll-slot">
          <Suspense fallback={<CylinderPlaceholder />}>
            <FortuneCylinder3D
              state={
                phase === 'printing'
                  ? 'shaking'
                  : phase === 'ejecting'
                    ? 'ejecting'
                    : typed > 0
                      ? 'ready'
                      : 'idle'
              }
              sheet={sheet}
              fault={fault}
              language={sheet ? sheet.language : props.prefs.language}
              soundEnabled={props.prefs.sound}
              reducedMotion={props.prefs.reducedMotion}
              onShake={() => void draw()}
              onRevealed={revealDone}
              onNeedQuestion={() => {
                setAskNudge((n) => n + 1);
                askField.current?.focus();
              }}
              // 籤筒 v2 的籤是摇出来的，不是演完的 —— 出籤途中关掉输入会死锁
              disabled={!acceptsGesture(vessel, phase)}
            />
          </Suspense>
        </div>
      ) : vessel === 'roll' ? (
        <div className="roll-slot">
          <FortunePaperRoll
            state={
              phase === 'printing'
                ? 'shaking'
                : phase === 'ejecting'
                  ? 'ejecting'
                  : typed > 0
                    ? 'ready'
                    : 'idle'
            }
            sheet={sheet}
            fault={fault}
            language={sheet ? sheet.language : props.prefs.language}
            soundEnabled={props.prefs.sound}
            onShake={() => void draw()}
            disabled={printing}
          />
        </div>
      ) : vessel === 'cylinder' ? (
        <div className="cylinder-slot">
          <FortuneCylinder
            state={
              phase === 'printing'
                ? 'shaking'
                : phase === 'ejecting'
                  ? 'ejecting'
                  : typed > 0
                    ? 'ready'
                    : 'idle'
            }
            sheet={sheet}
            fault={fault}
            language={sheet ? sheet.language : props.prefs.language}
            soundEnabled={props.prefs.sound}
            onShake={() => void draw()}
            disabled={printing}
          />
        </div>
      ) : (
        <div className={`printer-slot${phase === 'ejecting' ? ' ejecting' : ''}`}>
          <Printer
            state={printing ? 'printing' : typed > 0 ? 'ready' : 'idle'}
            code={lcd.code}
            message={lcd.message}
            alert={lcd.alert}
            feeding={sheet !== null}
            onPress={() => void draw()}
          >
            {sheet && <StickFace stick={sheet.stick} language={sheet.language} />}
          </Printer>
        </div>
      )}
      </Suspense>

      {vessel !== 'cylinder3d' && suggestions}
    </section>
  );
}
