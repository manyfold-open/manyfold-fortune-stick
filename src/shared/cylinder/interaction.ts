/**
 * 出籤这段时间还收不收使用者的手势 —— 纯判断，不 import three，不碰 DOM。
 *
 * 抽出来是因为它害过一次死锁，而且从画面上看起来像「物理坏了」：
 *
 *   `disabled = phase !== 'ask'` 对印表机和滚印是**对的** —— 它们的出籤是计时器
 *   演完的，中途不准插手。对籤筒 v2 却是致命的：它的籤是使用者摇出来的。
 *
 *   抽到籤 → phase 进 ejecting → 输入被关掉 → pointerdown 第一行就 return →
 *   dragging 永远 false → pushHand 不被呼叫 → intensity 衰减到 0 →
 *   stepBundle 的 drive = 0 → CHOSEN_LIFT 与 RATCHET 一起归零 →
 *   中签那支只剩重力，靠 GRIP_HOLD 慢慢沉回筒底 → 爬不到 exitRise →
 *   stage 永远留在 shaking → onRevealed 不回报 → phase 出不了 ejecting。
 *
 *   闭环。使用者只能重整页面。而画面那时候还在喊「有一支籤鬆動了 —— 繼續搖，別停」，
 *   每一个指标事件都被丢掉。
 *
 * 教训不是「籤筒要特别处理」，是**出籤由谁驱动，决定了这段时间要不要收手**。
 */

export type Vessel = 'cylinder' | 'printer' | 'roll' | 'cylinder3d';
export type Phase = 'ask' | 'printing' | 'ejecting';

/**
 * 这个器具的出籤过程是使用者摇出来的，而不是计时器演完的。
 *
 * 手势驱动的器具在**整个**出籤过程里都需要手；关掉它的输入等于把它锁死，
 * 因为解除锁定的条件（籤掉出来）只能靠被关掉的那只手达成。
 */
export const isGestureDriven = (vessel: Vessel): boolean => vessel === 'cylinder3d';

/**
 * 现在还要不要把指标事件交给器具。
 *
 * 计时器驱动的器具：离开 ask 就收手，免得动画演到一半被插队。
 * 手势驱动的器具：从头到尾都收 —— 它没有「演完」这回事，是摇完。
 */
export const acceptsGesture = (vessel: Vessel, phase: Phase): boolean =>
  isGestureDriven(vessel) || phase === 'ask';

/**
 * 開始抽籤那一刻放什麼聲音。
 *
 * 以前這個判斷寫在 FortuneGame 裡，用的是 `vessel === 'cylinder'`（舊的 2D 籤筒），
 * 3D 籤筒 `'cylinder3d'` 就掉進預設分支 —— 「可以放手了」那一刻放的是**印表機**的
 * 按鍵聲加 1.9 秒馬達聲。3D 籤筒什麼都不放：攪動本身就有竹籤的沙沙聲，
 * 真正「抽到」的聲音要等籤被拿出來（見 pull.ts 的 pullCues）。
 */
export const drawStartSound = (vessel: Vessel): 'printer' | 'rattle' | 'rumble' | 'none' =>
  vessel === 'cylinder3d'
    ? 'none'
    : vessel === 'cylinder'
      ? 'rattle'
      : vessel === 'roll'
        ? 'rumble'
        : 'printer';

/**
 * 交棒給籤紙時要不要放鈴聲。
 *
 * 3D 籤筒不要：鈴聲是「抽到了」，該在號碼印上籤身那一格響（組件自己放），
 * 等到籤紙出來才響就晚了將近三秒 —— 這正是「聲音跟畫面沒對齊」。蓋章聲照舊留給籤紙。
 */
export const chimeAtSlip = (vessel: Vessel): boolean => vessel !== 'cylinder3d';

/**
 * 在題目框裡按 Enter 算不算抽籤。
 *
 * 印表機這些器具：Enter 等於按印鍵。3D 籤筒不行 —— 它的籤只能攪出來：Enter 直接抽，
 * 伺服器定了籤、phase 進 ejecting，籤筒卻從沒要過籤，拿籤的條件（攪夠了要過籤）永遠不成立，
 * ejecting 又不再記攪動量，就卡在「先攪一下再放手」出不去，只能重整。
 */
export const enterDraws = (vessel: Vessel): boolean => !isGestureDriven(vessel);

/**
 * 攪夠了去要籤、這一抽卻失敗了（題目太短、網路或 API 出錯）：要不要讓籤筒重新能攪。
 *
 * 以前「要過籤」一設就永遠不清，一次失敗之後怎麼攪都不會再抽，只能重整。
 * 籤已經到了（drawn）就絕不重來 —— 那支籤已經落庫，只能照它演完（AGENTS.md 第 4 條）。
 */
export const shouldRearmStir = (s: { requested: boolean; fault: boolean; drawn: boolean }): boolean =>
  s.requested && s.fault && !s.drawn;
