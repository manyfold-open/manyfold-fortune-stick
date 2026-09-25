/**
 * 右上角的界面语言选单。
 *
 * 以前是一颗「切到另一种语言」的开关；语言一多，开关要按好几下才轮得到，
 * 所以改成点开一张小纸条，四种语言各占一行字，选了就收起来。
 * 按钮上写的是**现在**的语言，纸条上每一种语言都用它自己的文字写
 * （看不懂当前界面的人也找得到自己的那一行）。
 *
 * 只换界面。已经印出来的签一个字都不会动（AGENTS.md 第 9 条）。
 */

import { useEffect, useRef, useState } from 'react';
import { HTML_LANG, LANGUAGES, LANGUAGE_NAME, LANGUAGE_SHORT, type Language } from '../../shared/lang';
import { useT } from '../i18n';

export default function LanguageMenu(props: { language: Language; onChange: (language: Language) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // 点纸条外面、按 Esc 都收起来
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span className="lang-menu-wrap" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className="text-action lang-switch"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${t('settingsLanguageTitle')}: ${LANGUAGE_NAME[props.language]}`}
        onClick={() => setOpen((now) => !now)}
      >
        {LANGUAGE_SHORT[props.language]}
      </button>
      {open && (
        <ul className="lang-menu">
          {LANGUAGES.map((language) => (
            <li key={language}>
              <button
                type="button"
                className="text-action"
                lang={HTML_LANG[language]}
                data-lang={language}
                aria-pressed={language === props.language}
                onClick={() => {
                  props.onChange(language);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
              >
                {LANGUAGE_NAME[language]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
