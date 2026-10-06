import { getCity, type RoomSnapshot } from '@cityguess/shared';

/** Logo beat before round 1, or the "Revanche demandée par X" beat (§21, §33), with a real loading line. */
export function StartingScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const city = getCity(snapshot.settings.cityId);
  const loading = (
    <span className="starting__label">
      Préparation de {city?.name ?? 'la ville'}
      <span className="dots">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </span>
  );
  return (
    <div className="screen screen--deep starting" data-testid="starting">
      <div className="screen__center">
        {snapshot.rematchBy ? (
          <>
            <span className="t-label cg-pop">Revanche</span>
            <p className="starting__by cg-up">Revanche demandée par {snapshot.rematchBy}</p>
            <p className="t-body">Nouveaux lieux, mêmes joueurs.</p>
            {loading}
          </>
        ) : (
          <>
            <span className="intro__logo">CITYGUESS</span>
            {loading}
          </>
        )}
      </div>
    </div>
  );
}
