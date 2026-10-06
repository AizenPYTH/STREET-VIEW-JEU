import { getAvatar } from '@cityguess/shared';

interface PlayerAvatarProps {
  avatar: string;
  name: string;
  size?: 22 | 24 | 26 | 34 | 36 | 44 | 72 | 96;
  dim?: boolean;
  ring?: boolean;
  className?: string;
}

/** Shape + initial letter. The shape carries identity as much as the colour (§12). */
export function PlayerAvatar({ avatar, name, size = 36, dim = false, ring = false, className = '' }: PlayerAvatarProps) {
  const def = getAvatar(avatar);
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      className={`pav pav--${def.shape} ${dim ? 'pav--dim' : ''} ${className}`}
      style={{ ['--pav-size' as string]: `${size}px`, ['--pav-color' as string]: def.color }}
      aria-hidden="true"
    >
      {ring && <span className="pav__ring" />}
      <span className={`pav__shape pav__shape--${def.shape}`} />
      <span className="pav__initial">{initial}</span>
    </span>
  );
}
