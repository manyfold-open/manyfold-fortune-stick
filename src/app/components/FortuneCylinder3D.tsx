/**
 * 重做的宫庙签筒（3D）。
 *
 * 和旧版最大的差别不在渲染，在**比例**：旧版 4.8 高 × 4.8 宽，36 支籤只占筒内截面的
 * 3.6%，所以它们只能各自站着，像插在土里。这一版把内半径收到 1.05、高径比拉到 2.8:1，
 * 填充率 35%，籤才挤得成一束。几何全部在 src/app/cylinder/geometry.ts 里，可被单元测试钉住。
 *
 * 这一版先只做「站在那里好看」—— 搖筒物理与出籤在下一步。
 */

import { useEffect, useRef, useState } from 'react';
import type { Language } from '../../shared/lang';
import type { Reading } from '../../shared/types';
import { createCylinderScene, type CylinderScene } from '../cylinder/scene';

export interface FortuneCylinder3DProps {
  state: 'idle' | 'ready' | 'shaking' | 'ejecting';
  sheet: Reading | null;
  fault?: { code: string; text: string } | null;
  language: Language;
  soundEnabled?: boolean;
  onShake: () => void;
  disabled?: boolean;
}

export default function FortuneCylinder3D(props: FortuneCylinder3DProps) {
  const { state, fault, language, disabled } = props;
  const en = language === 'en';

  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CylinderScene | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const rig = createCylinderScene(host);
    if (!rig) {
      setFailed(true);
      return;
    }
    sceneRef.current = rig;

    const baseZ = rig.tiltGroup.rotation.z;
    const baseX = rig.tiltGroup.rotation.x;
    let raf = 0;
    const t0 = performance.now();

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const t = (now - t0) / 1000;
      // 轻微的呼吸摆动，让它不像一张静止的图
      rig.tiltGroup.rotation.z = baseZ + Math.sin(t * 0.55) * 0.016;
      rig.tiltGroup.rotation.x = baseX + Math.sin(t * 0.41 + 1.2) * 0.012;
      rig.render();
    };
    raf = requestAnimationFrame(frame);

    const observer = new ResizeObserver(() => rig.resize(host.clientWidth, host.clientHeight));
    observer.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      rig.dispose();
      sceneRef.current = null;
    };
  }, []);

  if (failed) {
    return (
      <div className="roll-stage">
        <p className="roll-fallback">
          {en
            ? 'This browser cannot run the 3D cylinder. Switch to the retro printer above.'
            : '這台瀏覽器跑不動 3D 籤筒，請在上方改選復古印表機。'}
        </p>
      </div>
    );
  }

  return (
    <div className="roll-stage">
      <div
        ref={hostRef}
        className="cyl3d-canvas-wrapper"
        role="img"
        aria-label={en ? '3D temple fortune-stick cylinder' : '3D 宮廟籤筒'}
      />
      <div className="roll-action-area">
        {fault ? (
          <div className="roll-fault-pill" role="alert">
            <span className="fault-badge">{fault.code}</span>
            <span className="fault-text">{fault.text}</span>
          </div>
        ) : (
          <p className="roll-hint">
            {state === 'idle'
              ? en
                ? 'Write your thoughts above first'
                : '請先在上方虔心寫下所求之事'
              : en
                ? 'Shake interaction is not wired up yet — this is the look pass'
                : '搖籤互動還沒接上 —— 這一版先看造型'}
          </p>
        )}
      </div>
      {disabled ? null : null}
    </div>
  );
}
