import type { RoomSnapshot } from '@cityguess/shared';

/** Logo beat before round 1, or the "Revanche demandée par X" beat (§21, §33). */
export function StartingScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  return (
    <div className="screen screen--deep starting" data-testid="starting">
      <div className="screen__center">
        {snapshot.rematchBy ? (
          <>
            <span className="t-label cg-pop">Revanche</span>
            <p className="starting__by cg-up">Revanche demandée par {snapshot.rematchBy}</p>
            <p className="t-body">Nouveaux lieux, mêmes joueurs.</p>
          </>
        ) : (
          <span className="intro__logo">CITYGUESS</span>
        )}
      </div>
    </div>
  );
}
