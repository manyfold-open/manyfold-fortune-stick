/**
 * 36 支原创签，两种语言。
 *
 * 这份数据是「问一签」的内容底座，浏览器和 Worker 都会读它：Worker 抽签、组装提示词，
 * 浏览器显示签诗、生成分享图、渲染求签记录。所以它放在 src/shared 下，两端同源。
 *
 * 规则（对应产品文档第三节）：
 *  - 签号、等级、签诗、核心含义、通用解释、行动方向都由游戏预先写好；
 *  - AI 只负责结合用户的问题做个性化解读，不能改动这里的任何一个字；
 *  - `general` / `action` 同时是 AI 不可用时的兜底文案，所以每一条都必须能独立成话。
 *
 * 语气基线：上上签说机会与顺势，下签说放慢、观察、调整，不做恐吓，也不预言必然发生的事。
 *
 * 英文那一套是**写**出来的，不是翻出来的。签诗尤其如此：七言的对仗搬进英文只会变成
 * 一句解释，所以英文取同一个意象，自己成一副对句。两种语言各自要能单独成立 ——
 * 一个英文用户从头到尾不会看到一个汉字。
 */

import type { Language } from './lang';

export type StickLevel = '上上签' | '上签' | '中签' | '下签';

/** 一支签在某一种语言下的全部文字。两种语言的形状完全一样。 */
export interface StickText {
  /** 签名。中文是四个字，英文是一个同样意象的短语。 */
  title: string;
  /** 两句签诗。中文是七言，英文是两行能自己成立的对句 —— 不是逐字直译。 */
  poem: [string, string];
  /** 一句话签意：用浅显的话解释这支签的核心意思。 */
  meaning: string;
  /** 通用解释：不知道用户问题时也成立的一段话。 */
  general: string;
  /** 行动方向：具体、今天就能做的一件小事。 */
  action: string;
}

export interface FortuneStick {
  /** 签号 1–36，与数组下标 +1 一致。 */
  no: number;
  /**
   * 等级。这是**键**，不是显示文字 —— LEVEL_TONE、TONE_BY_LEVEL 都按它索引，
   * 所以它在两种语言下都保持中文。要显示给人看的名字查 LEVEL_LABEL。
   */
  level: StickLevel;
  zh: StickText;
  en: StickText;
}

/** 等级给人看的名字。中文就是等级本身，英文是纸票上那一行大写字。 */
export const LEVEL_LABEL: Record<Language, Record<StickLevel, string>> = {
  zh: { 上上签: '上上签', 上签: '上签', 中签: '中签', 下签: '下签' },
  en: {
    上上签: 'GREAT FORTUNE',
    上签: 'GOOD FORTUNE',
    中签: 'MIDDLING',
    下签: 'POOR FORTUNE',
  },
};

/** 取一支签在某种语言下的文字。除了这里，没有别处直接读 stick.zh / stick.en。 */
export const stickText = (stick: FortuneStick, language: Language): StickText =>
  language === 'en' ? stick.en : stick.zh;

export const STICKS: readonly FortuneStick[] = [
  {
    no: 1,
    level: '上上签',
    zh: {
      title: '云开月明',
      poem: ['久阴忽散一天青', '明月当空照旧盟'],
      meaning: '等了很久才看不清的事，现在开始有清楚的样子了。',
      general:
        '长期不明朗的局面正在松动，先前你自己的判断多半没有错，只是缺一个能看清的时机。这时候适合把想法往前推一步，而不是继续观望。顺势走，但仍按步骤来。',
      action: '把一直搁着没动的那件事，今天写下它的第一步。',
    },
    en: {
      title: 'Clouds Part, Moon Clear',
      poem: [
        'Long overcast, and then the whole sky turns blue',
        'The moon comes back and keeps the old promise',
      ],
      meaning: 'Something you could not see clearly for a long time is taking shape.',
      general:
        'A long stretch of not knowing is ending. What changed is less your situation than your view of it: the parts that were guesswork are turning into things you can check. Your earlier read was probably right, it just lacked a moment clear enough to confirm. This is the time to push a thought one step further rather than keep watching. Move with it, but keep to your own order of steps.',
      action: 'Take the thing you have been putting off and write down its first step today.',
    },
  },
  {
    no: 2,
    level: '上签',
    zh: {
      title: '春江舟轻',
      poem: ['春江水暖舟自轻', '两岸青山送一程'],
      meaning: '环境正在帮你，走起来会比你想的省力。',
      general:
        '外部条件比你估计的更友善，之前觉得费劲，多半是因为起步时用力过猛。现在可以少推一点、多借一点力，把节奏放回正常速度，反而走得更远。',
      action: '找一个已经在做类似事情的人，问他一个具体问题。',
    },
    en: {
      title: 'Spring River, Light Boat',
      poem: [
        'The spring water warms and the boat rides high',
        'Green hills on both banks see you part of the way',
      ],
      meaning: 'Conditions are working for you, and this will cost less effort than you expect.',
      general:
        'The circumstances around you are friendlier than your estimate of them. If the early going felt heavy, that was probably your own grip rather than the current. You can push less now and borrow more, and the ordinary pace will carry you further than the forced one did. Let the help that is available actually reach you instead of proving you did it unaided.',
      action: 'Find someone already doing something similar and ask them one specific question.',
    },
  },
  {
    no: 3,
    level: '上签',
    zh: {
      title: '枯木回春',
      poem: ['老枝曾道无生意', '一夜东风满树芽'],
      meaning: '你以为过去了的事，还留着可以接续的部分。',
      general:
        '被搁置或看似失败的东西没有完全作废，里面有一部分仍然有用。与其重头再来，不如先回去看看旧的材料、旧的关系、旧的经验，从中挑出还能用的那一块。',
      action: '翻回你三个月前的记录，挑出一条现在仍然成立的。',
    },
    en: {
      title: 'Old Wood, New Buds',
      poem: [
        'They said the old branch had nothing left in it',
        'One night of east wind and the whole tree is budding',
      ],
      meaning: 'Something you filed away as finished still has a live part you can pick up.',
      general:
        'What you shelved or counted as a failure did not expire entirely, and some portion of it still works. Starting from nothing is more expensive than it looks. Go back through the old drafts, the old contacts and the old hard-won lessons first, and pull out the one piece that still holds. Building on it is not clinging to the past, it is refusing to pay twice.',
      action: 'Open your notes from three months ago and pick out one line that is still true.',
    },
  },
  {
    no: 4,
    level: '上签',
    zh: {
      title: '登高望远',
      poem: ['拾级未觉山已高', '回头方见路迢迢'],
      meaning: '你比自己以为的走得远，只是缺一次回头看。',
      general:
        '进展是有的，但因为一直埋头往前，感觉不到。现在适合停一下，把走过的路整理成看得见的东西，你会更清楚下一段该往哪个方向使劲。',
      action: '用十分钟列出今年已经完成的三件事。',
    },
    en: {
      title: 'Higher Than You Thought',
      poem: [
        'Step after step, you never felt the climb',
        'Only turning round do you see how far the road ran',
      ],
      meaning: 'You have come further than you think. What is missing is one look backwards.',
      general:
        'There is progress. You cannot feel it because you have had your head down the whole way, and effort spent is much easier to notice than ground covered. This is a good moment to stop and turn what you have done into something you can actually see. Once it is visible, the direction for the next stretch usually picks itself.',
      action: 'Spend ten minutes listing three things you have finished this year.',
    },
  },
  {
    no: 5,
    level: '中签',
    zh: {
      title: '静水深流',
      poem: ['水面无风似不行', '底下潜流自有程'],
      meaning: '表面看没动静，其实事情在底下走着。',
      general:
        '这段时间外在反馈少，容易让人怀疑方向。但沉默不等于停滞，很多变化要到后面才显形。此时不必急着换路，把注意力放回可以自己掌握的部分。',
      action: '给这件事定一个检查点：到某个日期再判断，不是今天。',
    },
    en: {
      title: 'Still Water, Deep Current',
      poem: [
        'No wind on the surface, and it seems to stand still',
        'Underneath, the current is keeping its own schedule',
      ],
      meaning: 'Nothing shows on the surface, but the thing is moving underneath.',
      general:
        'Feedback is thin at the moment, and thin feedback makes people doubt the direction rather than the measurement. Silence is not the same as stalling; a good deal of what is happening will only become visible later. There is no need to change route yet. Put your attention back on the parts that are actually yours to move.',
      action: 'Set a checkpoint: pick a date to judge this by, and let today off the hook.',
    },
  },
  {
    no: 6,
    level: '下签',
    zh: {
      title: '守株待兔',
      poem: ['旧桩空守日又斜', '兔子从来不再来'],
      meaning: '让你舒服的老办法，这次可能不管用了。',
      general:
        '你正在用过去成功过的方式应对一件已经变了的事。不必否定过去的经验，但它需要更新。放慢一点，先弄清楚现在的条件跟当初哪里不一样，再决定动作。',
      action: '写下这件事跟上一次相比，有哪一个条件已经变了。',
    },
    en: {
      title: 'Waiting By The Stump',
      poem: [
        'Another day leans west beside the same old stump',
        'The hare that ran into it once does not come twice',
      ],
      meaning: 'The familiar approach that has always worked may not fit this time.',
      general:
        'You are meeting a changed situation with a method that earned its place in an older one. The experience is not worthless and does not need throwing out, but it does need updating. Slow down before you act and work out exactly which conditions are different from last time. Comfort is a poor guide here precisely because the approach feels proven.',
      action: 'Write down one condition that has changed since the last time you did this.',
    },
  },
  {
    no: 7,
    level: '中签',
    zh: {
      title: '雨后寻径',
      poem: ['雨歇泥深路未干', '缓行一步稳一步'],
      meaning: '事情刚过去，现在适合慢慢走。',
      general:
        '风波刚过，地面还软，这时候急着跑容易滑。眼下的重点不是做大决定，而是把状态和秩序先恢复过来。等站稳了，再考虑要不要加速。',
      action: '今天只做一件恢复性的小事：睡够、清桌面，或回一封欠着的信息。',
    },
    en: {
      title: 'Finding The Path After Rain',
      poem: [
        'The rain has stopped, the mud is deep, the road still wet',
        'One slow step, and then one steady step',
      ],
      meaning: 'Something has just passed. This is a good stretch to walk rather than run.',
      general:
        'The disturbance is over but the ground under it is still soft, and running on soft ground is how people slip. What matters now is not a large decision; it is getting your footing, your sleep and your ordinary order back. Recovery looks like doing nothing and is not nothing. Once you are standing properly, you can decide whether to speed up.',
      action: 'Do one restorative small thing today: sleep enough, clear your desk, or answer one overdue message.',
    },
  },
  {
    no: 8,
    level: '上签',
    zh: {
      title: '玉在石中',
      poem: ['顽石未剖谁人识', '一朝开处见玲珑'],
      meaning: '你手上有好东西，只是还没被人看见。',
      general:
        '价值已经存在，缺的是呈现。如果你觉得被低估，多半不是能力问题，而是别人没有机会看到全貌。与其继续打磨，不如先让它露出来一次。',
      action: '把你做的东西讲给一个还不了解它的人听，看他先问什么。',
    },
    en: {
      title: 'Jade Inside The Stone',
      poem: [
        'Uncut, the rough stone tells no one what it holds',
        'Split it open once and the whole grain shows',
      ],
      meaning: 'What you are holding is good. It simply has not been seen yet.',
      general:
        'The value is already there; what is missing is presentation. If you feel underrated, the cause is usually not your ability but that nobody has had the chance to see the whole of it. More polishing will not fix that, and past a point it becomes a way of postponing the exposure. Let it out once, imperfect, and find out what people actually see.',
      action: 'Explain what you are making to someone who knows nothing about it and notice what they ask first.',
    },
  },
  {
    no: 9,
    level: '上上签',
    zh: {
      title: '水到渠成',
      poem: ['沟渠久掘水未来', '一雨盈盈自入怀'],
      meaning: '前面的准备够了，剩下的是等它自己发生。',
      general:
        '该铺的路你已经铺了，现在最容易犯的错是因为心急而再加一道动作，反而打乱节奏。保持现有的做法，把力气留给真正需要你出手的那一刻。',
      action: '今天什么都不追加，只把已经答应别人的事按时交出去。',
    },
    en: {
      title: 'The Channel Fills',
      poem: [
        'The ditch was dug long ago and stayed dry',
        'One good rain, and it fills itself to the brim',
      ],
      meaning: 'The preparation is done. What remains is letting it happen.',
      general:
        'You have laid the groundwork, and the likeliest mistake now is adding one more move out of impatience and disturbing a rhythm that was working. Extra effort at this stage is not neutral; it can undo the thing it means to help. Hold to what you are already doing and save your strength for the moment that genuinely needs you.',
      action: 'Add nothing today. Just deliver what you already promised, on time.',
    },
  },
  {
    no: 10,
    level: '中签',
    zh: {
      title: '寒梅待春',
      poem: ['一树寒梅未肯开', '不是无花是未时'],
      meaning: '不是不行，是还没到时候。',
      general:
        '你判断的方向大概率没问题，但时间点错了。这种时候勉强推进，代价会比等待高。把准备继续做下去，同时留意外部条件的变化，时机到了再全力出手。',
      action: '列出三个「等到什么就动手」的具体信号。',
    },
    en: {
      title: 'Winter Plum, Waiting',
      poem: [
        'The plum tree in the cold refuses to open',
        'Not that it has no flowers, only that it is not the hour',
      ],
      meaning: 'It is not that this will not work. It is that the hour has not come.',
      general:
        'Your read on the direction is probably sound and your read on the timing is not. Forcing something through in this kind of window costs more than waiting does, and the cost is usually paid in credibility rather than in effort. Keep preparing, keep watching the outside conditions, and commit fully once the moment actually arrives.',
      action: 'Write down three specific signals that would mean it is time to start.',
    },
  },
  {
    no: 11,
    level: '下签',
    zh: {
      title: '逆风行舟',
      poem: ['帆满风来船反退', '不如收篷候晚晴'],
      meaning: '现在用力越猛，消耗越大。',
      general:
        '阻力来自你控制不了的地方，硬顶只会耗掉你的余力。这不是要你放弃，而是把目标从「推进」换成「保存」：守住手上最重要的一件，其余先放。',
      action: '从现在的待办里划掉一件，今天就别做了。',
    },
    en: {
      title: 'Sailing Into The Wind',
      poem: [
        'Sails full, wind against her, and the boat slides back',
        'Better to reef and wait for the evening to clear',
      ],
      meaning: 'The harder you push right now, the more it costs you.',
      general:
        'The resistance is coming from somewhere you do not control, and pressing into it spends the reserve you will want later. This is not an instruction to give up. It is a change of goal, from advancing to holding: protect the one thing that matters most and let the rest wait. Weather like this passes on its own schedule, not on yours.',
      action: 'Cross one item off your list and simply do not do it today.',
    },
  },
  {
    no: 12,
    level: '中签',
    zh: {
      title: '灯下寻针',
      poem: ['灯前苦觅一针影', '却在阶前草上明'],
      meaning: '你可能找错了地方，答案在旁边。',
      general:
        '力气花了不少，却没有结果，往往是因为问题被框在了一个太窄的范围里。换个角度看，会发现你要的东西一直在视线之外。先别加码，先换位置。',
      action: '把你的问题换一种问法重写一遍，看看还是不是同一件事。',
    },
    en: {
      title: 'Searching Under The Lamp',
      poem: [
        'All evening hunting one needle in the lamplight',
        'It was out on the step, shining in the grass',
      ],
      meaning: 'You may be looking in the wrong place. The answer is off to one side.',
      general:
        'Plenty of effort and no result usually means the question has been framed too narrowly, not that you have searched too little. People look where the light is. Shift your angle and the thing you wanted often turns out to have been just outside the lit circle the whole time. Do not add effort yet; change position first.',
      action: 'Rewrite your question a different way and see whether it is still the same question.',
    },
  },
  {
    no: 13,
    level: '中签',
    zh: {
      title: '渡口候船',
      poem: ['野渡无人舟自横', '坐看江头几度潮'],
      meaning: '现在轮不到你决定，等也是一种做事。',
      general:
        '关键在别人那边，你能做的是把自己这边准备齐。等待容易让人焦躁，但真正消耗你的往往不是等待本身，而是反复设想各种结果。',
      action: '给等待设一个期限，到期还没消息就主动问一次。',
    },
    en: {
      title: 'Waiting At The Crossing',
      poem: [
        'No ferryman at the wild crossing, the boat lies sideways',
        'Sit and watch the tide come up the river a few times',
      ],
      meaning: 'This one is not yours to decide yet. Waiting is also a way of doing it.',
      general:
        'The decision sits with someone else, and your part is to have your own side ready when it comes. Waiting makes people restless, but what actually drains you is rarely the wait itself. It is rehearsing each possible outcome in turn, which costs as much as the real thing and settles nothing.',
      action: 'Put a deadline on the waiting, and if there is no word by then, ask once.',
    },
  },
  {
    no: 14,
    level: '上签',
    zh: {
      title: '旧路新桥',
      poem: ['溪断行人愁十载', '今朝一桥度春秋'],
      meaning: '卡住很久的地方，出现了新的走法。',
      general:
        '原来绕不过去的障碍，现在多了一个解法，可能来自新的人、新的工具或新的规则。不必执着于当初的走法，能过去就是好路。',
      action: '把你当初放弃的理由拿出来，逐条检查它现在还成不成立。',
    },
    en: {
      title: 'New Bridge, Old Road',
      poem: [
        'The stream cut the road and troubled travellers ten years',
        'This morning one bridge carries the seasons across',
      ],
      meaning: 'Somewhere you were stuck for a long time, a new way through has appeared.',
      general:
        'The obstacle that could not be gone around now has a solution, and it has probably arrived from outside you: a new person, a new tool, a rule that changed while you were not watching. There is no prize for crossing by the route you first picked. Any road that gets you over is a good road.',
      action: 'Dig out the reasons you gave up last time and check each one against today.',
    },
  },
  {
    no: 15,
    level: '中签',
    zh: {
      title: '沙中淘金',
      poem: ['十斗黄沙淘一粒', '手酸终见寸光来'],
      meaning: '有收获，但需要你愿意筛。',
      general:
        '机会是有的，只是混在大量无效信息和无效尝试里。这个阶段拼的不是聪明，而是耐心和筛选标准。标准越清楚，浪费的力气越少。',
      action: '写下一条筛选标准，用它过滤掉今天一半的选项。',
    },
    en: {
      title: 'Gold In The Sand',
      poem: [
        'Ten measures of sand washed down to a single grain',
        'Your arms ache, and then the small light shows',
      ],
      meaning: 'There is something here, but only if you are willing to sift.',
      general:
        'The opportunity exists and it is mixed into a great deal of noise and a great many attempts that will lead nowhere. What this stage rewards is not cleverness but patience and a clear filter. The sharper your criteria, the less effort you waste, and vague criteria are what turn sifting into drudgery.',
      action: 'Write down one filtering rule and use it to cut half of your options today.',
    },
  },
  {
    no: 16,
    level: '中签',
    zh: {
      title: '风中执灯',
      poem: ['夜行手上一星火', '护得住时路自明'],
      meaning: '你需要保护的是自己的状态，不是速度。',
      general:
        '外界的干扰比平时多，这种时候能不能走下去，取决于你还剩多少心力。减少同时进行的事情，把注意力收回到一两件上，比咬牙全扛更稳。',
      action: '今晚关掉一个持续消耗你注意力的来源。',
    },
    en: {
      title: 'A Flame In The Wind',
      poem: [
        'Walking at night with one spark in your hand',
        'Keep it alive and the road lights itself',
      ],
      meaning: 'What needs protecting is your own state, not your speed.',
      general:
        'There is more interference around you than usual, and whether you keep going depends on how much attention you have left rather than how determined you are. Cut the number of things running at once and pull your focus back to one or two. That holds up better than gritting your teeth and carrying all of it.',
      action: 'Switch off one thing tonight that has been steadily draining your attention.',
    },
  },
  {
    no: 17,
    level: '上签',
    zh: {
      title: '囊中之锥',
      poem: ['锥处囊中尖自出', '不须高唱已惊人'],
      meaning: '做得好会被看见，不用急着争。',
      general:
        '你担心自己被忽略，但现在真正起作用的是作品本身而不是声量。与其把力气花在解释和比较上，不如把手上这件做到别人无法忽视。',
      action: '挑出你最拿得出手的一件事，今天把它再往前推一点。',
    },
    en: {
      title: 'The Awl In The Bag',
      poem: [
        'An awl in a cloth bag finds its own way through',
        'It never had to raise its voice to be noticed',
      ],
      meaning: 'Good work gets seen. You do not have to fight for the floor.',
      general:
        'You are worried about being overlooked, but the thing carrying weight at the moment is the work itself rather than the volume around it. Effort spent explaining and comparing yourself tends to come straight out of the effort that would have made the point unarguable. Make this one impossible to ignore instead.',
      action: 'Pick the piece of work you are proudest of and push it one step further today.',
    },
  },
  {
    no: 18,
    level: '下签',
    zh: {
      title: '石上栽花',
      poem: ['移花来种青石上', '朝朝浇水不生根'],
      meaning: '力气没白费，但用错了地方。',
      general:
        '你的投入是真的，只是这块土壤接不住。继续加码不会改变结果。现在最有价值的判断是分清哪些是你能改的，哪些从一开始就不属于你能改的范围。',
      action: '诚实写下一句：这件事里，哪一部分不取决于我？',
    },
    en: {
      title: 'Planting On Stone',
      poem: [
        'You moved the flower and set it on bare rock',
        'Watered every morning, and still it takes no root',
      ],
      meaning: 'The effort is real. The place you are putting it is not right.',
      general:
        'What you have put in is genuine, and this particular ground cannot hold it. Adding more will not change that, because the limit is not in your commitment. The valuable judgement available to you now is the boundary itself: which parts of this are yours to change, and which were never inside that range to begin with.',
      action: 'Write one honest sentence: which part of this does not depend on me?',
    },
  },
  {
    no: 19,
    level: '上上签',
    zh: {
      title: '开门见山',
      poem: ['推窗便是好山色', '何须迂回问旁人'],
      meaning: '答案比你想的直接，你其实已经知道了。',
      general:
        '你反复权衡，多半不是因为信息不够，而是因为不想承认自己已经有了倾向。把那个倾向说出来，很多复杂的比较会立刻失去意义。',
      action: '对一个信得过的人，一句话说出你真正想选的那个。',
    },
    en: {
      title: 'Open The Door, The Mountain',
      poem: [
        'Push the window open and the good hills are simply there',
        'Why go the long way round asking everyone else',
      ],
      meaning: 'The answer is more direct than you think, and you already have it.',
      general:
        'You keep weighing this up, and the reason is rarely a shortage of information. It is that you do not want to admit you already lean one way. Say the leaning out loud and most of the elaborate comparison collapses, because it was never really deciding anything. Knowing is not the hard part here.',
      action: 'Tell one person you trust, in a single sentence, which one you actually want.',
    },
  },
  {
    no: 20,
    level: '下签',
    zh: {
      title: '井中观天',
      poem: ['坐井长看一片云', '误将寸碧作乾坤'],
      meaning: '现在看到的，可能只是很小的一块。',
      general:
        '手上的信息不足以支撑一个大决定，但焦虑会让人急着下结论。这时候最该做的不是决定，而是把视野扩大一点：多问一个人，多看一个例子。',
      action: '今天找一个和你立场不同的人，听他怎么看这件事。',
    },
    en: {
      title: 'Sky From A Well',
      poem: [
        'Sitting in the well, watching one cloud go by',
        'Mistaking that inch of blue for the whole of heaven',
      ],
      meaning: 'What you can see right now is probably only a small piece of it.',
      general:
        'You do not yet have enough to support a decision of this size, and anxiety pushes people to conclude rather than to look. The useful move is not deciding faster; it is widening the frame by a little. One more person asked, one more example examined, and the shape of the thing often changes more than another week of thinking would change it.',
      action: 'Find someone today whose position differs from yours and hear how they see it.',
    },
  },
  {
    no: 21,
    level: '中签',
    zh: {
      title: '结网临渊',
      poem: ['临渊羡鱼终无获', '退而结网未为迟'],
      meaning: '想要的东西没错，缺的是工具。',
      general:
        '你盯着结果看得很清楚，却还没有准备好拿到它的手段。现在退一步做准备，不是放弃，而是把成功率从碰运气换成可重复。',
      action: '列出拿到它必须具备的三样东西，先补最缺的那样。',
    },
    en: {
      title: 'Go Back And Make The Net',
      poem: [
        'Standing at the edge envying the fish catches nothing',
        'Step back and knot a net, it is not too late',
      ],
      meaning: 'You want the right thing. What is missing is the means to get it.',
      general:
        'You can see the outcome clearly, which is not the same as being equipped to reach it. Stepping back to build the capability is not a retreat from the goal; it converts your odds from a matter of luck into something you can repeat. Wanting it more intensely is the one input that will not move this.',
      action: 'List the three things you would need in order to get it, and start on the one you lack most.',
    },
  },
  {
    no: 22,
    level: '上签',
    zh: {
      title: '夜航见灯',
      poem: ['四野茫茫不辨程', '忽逢塔火一点明'],
      meaning: '会有一个人或一条信息，帮你把方向定下来。',
      general:
        '迷茫是真的，但这段时间里你会遇到一个有用的参照——可能是一次谈话、一份资料、一个先走过的人。留意它，不要因为忙而错过。',
      action: '主动联系一个走过类似路的人，约十五分钟。',
    },
    en: {
      title: 'A Light At Night',
      poem: [
        'Open dark on all sides and no way to read the distance',
        'Then a tower light, one point of it, holding steady',
      ],
      meaning: 'A person or a piece of information will help you fix your direction.',
      general:
        'The disorientation is real, and somewhere in this stretch you will come across a useful reference point: a conversation, a document, someone who has already walked this. These tend to arrive quietly and get missed by people who are too busy to notice them. Stay alert to it rather than waiting for something more obvious.',
      action: 'Reach out to someone who has walked a similar road and ask for fifteen minutes.',
    },
  },
  {
    no: 23,
    level: '下签',
    zh: {
      title: '闭门造车',
      poem: ['闭户三年成一器', '推门方知辙不同'],
      meaning: '做得很认真，但缺少外面的反馈。',
      general:
        '你把标准定在自己心里，时间一长就容易偏。现在的风险不是不努力，而是努力的方向没有被校准过。越早拿出去，修正的成本越低。',
      action: '把半成品拿给一个真实用户或同行看，只问一句哪里不对。',
    },
    en: {
      title: 'Building Behind Closed Doors',
      poem: [
        'Three years behind a shut door and the thing is finished',
        'Push the door open and the wheel ruts are a different width',
      ],
      meaning: 'The work is serious. What it lacks is contact with the outside.',
      general:
        'You have been holding the standard in your own head, and over time that drifts without announcing itself. The risk here is not that you are working too little; it is that the direction has never been calibrated against anything external. The earlier you expose it, the cheaper the correction, and the cost of waiting compounds quietly.',
      action: 'Show the half-finished thing to one real user or peer and ask only what is wrong with it.',
    },
  },
  {
    no: 24,
    level: '中签',
    zh: {
      title: '竹节缓生',
      poem: ['一节一节向上长', '看似迟迟实有章'],
      meaning: '慢是它本来的速度，不是你出了问题。',
      general:
        '这类事情本身就需要时间累积，中间还会有看起来毫无进展的停顿。把评价标准从「今天有没有变化」换成「这个月有没有推进」，你会好过很多。',
      action: '设一个每周固定的小复盘，只记录做了什么。',
    },
    en: {
      title: 'Bamboo, Joint By Joint',
      poem: [
        'It grows the way bamboo grows, one joint at a time',
        'It looks slow, and it is keeping to its own order',
      ],
      meaning: 'Slow is the natural speed here. It is not a sign that you are doing it wrong.',
      general:
        'Work of this kind accumulates rather than accelerates, and it includes pauses where nothing visible happens at all. Those pauses are structural, not symptoms. Change what you measure: ask whether the month moved instead of whether today did, and the same progress will stop reading as failure.',
      action: 'Set a short weekly review whose only job is recording what you did.',
    },
  },
  {
    no: 25,
    level: '中签',
    zh: {
      title: '良田待雨',
      poem: ['田畴整整种已齐', '只欠天边一片云'],
      meaning: '你能做的都做了，剩下的看条件。',
      general:
        '准备是到位的，结果却取决于你控制不了的那部分。这不是坏事，说明你已经走到了努力的边界。接下来要练的是允许一部分事情不由自己决定。',
      action: '把「等待中」的事单独列一张表，不再天天翻。',
    },
    en: {
      title: 'Good Field, Waiting For Rain',
      poem: [
        'The field is level, the rows are in, the sowing done',
        'All that is wanting is one cloud at the edge of the sky',
      ],
      meaning: 'You have done what was yours to do. The rest depends on conditions.',
      general:
        'The preparation is sound and the outcome now turns on something you do not control. That is not a bad sign; it means you have reached the edge of what effort can reach, which most people never get to. The skill this asks for next is unfamiliar and learnable: letting a part of it not be up to you.',
      action: 'Put everything you are waiting on into its own list, and stop checking it daily.',
    },
  },
  {
    no: 26,
    level: '上签',
    zh: {
      title: '破茧',
      poem: ['茧薄何须人代剖', '挣开方得两翅轻'],
      meaning: '难受的部分是过程本身，不是出错了。',
      general:
        '眼下的吃力来自转变，而不是失败。如果这时候有人替你把所有阻力拿掉，你反而会少掉一部分需要长出来的能力。撑住这一段，别急着找捷径。',
      action: '把你最想逃开的那一步，今天先做十分钟。',
    },
    en: {
      title: 'Out Of The Cocoon',
      poem: [
        'The shell is thin, and no one should cut it for you',
        'The struggle out is what leaves the wings light',
      ],
      meaning: 'The uncomfortable part is the process itself, not evidence of a mistake.',
      general:
        'What is hard right now comes from changing, not from failing, and the two feel almost identical from the inside. If someone removed every obstacle for you here, you would arrive without the capacity the obstacles were building. Stay with this stretch a while longer rather than going looking for a shortcut around it.',
      action: 'Take the step you most want to avoid and give it ten minutes today.',
    },
  },
  {
    no: 27,
    level: '中签',
    zh: {
      title: '逢桥下马',
      poem: ['过桥不必急着行', '下马徐徐路自平'],
      meaning: '到了关键的一小段，值得放慢。',
      general:
        '整件事里有一两个节点特别要紧，其他部分其实没那么敏感。分清楚这个差别，把谨慎留给真正重要的地方，别把力气平均花掉。',
      action: '指出这件事中最不可逆的一步，为它多留一天时间。',
    },
    en: {
      title: 'Dismount At The Bridge',
      poem: [
        'Crossing the bridge is no place to hurry',
        'Get down, walk it slowly, and the road stays level',
      ],
      meaning: 'You have reached the short stretch that matters. It is worth slowing for.',
      general:
        'One or two points in this carry most of the risk and the rest is far more forgiving than you are treating it as. Spreading caution evenly across everything is how people arrive at the dangerous part already tired. Work out which is which, and spend the care where it actually changes the outcome.',
      action: 'Name the least reversible step in this and give it one extra day.',
    },
  },
  {
    no: 28,
    level: '下签',
    zh: {
      title: '火中取栗',
      poem: ['炉中栗子香扑鼻', '伸手才知火未消'],
      meaning: '看着划算的那件事，代价藏在后面。',
      general:
        '眼前的机会确实诱人，但你可能只算了收益没算成本，尤其是时间、关系和退出的难度。不必立刻拒绝，先把代价写清楚再决定。',
      action: '写下如果这件事不成，你会损失什么、能不能承受。',
    },
    en: {
      title: 'Chestnuts In The Fire',
      poem: [
        'The chestnuts in the brazier smell worth reaching for',
        'Your hand goes in and finds the coals are still live',
      ],
      meaning: 'The deal that looks favourable is keeping its cost out of sight.',
      general:
        'The opportunity in front of you is genuinely attractive, and you have probably priced the upside without pricing what it takes: time, relationships, and how hard it would be to get back out. None of that means refuse. It means write the cost down plainly first, and decide with both columns visible.',
      action: 'Write down what you would lose if this did not work, and whether you could absorb it.',
    },
  },
  {
    no: 29,
    level: '上上签',
    zh: {
      title: '顺流千里',
      poem: ['轻舟已过重山外', '一日千帆水自东'],
      meaning: '方向对了，速度会自己跟上来。',
      general:
        '难的部分已经过去，现在的顺利不是运气，是前面积累的结果。此时可以放心地把摊子铺开一点，同时留意别在顺境里丢掉当初让你走到这里的习惯。',
      action: '写下一条你不想因为变顺利而丢掉的习惯，贴在看得见的地方。',
    },
    en: {
      title: 'A Thousand Miles Downstream',
      poem: [
        'The light boat is already past the last of the ranges',
        'A thousand sails in a day, and the water runs east',
      ],
      meaning: 'The direction is right. Speed will take care of itself.',
      general:
        'The hard part is behind you, and how easy this feels now is not luck; it is what the earlier work bought. You can widen the scope with some confidence. The risk specific to a good stretch is quiet: the habits that got you here are the first thing people drop once they stop feeling necessary.',
      action: 'Write down one habit you do not want to lose now things are easier, and put it somewhere visible.',
    },
  },
  {
    no: 30,
    level: '中签',
    zh: {
      title: '早行遇雾',
      poem: ['晓发轻雾满前村', '日出时分自见门'],
      meaning: '现在看不清是暂时的，别在雾里做大决定。',
      general:
        '信息还在变动，此刻做的判断很可能过几天就要推翻。与其反复纠结，不如做些不管结果如何都有用的事，把决定留到能看清的时候。',
      action: '今天只做一件无论结果如何都不会白费的事。',
    },
    en: {
      title: 'Early Road, Morning Fog',
      poem: [
        'Setting out at dawn, light fog over the village ahead',
        'By sunrise the gate shows itself without being searched for',
      ],
      meaning: 'Not being able to see is temporary. Do not make the big decision in fog.',
      general:
        'The information is still moving, and a judgement made now stands a good chance of being overturned within the week. Going round the same loop again will not resolve that. Spend the time on things that pay off regardless of which way it lands, and leave the decision until you can actually see.',
      action: 'Do one thing today that will not be wasted no matter how this turns out.',
    },
  },
  {
    no: 31,
    level: '上签',
    zh: {
      title: '剪枝得果',
      poem: ['繁枝剪去三分绿', '来岁枝头果自稠'],
      meaning: '舍掉一些，剩下的才长得好。',
      general:
        '你手上同时进行的事太多，每一件都还不错，所以难以取舍。但资源是有限的，现在减少数量不是损失，而是让重要的那几件真正长出来。',
      action: '从正在做的事里选一件今天暂停，并告诉相关的人。',
    },
    en: {
      title: 'Prune For Fruit',
      poem: [
        'Cut a third of the green off the crowded branch',
        'Next year the fruit comes in thick along the wood',
      ],
      meaning: 'Give some of it up, and what is left will finally grow properly.',
      general:
        'You have too many things running at once and each of them is decent, which is exactly what makes cutting hard. Nothing here is bad enough to obviously drop. But the resource is finite, and reducing the count is not a loss; it is the only way the few that matter get enough to actually come to something.',
      action: 'Pick one thing you are doing, pause it today, and tell the people it affects.',
    },
  },
  {
    no: 32,
    level: '上签',
    zh: {
      title: '借力过山',
      poem: ['独行山高步步难', '结伴翻岭不觉长'],
      meaning: '这件事不必你一个人扛。',
      general:
        '你习惯自己解决，所以没想过开口。但这件事里有一部分，别人做起来比你快得多。把它交出去，不会显得你不行，反而让整件事更快落地。',
      action: '挑一件你不擅长的小事，今天请一个人帮忙。',
    },
    en: {
      title: 'Over The Ridge Together',
      poem: [
        'Alone, the mountain is high and every step is work',
        'With company you are over the ridge before it felt long',
      ],
      meaning: 'You do not have to carry this one by yourself.',
      general:
        'You are used to solving things alone, so asking has not really occurred to you as an option. There is a part of this that someone else would finish in a fraction of the time it will take you. Handing it over does not read as incapacity to anyone but you, and it gets the whole thing standing sooner.',
      action: 'Pick one small task you are bad at and ask someone for help with it today.',
    },
  },
  {
    no: 33,
    level: '中签',
    zh: {
      title: '种豆得豆',
      poem: ['春日种豆秋得豆', '不种黄粱莫问收'],
      meaning: '结果会如实反映你投入的东西。',
      general:
        '没有意外之喜，也不会有无故的损失。如果对现在的结果不满意，往回看投入的方向比往前看运气更有用。调整种什么，比调整怎么等更要紧。',
      action: '算一算过去一个月，时间实际花在了哪三件事上。',
    },
    en: {
      title: 'Beans For Beans',
      poem: [
        'Plant beans in spring and in autumn you get beans',
        'Sow no millet, then ask nothing of the harvest',
      ],
      meaning: 'The result will report back, accurately, on what you put in.',
      general:
        'There is no windfall here and no unearned loss either. If you are unhappy with where this has landed, looking back at what you actually fed it will tell you more than looking forward at luck. Changing what you plant matters considerably more than changing how patiently you wait for it.',
      action: 'Work out which three things actually took your time over the past month.',
    },
  },
  {
    no: 34,
    level: '中签',
    zh: {
      title: '回头是岸',
      poem: ['行到水穷疑无路', '回身一步是平川'],
      meaning: '退回去一点不是失败，是找到路的方式。',
      general:
        '你可能在一条走不通的路上投入太多，因此不愿回头。但沉没的部分已经沉没了，继续往前的代价通常比退回一步大。改主意是能力，不是认输。',
      action: '把「如果现在重新开始，我还会这么选吗」老实回答一遍。',
    },
    en: {
      title: 'The Shore Is Behind You',
      poem: [
        'Walk to where the water ends and doubt there is a road',
        'Turn round, take one step, and the plain opens out',
      ],
      meaning: 'Going back a little is not losing. It is how the road gets found.',
      general:
        'You have probably put too much into a route that does not go through, which is precisely why turning round feels intolerable. What is spent is spent either way. Carrying on usually costs more from here than stepping back does. Changing your mind is a capability, not a concession.',
      action: 'Answer this honestly: if I were starting fresh today, would I still choose this?',
    },
  },
  {
    no: 35,
    level: '下签',
    zh: {
      title: '独木过溪',
      poem: ['一木横溪水正急', '不如绕行三里桥'],
      meaning: '有更稳的走法，只是要多花点时间。',
      general:
        '当下这条路可行但风险偏高，一旦失手代价不小。多绕一段看起来慢，实际上更可能到。判断的关键是：万一出问题，你还有没有第二次机会。',
      action: '为这件事准备一个退路，写下它具体是什么。',
    },
    en: {
      title: 'The Single Log',
      poem: [
        'One log across the stream and the water running fast',
        'Better the bridge, three miles round, and dry feet',
      ],
      meaning: 'There is a steadier way across. It only costs you some extra time.',
      general:
        'The route in front of you would work and it carries more risk than it looks like carrying, with a real price attached to slipping. Going round appears slower and is considerably more likely to get you there. The question that settles it is simple: if this goes wrong, do you get a second attempt?',
      action: 'Prepare a fallback for this and write down specifically what it is.',
    },
  },
  {
    no: 36,
    level: '中签',
    zh: {
      title: '守拙藏锋',
      poem: ['锋芒敛处身自安', '不争此时争岁长'],
      meaning: '这一阵先稳住，不必急着表态。',
      general:
        '周围的节奏比较乱，现在冒头容易被卷进不属于你的争执里。把重心放回自己的事情上，少解释、少站队，时间会替你说明很多东西。',
      action: '今天有一场不必参与的讨论，就安静地不参与。',
    },
    en: {
      title: 'Keep The Edge Sheathed',
      poem: [
        'Where the blade is kept covered, the body stays safe',
        'Do not contend for this hour, contend for the long year',
      ],
      meaning: 'Hold steady through this stretch. There is no need to declare yourself yet.',
      general:
        'Things around you are disordered at the moment, and standing up right now mostly gets you pulled into arguments that were never yours. Put your weight back on your own work, explain less, take fewer sides. A good deal of what you would be defending gets settled by time without your help.',
      action: 'There is a discussion today you do not need to join. Quietly do not join it.',
    },
  },
];

/** 按签号取签；签号越界时返回 null。 */
export function stickByNo(no: number): FortuneStick | null {
  return STICKS.find((stick) => stick.no === no) ?? null;
}

export const STICK_COUNT = STICKS.length;
