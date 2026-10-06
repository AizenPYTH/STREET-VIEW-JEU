import { avatarEmoji } from '@cityguess/shared';

interface AvatarProps {
  avatar: string;
  color: string;
  size?: number;
  dimmed?: boolean;
  className?: string;
  badge?: 'host' | 'check' | 'offline' | null;
}

export function Avatar({ avatar, color, size = 48, dimmed = false, className = '', badge = null }: AvatarProps) {
  return (
    <span
      className={`avatar ${dimmed ? 'avatar--dimmed' : ''} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.5, ['--avatar-color' as string]: color }}
      aria-hidden="true"
    >
      <span className="avatar__emoji">{avatarEmoji(avatar)}</span>
      {badge === 'host' && <span className="avatar__badge avatar__badge--host" title="Host">👑</span>}
      {badge === 'check' && <span className="avatar__badge avatar__badge--check">✓</span>}
      {badge === 'offline' && <span className="avatar__badge avatar__badge--offline" />}
    </span>
  );
}
