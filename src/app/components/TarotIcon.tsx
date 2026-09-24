/**
 * The Tarot app's own mark (its favicon: a card face down, deep blue with a
 * star), drawn after the words of the link that goes there so the destination
 * is recognisable at a glance. Decorative: the words already say where it goes.
 */
export default function TarotIcon() {
  return (
    <svg className="app-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="tarot-icon-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4d74d8" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#002c8b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="#002c8b" />
      <circle cx="16" cy="16" r="11" fill="url(#tarot-icon-glow)" />
      <rect x="3.1" y="3.1" width="25.8" height="25.8" rx="4.6" fill="none" stroke="#f2f5ff" strokeWidth="1.1" opacity="0.85" />
      <path
        d="M16 6.8 17.15 13.23 20.81 11.19 18.77 14.85 25.2 16 18.77 17.15 20.81 20.81 17.15 18.77 16 25.2 14.85 18.77 11.19 20.81 13.23 17.15 6.8 16 13.23 14.85 11.19 11.19 14.85 13.23Z"
        fill="#f2f5ff"
      />
    </svg>
  );
}
