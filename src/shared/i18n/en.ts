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
  navBackToGame: 'Back to the machine',
  navSettings: 'Settings',
  shrineSettingsTitle: 'Shrine Settings',
  settingsClose: 'Close',
  settingsSoundDesc: 'Ambient bells and paper sounds',
  settingsMotionDesc: 'Falling petals and gentle sway effects',
  privacyNav: 'Privacy & data',
  railLeft: 'MODEL WY-36 · MADE IN CHINA',
  railRight: 'T H I R T Y - S I X   S T I C K S',
  footerSound: 'Sound {state}',
  footerSoundOn: 'on',
  footerSoundOff: 'off',
  footerMotion: 'Motion {state}',
  footerMotionReduced: 'reduced',
  footerMotionNormal: 'normal',
  footerNote: 'The stick offers a perspective. What you do next is up to you.',
  langSwitch: '中文',
  langSwitchLabel: '切换到简体中文',
  loading: 'Warming up the printer…',
  loadFailed: 'Cannot reach the service: {detail}',
  retry: 'Try again',
  restoring: 'Fetching your slip…',
  documentTitle: 'AI Fortune Stick',
  documentDescription:
    'AI Fortune Stick: write down what is on your mind, press the printer key, and receive one fixed reading to think with.',

  /* ── asking ── */
  askLabel: 'What would you like to ask?',
  askGhost: 'Write down the thing on your mind',
  emaCaption: 'EMA · MAKE A WISH',
  /* 例句寫短：手機上一句要擠進一塊木札（約 290px），太長會折兩行、三塊疊起來把籤筒擠小 */
  example1: 'How do I face the changes at work?',
  example2: 'Is this relationship still worth it?',
  example3: 'Is it time to start that long-held plan?',

  /* ── the printer LCD ── */
  lcdPrinting: 'Printing…',
  lcdWriteSomething: 'Write what is on your mind',
  lcdNoInterpreter: 'No interpreter connected',
  lcdPressKey: 'Press PRINT to begin',
  faultEmpty: 'Write down what you want to ask',
  faultTooShort: 'A few more characters (at least {min})',
  faultTooLong: 'Too long — keep it under {max} characters',
  printKeyCap: 'PRINT',
  printKeyIdle: 'Press the key to draw a stick',
  printKeyBusy: 'Printing',

  /* ── the result page ── */
  interpret: 'R E A D  I T',
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
  actionFollowUp: 'Ask a follow-up',
  /** 籤紙兩面紅帶右端的小木札：正面翻到解籤、背面翻回籤面 */
  flipToReading: 'Reading',
  flipToSlip: 'Slip',
  actionRestart: 'Draw another',

  /* ── follow-up ── */
  followUpEmpty: 'Ask another question about this same stick. The stick and its reading will stay the same.',
  followUpQuick1: 'What should I be paying attention to right now?',
  followUpQuick2: 'Where would I start?',
  followUpQuick3: 'What happens if I leave it for now?',
  followUpPlaceholder: 'Ask one more thing',
  followUpAnswering: 'Answering…',
  followUpLabel: 'Ask a follow-up',
  followUpSend: 'Send',
  followUpRoleUser: 'ASK',
  followUpRoleAgent: 'ANS',

  /* ── sharing ── */
  shareTitle: 'Share',
  shareClose: 'Close',
  shareNote:
    'The image holds only the number, level, couplet and one-line meaning. Your reading and follow-ups stay out of it.',
  shareIncludeQuestion: 'Show my question in the image',
  shareGo: 'Make the image and share',
  shareBusy: 'Making it…',
  shareShared: 'Handed to your system share sheet.',
  shareDownloaded: 'Image saved to your downloads.',
  shareFailed: 'The image did not come out this time. You can copy the text below instead.',

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
  historyFollowUps: 'Follow-ups',
  historyDelete: 'Delete this record',
  historyNoticeLabel: 'Worth noticing: ',
  historyActionLabel: 'One small thing you can do: ',

  /* ── privacy & data ── */
  privacyTitle: 'Privacy & data',
  privacyIntro:
    'This deployment does not use cookies, advertising trackers, pixels, or analytics. The notes below describe what this code actually stores and sends.',
  privacyStoredTitle: 'What the browser stores',
  privacyStoredRecords:
    'localStorage key wenyiqian.records: up to 100 reading records, including questions, stick numbers, readings, follow-up content, and timestamps.',
  privacyStoredPrefs:
    'localStorage keys wenyiqian.current and wenyiqian.prefs: the current reading ID, plus sound, motion, and interface-language preferences.',
  privacyStoredPassword:
    'sessionStorage key adminPassword: present only when ADMIN_PASSWORD is set for the deployment. It disappears when the tab closes and is sent in a request header, never in a cookie or URL.',
  privacyServerTitle: 'What the server stores',
  privacyServerReadings:
    'Cloudflare D1 tables readings and reading_messages: the question, fixed stick number, interpretation, interpretation error, follow-ups, statuses, and creation/update times.',
  privacyServerAgents:
    'D1 tables agents and connect_sessions: connected-agent names, descriptions, RPC URLs, verification state, expiry, and encrypted credentials plus short-lived authorization-flow data. Credentials are never returned to the browser.',
  privacyServerRetention:
    'Readings and follow-ups have no automatic application-level expiry. They remain until you delete them from History or the deployment operator clears the database. Authorization sessions normally expire after about 15 minutes; disconnecting an agent deletes its connection data.',
  privacyThirdPartyTitle: 'Third-party services',
  privacyManyfold:
    'When you ask for a reading, your question, the stick content, the existing reading, and follow-ups are sent to the Manyfold agent you connected. The connection flow also sends the app name and HTTPS site URL to Manyfold; agent tokens never reach the browser.',
  privacyFonts:
    'The page requests Noto Serif fonts from Google Fonts. Google handles those font requests; this app does not put your question or reading into a font request.',
  privacyCloudflare:
    'The site, Worker, and D1 run on Cloudflare. wrangler.jsonc also enables Cloudflare Worker observability, so Cloudflare may process request metadata, logs, and metrics under its platform service; this app adds no analytics or behavioral tracking.',
  privacyCookiesTitle: 'Cookies and analytics',
  privacyCookies:
    'This app does not set, read, or depend on cookies. It does not need an anonymous cross-request identifier, so there is no cookie expiry or cookie withdrawal action.',
  privacyAnalytics:
    'There is currently no Google Analytics, GTM, Meta Pixel, Sentry, Hotjar, PostHog, or other analytics script. Without a measurement ID, no analytics script or event is sent, so no extra consent banner is shown.',
  privacySharingTitle: 'What sharing exposes',
  privacySharing:
    'Sharing generates an image in your browser and hands it to the system share sheet or downloads it; this app has no public sharing service. The image may contain the stick number, level, poem, one-line meaning, an optional question, and a QR code. Whoever receives the image can see whatever you included, and the receiving platform has its own handling.',
  privacyControlsTitle: 'Controls, withdrawal, and deletion',
  privacyControls:
    'You can delete one or all records from History. You can also clear this device’s reading records, current ID, preferences, and tab-scoped admin password here. Clearing browser data does not delete records already on the server; History separately attempts to delete the matching D1 records.',
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
  settingsExpiresAt: ' · authorization expires {time}',
  settingsReverify: 'Verify again',
  settingsChecking: 'Checking…',
  settingsDisconnectConfirm: 'Confirm disconnect',
  settingsKeep: 'Keep',
  settingsDisconnect: 'Disconnect',
  settingsMoreTitle: 'Connect another agent',
  settingsMoreNote:
    'Re-authorizing an agent that is already connected swaps its token in place — useful when an authorization expires.',
  settingsAboutTitle: 'About this deployment',
  settingsAboutBody:
    'Agent tokens are AES-GCM encrypted in D1 and are never sent to the browser. ADMIN_PASSWORD protects agent-management operations on this settings page only; the game remains public. Setting CONFIG_ENCRYPTION_KEY keeps the encryption key out of the database. See the README.',

  /* ── connecting to Manyfold ── */
  connectStart: 'Connect a Manyfold agent',
  connectOpening: 'Opening…',
  connectPopupBlocked: 'The popup was blocked — use "Reopen the authorization page" below.',
  connectCodeLabel: 'Confirmation code',
  connectCodeNote:
    'Before you approve, check that Manyfold is showing this same code. It is the only way to know you are authorizing this application.',
  connectWaiting: 'Waiting for you to approve on Manyfold…',
  connectReopen: 'Reopen the authorization page',
  connectCancel: 'Cancel',
  connectIntro:
    'A Manyfold page will open, where you pick which agents to share with this application.',
  connectDenied: 'You declined this request on Manyfold.',
  connectExpired: 'That authorization has expired. Start again.',
  connectedCount: 'Connected {count} agent(s)',
  connectedNone: 'Approved, but no agent was shared',

  /* ── errors: the server returns a code, the copy lives here ── */
  errQuestionRequired: 'Write down what you want to ask before drawing.',
  errQuestionTooShort: 'That is too short — write at least {min} characters.',
  errQuestionTooLong: 'That is too long — keep it under {max} characters.',
  errNoInterpreter:
    'No agent is connected to read the sticks. Connect a Manyfold agent on the settings page first.',
  errReadingNotFound: 'This drawing cannot be found. It may already have been cleared.',
  errNotInterpreted: 'Read the stick first, then ask a follow-up.',
  errMessageRequired: 'Write something before sending.',
  errMessageTooLong: 'Keep a follow-up under {followUpMax} characters.',
  errManyfoldUnavailable: 'The agent did not answer this time. Try again in a moment.',
  errManyfoldRejected: 'The agent refused this request.',
  errAdminPasswordInvalid: 'This deployment requires the admin password.',
  errInternal: 'Something went wrong. Try again.',
  errUnknown: 'Something went wrong. Try again.',
  fallbackUnparseable:
    'The reading did not come back in the expected shape, so here is this stick’s general text.',
} satisfies Copy;
