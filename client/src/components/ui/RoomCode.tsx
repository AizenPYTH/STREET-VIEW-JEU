import { useState } from 'react';
import { Button } from './Button';
import { CopyIcon, ShareIcon } from './Icons';

interface RoomCodeProps {
  code: string;
  shareUrl: string;
}

export function RoomCode({ code, shareUrl }: RoomCodeProps) {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* clipboard unavailable: the code stays readable on screen */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const share = async (): Promise<void> => {
    const data = { title: 'CityGuess', text: `Rejoins ma room CityGuess avec le code ${code}`, url: shareUrl };
    try {
      if (typeof navigator.share === 'function') await navigator.share(data);
      else await navigator.clipboard.writeText(`${data.text} — ${shareUrl}`);
    } catch {
      /* cancelled */
    }
  };

  return (
    <section className="room-code" data-testid="room-code-card">
      <span className="t-label">Code de la room</span>
      <span className="room-code__value" data-testid="room-code">
        {code}
      </span>
      <div className="room-code__actions">
        <Button variant="secondary" icon={copied ? undefined : <CopyIcon width={18} height={18} />} onClick={() => void copy()} data-testid="copy-code">
          {copied ? '✓ Copié' : 'Copier'}
        </Button>
        <Button variant="secondary" icon={<ShareIcon width={18} height={18} />} onClick={() => void share()}>
          Partager
        </Button>
      </div>
    </section>
  );
}
