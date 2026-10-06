export function Spinner({ size = 32, color }: { size?: number; color?: string }) {
  return (
    <svg className="spinner" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={color ? { color } : undefined}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Loader({ label }: { label: string }) {
  return (
    <div className="loader" role="status">
      <Spinner size={32} />
      <span className="loader__label">{label}</span>
    </div>
  );
}
