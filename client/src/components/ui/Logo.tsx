export function Logo({ inline = false }: { inline?: boolean }) {
  if (inline) {
    return (
      <span className="logo" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} aria-label="CityGuess">
        <span className="logo__mark logo__mark--inline" />
        <span className="logo__word logo__word--inline">CITYGUESS</span>
      </span>
    );
  }
  return (
    <div className="logo" aria-label="CityGuess">
      <span className="logo__mark cg-pop" />
      <h1 className="logo__word cg-up" style={{ animationDelay: '0.15s' }}>
        CITY
        <br />
        GUESS
      </h1>
    </div>
  );
}
