/**
 * Interface copy (English). Same keys as zh.ts, enforced by `satisfies Copy`.
 *
 * This is the machine talking. The slip and the reading are not here — they
 * follow the language of the question (src/shared/sticks.ts).
 */
import type { Copy } from './zh';

export const en = {
  /* ── shell ── */
  brandTitle: 'Omikuji',
  brandSub: 'AI FORTUNE STICK',
  navHistory: 'Your slips',
  // 窄手機上頂欄只放得下這麼長（「Back to the machine」會把整頁撐寬、左右晃）。台上早就沒有機器了，是籤筒
  navBackToGame: 'Draw a stick',
  navSettings: 'Settings',
  shrineSettingsTitle: 'Shrine Settings',
  settingsClose: 'Close',
  settingsSoundDesc: 'Ambient bells and paper sounds',
  settingsMotionDesc: 'Falling petals and gentle sway effects',
  settingsSoundTitle: 'Shrine audio',
  settingsMotionTitle: 'Visual motion',
  settingsMotionActive: 'Active',
  settingsMotionCalm: 'Calm',
  settingsLanguageTitle: 'Language',
  privacyNav: 'Privacy & data',
  consentLabel: 'Analytics',
  consentLine:
    'We would like to use Google Analytics to see how the site is used and to measure our ads. Your question and your reading are never sent there.',
  consentAccept: 'Accept',
  consentDecline: 'Decline',
  consentMore: 'Privacy',
  railLeft: 'MODEL WY-36 · MADE IN CHINA',
  railRight: 'T H I R T Y   S I X   S T I C K S',
  footerSound: 'Sound {state}',
  footerSoundOn: 'on',
  footerSoundOff: 'off',
  footerMotion: 'Motion {state}',
  footerMotionReduced: 'reduced',
  footerMotionNormal: 'normal',
  footerNote: 'The stick offers a perspective. What you do next is up to you.',
  loading: 'Loading…',
  loadingSticks: 'Loading the sticks…',
  loadFailed: 'Cannot reach the service: {detail}',
  retry: 'Try again',
  restoring: 'Loading your last slip…',
  documentTitle: 'AI Fortune Stick',
  documentDescription:
    'AI Fortune Stick: write down what is on your mind, stir the fortune cylinder, and receive one fixed slip to think with.',

  /* ── asking ── */
  askLabel: 'What would you like to ask?',
  askGhost: 'Write the thing on your mind here',
  askDone: 'Done',
  emaCaption: 'EMA · MAKE A WISH',
  emaStreak: 'EMA · DAY {days} IN A ROW',
  /* 例句寫短：手機上一句要擠進一塊木札（約 290px），太長會折兩行、三塊疊起來把籤筒擠小 */
  // 每天來抽的人最常問的一句，放在第一塊：點一下就能攪，不必每天打字
  exampleToday: 'How does today look for me?',
  example1: 'How do I face the changes at work?',
  example2: 'Is this relationship still worth it?',

  /* ── the printer LCD ── */
  lcdPrinting: 'Printing…',
  lcdWriteSomething: 'Write what is on your mind',
  lcdNoInterpreter: 'No interpreter connected',
  lcdPressKey: 'Press PRINT to begin',
  faultEmpty: 'Write down what you want to ask',
  faultTooShort: 'A few more characters (at least {min})',
  faultTooLong: 'Too long, keep it under {max} characters',
  printKeyCap: 'PRINT',
  printKeyIdle: 'Press the key to draw a stick',
  printKeyBusy: 'Printing',

  /* ── the result page ── */
  // 字母之間本來就空一格；兩個詞之間用不斷行空格拉開，普通的兩個空格會被 HTML 摺成一個，讀起來像 READIT
  interpret: 'R E A D \u00A0 I T',
  interpreting: 'Reading your stick',
  reinterpreting: 'Reading it again',
  retryInterpret: 'Try reading again',
  retrying: 'Retrying…',
  fallbackNote: 'This reading could not be tailored to your question.',
  /** 解籤續頁頂上那條朱紅帶。跟四個小標題一樣，跟這一局的語言走。 */
  sheetBand: 'READING',
  blockMeaning: 'What this stick points to',
  blockAnswer: 'How it speaks to your question',
  blockNotice: 'One thing to keep in mind',
  blockAction: 'One thing you can do today',
  actionShare: 'Share',
  actionFollowUp: 'Ask more',
  /** 籤紙兩面紅帶右端的小木札：正面翻到解籤、背面翻回籤面 */
  flipToReading: 'Reading',
  flipToSlip: 'Slip',
  actionRestart: 'Draw another',
  actionTarotBridge: 'Ask your own Tarot question',
  tarotBridgeOpening: 'Preparing the Tarot link…',

  /* ── follow-up ── */
  followUpEmpty: 'Ask another question about this same stick. The stick and its reading will stay the same.',
  followUpQuick1: 'What should I be paying attention to right now?',
  followUpQuick2: 'Where would I start?',
  followUpQuick3: 'What happens if I leave it for now?',
  followUpPlaceholder: 'Ask one more thing',
  followUpAnswering: 'Answering…',
  followUpLabel: 'Ask more about this stick',
  followUpSend: 'Send',
  followUpRoleUser: 'ASK',
  followUpRoleAgent: 'ANS',

  /* ── sharing ── */
  shareTitle: 'Share',
  shareClose: 'Close',
  shareNote:
    'The image holds only the number, level, couplet and short meaning. Your reading and further questions stay out of it.',
  shareIncludeQuestion: 'Show my question in the image',
  shareGo: 'Make the image and share',
  shareBusy: 'Making it…',
  shareShared: 'Handed to your system share sheet.',
  shareDownloaded: 'Image saved to your downloads.',
  shareFailed: 'The image did not come out this time. You can copy the text below instead.',
  shareStory: 'Story size, 9:16',
  shareLinkNote: 'A link goes with it. Friends who open it see this stick, never your question or reading.',
  /* a stick a friend shared (?s=) */
  sharedEma: 'A friend shared this slip with you',
  sharedDrawOwn: 'Draw your own',

  /* ── history ── */
  historyTitle: 'Your slips',
  historyCaption: 'OMIKUJI',
  historyEmpty: 'No slips yet. Draw one and it will stay here on this device.',
  historyGoDraw: 'Go draw one',
  historyClear: 'Clear all',
  historyClearConfirm: 'Confirm clear',
  historyCancel: 'Cancel',
  historyLocalNote: 'These are kept only in this browser, on this device.',
  historyExpand: 'Open',
  historyCollapse: 'Close',
  historyNoReading: 'This one was never read.',
  historyFollowUps: 'Further questions',
  historyDelete: 'Delete this record',
  historyNoticeLabel: 'Worth noticing: ',
  historyActionLabel: 'One small thing you can do: ',

  /* ── privacy & data ── */
  privacyBadge: 'SHRINE · PRIVACY',
  privacyTitle: 'Privacy & data',
  privacyIntro:
    'There are no advertising pixels or session recordings here. The notes below describe what this code actually stores and sends, Google Analytics included when the deployment turns it on.',
  privacyStoredTitle: 'What the browser stores',
  privacyStoredRecords:
    'localStorage key wenyiqian.records: up to 100 reading records, including questions, stick numbers, readings, further questions, and timestamps.',
  privacyStoredPrefs:
    'localStorage keys wenyiqian.current and wenyiqian.prefs: the current reading ID, plus sound, motion, and interface language preferences. wenyiqian.consent keeps your answer about analytics, if you have given one.',
  privacyStoredPassword:
    'sessionStorage key adminPassword: present only when ADMIN_PASSWORD is set for the deployment. It disappears when the tab closes and is sent in a request header, never in a cookie or URL.',
  privacyServerTitle: 'What the server stores',
  privacyServerReadings:
    'Cloudflare D1 tables readings and reading_messages: the question, fixed stick number, interpretation, interpretation error, further questions, statuses, and creation/update times.',
  privacyServerAgents:
    'D1 tables agents and connect_sessions: the names of connected agents, descriptions, RPC URLs, verification state, expiry, and encrypted credentials, plus brief data from the authorisation flow. Credentials are never returned to the browser.',
  privacyServerRetention:
    'Readings and further questions never expire automatically within the app. They remain until you delete them from History or the deployment operator clears the database. Authorisation sessions normally expire after about 15 minutes; disconnecting an agent deletes its connection data.',
  privacyThirdPartyTitle: 'Outside services',
  privacyManyfold:
    'When you ask for a reading, your question, the stick content, the existing reading, and further questions are sent to the Manyfold agent you connected. The connection flow also sends the app name and HTTPS site URL to Manyfold; agent tokens never reach the browser.',
  privacyTarotBridge:
    'If you open Tarot from a reading finished today, a one day reward code is sent. It is a random code that says nothing about your reading, and never your question or interpretation. Tarot checks it with this site before granting the reward.',
  privacyFonts:
    'The page requests Noto Serif fonts from Google Fonts. Google handles those font requests; this app does not put your question or reading into a font request.',
  privacyCloudflare:
    'The site, Worker, and D1 run on Cloudflare. wrangler.jsonc also enables Cloudflare Worker observability, so Cloudflare may process request metadata, logs, and metrics under its platform service. That is separate from the analytics described below.',
  privacyCookiesTitle: 'Cookies and analytics',
  privacyCookies:
    'This app does not set, read, or depend on cookies. It does not need an anonymous identifier that persists between requests, so there is no cookie expiry or cookie withdrawal action.',
  privacyAnalytics:
    'There is currently no Google Analytics, GTM, Meta Pixel, Sentry, Hotjar, PostHog, or other analytics script. The site does keep its own daily totals, such as how many sticks were drawn or shared and whether a visit came from a shared link, a QR code, Tarot, a search engine or a social site. The site that sent you is reduced to such a category in your browser and never sent as an address. They are plain counts per day with nothing about who you are, what you asked or which stick you drew, so no consent banner is shown.',
  privacyCookiesGoogle:
    'This app itself does not set, read, or depend on cookies. The only cookies come from Google Analytics (_ga, and one named after this site’s measurement ID), and only once analytics storage is allowed. They hold a random identifier so that a return visit is recognised, and Google keeps them for up to two years.',
  privacyAnalyticsGoogle:
    'This deployment loads Google Analytics to see how the site is used and to measure its ads. It records the pages you open and five moments of a round: a stick drawn, a reading opened, a further question, a share, and a trip to Tarot. Your question and the text of your reading are never sent; an event says at most which language the round is in. The page address goes as it is, so a link a friend shared carries its stick number, never a question. In the EEA, the UK and Switzerland nothing is stored for analytics or advertising until you answer the line at the foot of the page (Google Consent Mode); elsewhere analytics starts on. Either way you can change it here.',
  privacyOwnCounts:
    'Apart from that, the site keeps its own daily totals, such as how many sticks were drawn or shared and whether a visit came from a shared link, a QR code, Tarot, a search engine or a social site. The site that sent you is reduced to such a category in your browser and never sent as an address. They are plain counts per day with nothing about who you are, what you asked or which stick you drew, and they need no consent.',
  privacyConsentOn: 'Analytics is on in this browser.',
  privacyConsentOff: 'Analytics is off in this browser.',
  privacyConsentAllow: 'Allow analytics',
  privacyConsentRefuse: 'Turn analytics off',
  privacySharingTitle: 'What sharing exposes',
  privacySharing:
    'Sharing generates an image in your browser and hands it to the system share sheet or downloads it; this app has no public sharing service. The image may contain the stick number, level, poem, short meaning, an optional question, and a QR code. Whoever receives the image can see whatever you included, and the receiving platform has its own handling.',
  privacyControlsTitle: 'Controls, withdrawal, and deletion',
  privacyControls:
    'You can delete one or all records from History. You can also clear this device’s reading records, current ID, preferences, and the admin password kept for this tab here. Clearing browser data does not delete records already on the server; History separately attempts to delete the matching D1 records.',
  privacyClearButton: 'Clear local data',
  privacyClearConfirm: 'Confirm clear',
  privacyClearCancel: 'Keep data',
  privacyCleared: 'Local data cleared.',

  /* ── password gate ── */
  gateTitle: 'Admin password required',
  gateBody: 'This deployment protects agent management with ADMIN_PASSWORD. Enter it to continue.',
  gateLabel: 'Admin password',
  gateWrong: 'That password is not right.',
  gateSubmit: 'Unlock',
  gateChecking: 'Checking…',

  /* ── settings ── */
  settingsTitle: 'Settings',
  settingsUrlOnly:
    'This page is reachable only at #settings. The game deliberately links nowhere to it.',
  settingsAgentsTitle: 'The agent that reads the sticks',
  settingsNoAgents:
    'No agent connected yet. Once one is, readings can answer the actual question that was asked.',
  settingsMultiNote:
    'With several connected, readings use the first one that is verified and unexpired.',
  settingsVerified: 'verified',
  settingsUnverified: 'unverified',
  settingsConnectedAt: '{host} · connected {time}',
  settingsExpiresAt: ' · authorisation expires {time}',
  settingsReverify: 'Verify again',
  settingsChecking: 'Checking…',
  settingsDisconnectConfirm: 'Confirm disconnect',
  settingsKeep: 'Keep',
  settingsDisconnect: 'Disconnect',
  settingsMoreTitle: 'Connect another agent',
  settingsMoreNote:
    'Authorising an agent that is already connected again swaps its token in place. This is useful when an authorisation expires.',
  settingsAboutTitle: 'About this deployment',
  settingsAboutBody:
    'Agent tokens are encrypted with AES GCM in D1 and are never sent to the browser. ADMIN_PASSWORD protects agent management operations on this settings page only; the game remains public. Setting CONFIG_ENCRYPTION_KEY keeps the encryption key out of the database. See the README.',

  /* ── daily counts on #settings ── */
  statsTitle: 'Daily numbers',
  statsNote:
    'Counts per Taipei day, kept by this site until proper analytics are set up. Only totals are stored, never who, what they asked or which stick. Each visit is counted once per browser tab; the site that sent a visitor is reduced to direct, search, social or other in the browser and never stored.',
  statsRangeLabel: 'How many days to show',
  statsDays: '{n} days',
  statsLoading: 'Loading the numbers…',
  statsRefresh: 'Refresh',
  statsRefreshing: 'Refreshing…',
  statsUpdatedAt: 'Updated {time}',
  statsTableLabel: 'Numbers by day',
  statsDay: 'Day',
  statsTotal: 'Total',
  statsGroupVisits: 'Visits',
  statsGroupOrganic: 'Organic',
  statsGroupCampaign: 'Campaigns',
  statsGroupTarot: 'With Tarot',
  statsGroupShare: 'Sharing',
  statsVisits: 'Visits',
  statsNewVisitors: 'New',
  statsReturning: 'Returning',
  statsDraws: 'Sticks drawn',
  statsDirect: 'Direct',
  statsSearch: 'Search',
  statsSocial: 'Social',
  statsOtherSites: 'Other sites',
  statsCampaign: 'Tagged links',
  statsOfThemDrew: 'of them drew',
  statsOrganic: 'Organic visits',
  statsFromTarot: 'Came from Tarot',
  statsToTarot: 'Sent to Tarot',
  statsClaims: 'Tarot rewards issued',
  statsFromShare: 'Came from a share',
  statsShares: 'Shared',
  statsScanned: 'By QR',
  statsLinked: 'By link',
  statsOldShares: 'Older share',
  statsCardVisitsDetail: 'new {fresh} · returning {back}',
  statsCardOrganicDetail: 'direct {direct} · search {search} · social {social} · other {other}; {drew} drew',
  statsCardDrew: '{n} of them drew a stick ({rate})',
  statsCardClaims: '{n} Tarot rewards issued',
  statsCardShareDetail: 'QR {qr} · link {link} · older {old}; {drew} drew',
  statsCardDrawsDetail: 'shared {n} times',
  statsTarotBreakdown:
    'Where Tarot visitors clicked: end of a reading {outro}, readings used up {locked}, Tarot share page {share}, other {other}.',
  statsHowTo:
    'Sent to Tarot counts every click on the Tarot link; Tarot rewards issued counts sticks finished that day whose reward went out, and whether it was used is recorded on the Tarot side. Tagged links are visits with a utm_source of their own, such as an ad, and are not counted as organic. Some apps do not say where a visitor came from, so they show as direct. Days before these numbers began are not shown.',

  /* ── connecting to Manyfold ── */
  connectStart: 'Connect a Manyfold agent',
  connectOpening: 'Opening…',
  connectPopupBlocked: 'The pop up was blocked. Use "Reopen the authorisation page" below.',
  connectCodeLabel: 'Confirmation code',
  connectCodeNote:
    'Before you approve, check that Manyfold is showing this same code. It is the only way to know you are authorising this application.',
  connectWaiting: 'Waiting for you to approve on Manyfold…',
  connectReopen: 'Reopen the authorisation page',
  connectCancel: 'Cancel',
  connectIntro:
    'A Manyfold page will open, where you pick which agents to share with this application.',
  connectDenied: 'You declined this request on Manyfold.',
  connectExpired: 'That authorisation has expired. Start again.',
  connectedCount: 'Connected {count} agent(s)',
  connectedNone: 'Approved, but no agent was shared',

  /* ── errors: the server returns a code, the copy lives here ── */
  errQuestionRequired: 'Write down what you want to ask before drawing.',
  errQuestionTooShort: 'That is too short. Write at least {min} characters.',
  errQuestionTooLong: 'That is too long. Keep it under {max} characters.',
  errNoInterpreter:
    'No agent is connected to read the sticks. Connect a Manyfold agent on the settings page first.',
  errReadingNotFound: 'This drawing cannot be found. It may already have been cleared.',
  errNotInterpreted: 'Read the stick first, then ask more.',
  errMessageRequired: 'Write something before sending.',
  errMessageTooLong: 'Keep a further question under {followUpMax} characters.',
  errManyfoldUnavailable: 'The agent did not answer this time. Try again in a moment.',
  errManyfoldRejected: 'The agent refused this request.',
  errAdminPasswordInvalid: 'This deployment requires the admin password.',
  errInternal: 'Something went wrong. Try again.',
  errUnknown: 'Something went wrong. Try again.',
  fallbackUnparseable:
    'The reading did not come back in the expected shape, so here is this stick’s general text.',

  /* ── hints on the cylinder and the two other vessels (they follow the vessel's language) ── */
  cylFailed: 'This browser cannot run the 3D cylinder. Switch to the retro printer above.',
  cylAskFirst: 'Write your question on the ema above first',
  cylDrawn: '✦ Your stick is drawn ✦',
  cylLetGo: 'A stick is up. Let go to draw',
  cylComing: 'A stick is coming up…',
  cylStir: 'Stir them round…',
  cylMore: 'Just a few more circles',
  cylHint: 'Hold and stir the sticks, let go when ready',
  cylAria: 'Stir the sticks in the 3D fortune cylinder',
  tubeAria: 'Interactive 3D Fortune Cylinder',
  tubeAsk: 'Write your thoughts above to consult',
  tubePutBackAria: 'Put stick back into cylinder',
  tubePutBack: 'Put Back / Reselect',
  tubeConfirmAria: 'Confirm Stick #{n}',
  tubeConfirm: 'Confirm Stick #{n}',
  tubeStirring: 'Stirring the cylinder... tap any stick to draw',
  tubeDragHint: 'Drag to stir sticks · Tap any stick to inspect',
  tubeShaking: 'Shaking the bamboo tallies in 3D...',
  tubeDrawn: '✦ Lucky stick drawn in 3D! Revealing oracle... ✦',
  rollFailed: 'This browser cannot run the 3D press. Switch to the retro printer above.',
  rollAria: 'Interactive 3D woodblock fortune press',
  rollAsk: 'Write your thoughts above to ink the block',
  rollReady: 'Move left and right to steer the press · Click to set it rolling',
  rollRolling: 'The block turns, the paper runs…',
  rollDone: '✦ The impression is set. Reading your fortune… ✦',
} satisfies Copy;
