/**
 * Interface copy (English). Same keys as zh.ts, enforced by `satisfies Copy`.
 *
 * This is the machine talking. The slip and the reading are not here — they
 * follow the language of the question (src/shared/sticks.ts).
 */
import type { Copy } from './zh';

export const en = {
  /* ── shell ── */
  brandSub: 'FORTUNE PRINTER',
  navHistory: 'Your slips',
  navBackToGame: 'Back to the machine',
  railLeft: 'MODEL WY-36 · MADE IN CHINA',
  railRight: 'T H I R T Y - S I X   S T I C K S',
  footerSound: 'Sound {state}',
  footerSoundOn: 'on',
  footerSoundOff: 'off',
  footerMotion: 'Motion {state}',
  footerMotionReduced: 'reduced',
  footerMotionNormal: 'normal',
  footerNote: 'A stick is a reference. The walking is yours.',
  langSwitch: '中文',
  langSwitchLabel: '切换到简体中文',
  loading: 'Warming up the printer…',
  loadFailed: 'Cannot reach the service: {detail}',
  retry: 'Try again',
  restoring: 'Fetching your slip…',
  documentTitle: 'Fortune Printer',
  documentDescription:
    'Write down what is on your mind, press the key on the printer, and it prints a fortune stick for you. A small online fortune-stick game.',

  /* ── asking ── */
  askLabel: 'What you want to ask',
  askGhost: 'Write down the thing on your mind',
  emaCaption: 'EMA · MAKE A WISH',
  example1: 'How should I handle the recent changes at work?',
  example2: 'Is this relationship still worth putting myself into?',
  example3: 'Is now the time to start the thing I keep thinking about?',

  /* ── the printer LCD ── */
  lcdPrinting: 'Printing…',
  lcdWriteSomething: 'Write what is on your mind',
  lcdNoInterpreter: 'No interpreter connected',
  lcdPressKey: 'Press PRINT to begin',
  faultEmpty: 'Write down what you want to ask',
  faultTooShort: 'A few more characters (at least {min})',
  faultTooLong: 'Too long — keep it under {max} characters',
  printKeyCap: 'PRINT',
  printKeyIdle: 'Press the key to print this stick',
  printKeyBusy: 'Printing',

  /* ── the result page ── */
  interpret: 'R E A D  I T',
  interpreting: 'Reading your stick',
  reinterpreting: 'Reading it again',
  retryInterpret: 'Try reading again',
  retrying: 'Retrying…',
  fallbackNote: 'This one could not be read against your question.',
  /** 解籤續頁頂上那條朱紅帶。跟四個小標題一樣，跟這一局的語言走。 */
  sheetBand: 'READING',
  blockMeaning: 'What the stick says',
  blockAnswer: 'On your question',
  blockNotice: 'Worth noticing',
  blockAction: 'One small thing you can do',
  actionShare: 'Share',
  actionShareClose: 'Close sharing',
  actionFollowUp: 'Ask a follow-up',
  actionFollowUpClose: 'Close follow-up',
  actionRestart: 'Draw another',

  /* ── follow-up ── */
  followUpEmpty: 'Keep asking about this same stick. Neither it nor the reading will change.',
  followUpQuick1: 'What should I be paying attention to right now?',
  followUpQuick2: 'Where would I start?',
  followUpQuick3: 'What happens if I leave it for now?',
  followUpPlaceholder: 'Ask one more thing',
  followUpAnswering: 'Answering…',
  followUpLabel: 'Ask a follow-up',
  followUpSend: 'Send',

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
  historyEmpty: 'Nothing on this device yet. The sticks you draw will stay here.',
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

  /* ── password gate ── */
  gateTitle: 'Admin password required',
  gateBody: 'This deployment has ADMIN_PASSWORD set. Enter it to continue.',
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
    'Agent tokens are AES-GCM encrypted in D1 and are never sent to the browser. Setting ADMIN_PASSWORD locks the whole site, game included, behind a password. Setting CONFIG_ENCRYPTION_KEY keeps the encryption key out of the database. See the README.',

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
