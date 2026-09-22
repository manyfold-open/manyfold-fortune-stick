/**
 * 齿孔撕线与撕裂动效交互
 * 包含：
 * 1. 票据切口槽 (Cutter notches)
 * 2. 真实微型圆形齿孔 (Perforated holes)
 * 3. 互动拉标 (Tear tab)
 * 4. 真实宣纸撕裂毛边 (TearEdge SVG)
 */

import { useT } from '../i18n';

export function TearEdge({
  position = 'top',
  className = '',
}: {
  position?: 'top' | 'bottom';
  className?: string;
}) {
  return (
    <div className={`tear-edge tear-edge-${position} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 400 12" preserveAspectRatio="none" className="tear-edge-svg">
        <path
          d={
            position === 'top'
              ? 'M0,12 L0,4 Q10,1 20,4 Q30,7 40,3 Q50,0 60,4 Q70,8 80,4 Q90,1 100,5 Q110,8 120,4 Q130,1 140,4 Q150,7 160,3 Q170,0 180,4 Q190,8 200,4 Q210,1 220,5 Q230,8 240,4 Q250,1 260,4 Q270,7 280,3 Q290,0 300,4 Q310,8 320,4 Q330,1 340,5 Q350,8 360,4 Q370,1 380,4 Q390,7 400,4 L400,12 Z'
              : 'M0,0 L0,8 Q10,11 20,8 Q30,5 40,9 Q50,12 60,8 Q70,4 80,8 Q90,11 100,7 Q110,4 120,8 Q130,11 140,8 Q150,5 160,9 Q170,12 180,8 Q190,4 200,8 Q210,11 220,7 Q230,4 240,8 Q250,11 260,8 Q270,5 280,9 Q290,12 300,8 Q310,4 320,8 Q330,11 340,7 Q350,4 360,8 Q370,11 380,8 Q390,5 400,8 L400,0 Z'
          }
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

export default function TearLine(props: { onTear: () => void; isTearing?: boolean }) {
  const t = useT();

  return (
    <div
      className={`tear-line-container ${props.isTearing ? 'tearing' : ''}`}
      onClick={props.onTear}
      role="button"
      tabIndex={0}
      title={t('tearHint')}
      aria-label={t('tearHint')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onTear();
        }
      }}
    >
      <div className="tear-notch tear-notch-left" />
      <div className="tear-track">
        <div className="tear-perforations" />
        {props.isTearing && <div className="tear-rip-glow" />}
      </div>
      <button
        type="button"
        className="tear-tab"
        onClick={(e) => {
          e.stopPropagation();
          props.onTear();
        }}
        aria-label={t('actionTearShare')}
      >
        <span className="tear-tab-icon" aria-hidden="true">
          ✂
        </span>
        <span className="tear-tab-text">{t('tearPullTab')}</span>
      </button>
      <div className="tear-notch tear-notch-right" />
    </div>
  );
}
