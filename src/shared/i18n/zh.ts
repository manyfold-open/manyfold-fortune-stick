/**
 * 界面文案（简体中文）。这张表是基准：`Copy` 的形状由它推出来，
 * en.ts 用 `satisfies Copy` 约束，漏掉任何一个键都编译不过。
 *
 * 这里只放「机器说的话」—— 按钮、屏上的提示、记录页和设置页的外壳。
 * 签纸上的字和 AI 写的解读不在这里，它们跟着问题的语言走（src/shared/sticks.ts）。
 *
 * 占位符写成 {name}，两种语言必须用同一组占位符（tests/i18n.test.ts 会查）。
 *
 * 屏上那截状态码（READY / PRINT / E-01）不在这里：它们是机器码，不是文案，
 * 两种语言下都一样，写在 FortuneGame 里就够了。
 */
export const zh = {
  /* ── 外壳 ── */
  brandSub: 'FORTUNE PRINTER',
  navHistory: '求签记录',
  navBackToGame: '回到求签',
  railLeft: 'MODEL WY-36 · MADE IN CHINA',
  railRight: '三 十 六 签 · 一 问 一 答',
  footerSound: '声音{state}',
  footerSoundOn: '开',
  footerSoundOff: '关',
  footerMotion: '动画{state}',
  footerMotionReduced: '已减少',
  footerMotionNormal: '正常',
  footerNote: '签为参考，路要自己走',
  langSwitch: 'EN',
  langSwitchLabel: 'Switch to English',
  loading: '正在预热打印机…',
  loadFailed: '连不上服务：{detail}',
  retry: '重试',
  restoring: '正在取回你的签…',
  documentTitle: '问一签',
  documentDescription:
    '写下心里的事，按下打印机上的按钮，印一张属于你的签。问一签是一个轻量的在线求签游戏。',

  /* ── 提问 ── */
  askLabel: '你想问的事',
  askGhost: '写下你心里的那件事',
  emaCaption: '絵馬 · 心願',
  example1: '我该如何面对最近的工作变化？',
  example2: '这段关系还值得我继续投入吗？',
  example3: '现在是开始做那件想了很久的事的时候吗？',

  /* ── 打印机的屏 ── */
  lcdPrinting: '正在打印…',
  lcdWriteSomething: '写下你心里的事',
  lcdNoInterpreter: '解签服务未连接',
  lcdPressKey: '按下印键，开始打印',
  faultEmpty: '先写下你想问的事',
  faultTooShort: '再多写几个字（至少 {min} 字）',
  faultTooLong: '太长了，请收在 {max} 字以内',
  printKeyCap: '印',
  printKeyIdle: '按下按钮，打印这一签',
  printKeyBusy: '正在打印',

  /* ── 结果页 ── */
  interpret: '解 签',
  interpreting: '正在解签',
  reinterpreting: '正在重新解签',
  retryInterpret: '重试解签',
  retrying: '重试中…',
  fallbackNote: '这次没能结合你的问题解读。',
  /** 解籤續頁頂上那條朱紅帶。跟四個小標題一樣，跟這一局的語言走。 */
  sheetBand: '解 签',
  blockMeaning: '一句话签意',
  blockAnswer: '回应你的问题',
  blockNotice: '值得留意',
  blockAction: '可以做的一件小事',
  actionShare: '分享结果',
  actionShareClose: '收起分享',
  actionFollowUp: '继续追问',
  actionFollowUpClose: '收起追问',
  actionRestart: '再求一签',

  /* ── 追问 ── */
  followUpEmpty: '就着这支签往下问，签和解读都不会变。',
  followUpQuick1: '我现在最该注意什么？',
  followUpQuick2: '可以从哪一步开始？',
  followUpQuick3: '如果先不动会怎样？',
  followUpPlaceholder: '再问一句',
  followUpAnswering: '正在回答…',
  followUpLabel: '继续追问',
  followUpSend: '发送',

  /* ── 分享 ── */
  shareTitle: '分享结果',
  shareClose: '收起',
  shareNote: '图片里只有签号、等级、签诗和一句话签意，不包含你的解读和追问。',
  shareIncludeQuestion: '在图片中显示我的问题',
  shareGo: '生成并分享',
  shareBusy: '生成中…',
  shareShared: '已经交给系统分享。',
  shareDownloaded: '图片已保存到下载。',
  shareFailed: '图片这次没生成出来，可以先复制下面这段文字。',

  /* ── 记录 ── */
  historyTitle: '求签记录',
  historyEmpty: '这台设备上还没有记录。求过的签会留在这里。',
  historyGoDraw: '去求一签',
  historyClear: '清空全部',
  historyClearConfirm: '确认清空',
  historyCancel: '取消',
  historyLocalNote: '记录只保存在这台设备的浏览器里。',
  historyExpand: '展开',
  historyCollapse: '收起',
  historyNoReading: '这一次没有解签。',
  historyFollowUps: '追问',
  historyDelete: '删除这条记录',
  historyNoticeLabel: '值得留意：',
  historyActionLabel: '可以做的一件小事：',

  /* ── 密码门 ── */
  gateTitle: '需要管理密码',
  gateBody: '这个部署设置了 ADMIN_PASSWORD，输入后才能继续。',
  gateLabel: '管理密码',
  gateWrong: '密码不对。',
  gateSubmit: '解锁',
  gateChecking: '检查中…',

  /* ── 设置页 ── */
  settingsTitle: '设置',
  settingsUrlOnly: '这一页只有 #settings 这个地址能进，游戏界面上不显示入口。',
  settingsAgentsTitle: '解签用的 agent',
  settingsNoAgents: '还没有连接 agent。连一个之后，「解签」才能结合用户的问题作答。',
  settingsMultiNote: '连了多个时，解签会自动用第一个已验证且未过期的。',
  settingsVerified: '已验证',
  settingsUnverified: '未验证',
  settingsConnectedAt: '{host} · 连接于 {time}',
  settingsExpiresAt: ' · 授权到期 {time}',
  settingsReverify: '重新验证',
  settingsChecking: '检查中…',
  settingsDisconnectConfirm: '确认断开',
  settingsKeep: '保留',
  settingsDisconnect: '断开',
  settingsMoreTitle: '连接更多 agent',
  settingsMoreNote: '重新授权一个已经连着的 agent 会就地换掉它的 token —— 授权过期时用得上。',
  settingsAboutTitle: '关于这个部署',
  settingsAboutBody:
    'agent 的 token 以 AES-GCM 加密存在 D1 里，任何时候都不会发到浏览器。设置 ADMIN_PASSWORD 可以把整个站（包括游戏）锁在密码后面，设置 CONFIG_ENCRYPTION_KEY 可以让加密密钥不落库。详见 README。',

  /* ── 连接 Manyfold ── */
  connectStart: '连接 Manyfold agent',
  connectOpening: '打开中…',
  connectPopupBlocked: '弹窗被拦截了 —— 用下面的「重新打开授权页面」。',
  connectCodeLabel: '确认码',
  connectCodeNote:
    '批准前先确认 Manyfold 页面上显示的是同一个码 —— 这是确认你授权的是这个应用的唯一方式。',
  connectWaiting: '等待你在 Manyfold 上批准…',
  connectReopen: '重新打开授权页面',
  connectCancel: '取消',
  connectIntro: '会弹出 Manyfold 的页面，在那里挑选要分享给这个应用的 agent。',
  connectDenied: '你在 Manyfold 上拒绝了这次请求。',
  connectExpired: '这次授权已经过期，重新来一次。',
  connectedCount: '已连接 {count} 个 agent',
  connectedNone: '已批准，但没有分享任何 agent',

  /* ── 错误：服务端只回 code，文案在这边 ── */
  errQuestionRequired: '先写下你想问的事，再开始摇签。',
  errQuestionTooShort: '问题太短了，至少写 {min} 个字。',
  errQuestionTooLong: '问题太长了，请控制在 {max} 个字以内。',
  errNoInterpreter: '解签的 agent 还没连上。先到设置页连接一个 Manyfold agent。',
  errReadingNotFound: '找不到这次求签，可能已经被清除了。',
  errNotInterpreted: '先解签，再继续追问。',
  errMessageRequired: '写点什么再发送。',
  errMessageTooLong: '追问请控制在 {followUpMax} 个字以内。',
  errManyfoldUnavailable: '解签的 agent 这次没能回应，过一会儿再试。',
  errManyfoldRejected: '解签的 agent 拒绝了这次请求。',
  errAdminPasswordInvalid: '这个部署需要管理密码。',
  errInternal: '出了点问题，再试一次。',
  errUnknown: '出了点问题，再试一次。',
  fallbackUnparseable: '解签内容没有按预期返回，先给你这支签的通用解释。',
} as const;

export type Copy = Record<keyof typeof zh, string>;
