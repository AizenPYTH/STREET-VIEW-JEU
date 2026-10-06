export function Logo({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  return (
    <span className={`logo logo--${size}`} aria-label="CityGuess">
      <svg className="logo__pin" viewBox="0 0 512 512" aria-hidden="true">
        <path d="M256 92c-62 0-112 50-112 112 0 84 112 216 112 216s112-132 112-216c0-62-50-112-112-112z" fill="currentColor" />
        <circle cx="256" cy="204" r="46" fill="#0A0D14" />
        <circle cx="256" cy="204" r="20" fill="currentColor" />
      </svg>
      <span className="logo__word">
        CITY<span className="logo__accent">GUESS</span>
      </span>
    </span>
  );
}
