import { formatDistance, formatPoints, type City } from '@cityguess/shared';

export interface ShareCardData {
  city: City;
  code: string;
  winnerName: string;
  winnerPoints: number;
  myName: string;
  myRank: number;
  playerCount: number;
  bestGuessMeters: number | null;
  rounds: number;
  won: boolean;
}

const W = 1080;
const H = 1920;

/** Draws the 1080×1920 result card (phase 2 §23–24) and returns it as a PNG blob. */
export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  try {
    await Promise.all([document.fonts.load('800 120px "Bricolage Grotesque"'), document.fonts.load('700 60px "JetBrains Mono"')]);
  } catch {
    /* system fallback fonts */
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  ctx.fillStyle = '#15130f';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 900);
  glow.addColorStop(0, 'rgba(94,230,224,0.18)');
  glow.addColorStop(1, 'rgba(94,230,224,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 1000);

  // Brand mark
  ctx.fillStyle = '#5ee6e0';
  ctx.beginPath();
  ctx.moveTo(140, 120);
  ctx.lineTo(200, 180);
  ctx.lineTo(140, 240);
  ctx.lineTo(80, 180);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#15130f';
  ctx.beginPath();
  ctx.arc(140, 180, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5ee6e0';
  ctx.beginPath();
  ctx.arc(140, 180, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '800 64px "Bricolage Grotesque", system-ui, sans-serif';
  ctx.fillStyle = '#f3efe6';
  ctx.textBaseline = 'middle';
  ctx.fillText('CITYGUESS', 230, 182);

  const mono = (size: number, weight = 700): string => `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`;
  const display = (size: number, weight = 800): string => `${weight} ${size}px "Bricolage Grotesque", system-ui, sans-serif`;

  ctx.textBaseline = 'alphabetic';
  ctx.font = mono(34, 500);
  ctx.fillStyle = '#9a938a';
  ctx.fillText(`${data.city.name.toUpperCase()} · ${data.rounds} MANCHES`, 80, 400);
  ctx.font = display(150);
  ctx.fillStyle = '#f3efe6';
  ctx.fillText(data.city.flag, 80, 560);

  ctx.font = mono(36, 500);
  ctx.fillStyle = '#f0b45a';
  ctx.fillText('🏆 VAINQUEUR', 80, 720);
  ctx.font = display(140);
  ctx.fillStyle = '#f3efe6';
  ctx.fillText(data.winnerName.toUpperCase().slice(0, 12), 80, 860);
  ctx.font = mono(84);
  ctx.fillStyle = '#5ee6e0';
  ctx.fillText(`${formatPoints(data.winnerPoints)} PTS`, 80, 980);

  const tiles: [string, string][] = [
    ['MON RANG', `${data.myRank}${data.myRank === 1 ? 'er' : 'e'} / ${data.playerCount}`],
    ['MEILLEUR GUESS', data.bestGuessMeters === null ? '—' : formatDistance(data.bestGuessMeters)],
  ];
  tiles.forEach(([label, value], i) => {
    const x = 80 + i * 470;
    const y = 1090;
    ctx.fillStyle = '#201d18';
    roundRect(ctx, x, y, 450, 200, 32);
    ctx.fill();
    ctx.font = mono(28, 500);
    ctx.fillStyle = '#9a938a';
    ctx.fillText(label, x + 36, y + 70);
    ctx.font = display(70);
    ctx.fillStyle = '#f3efe6';
    ctx.fillText(value, x + 36, y + 160);
  });

  ctx.font = display(96);
  ctx.fillStyle = '#f3efe6';
  ctx.fillText(data.won ? 'Tu peux me battre ?' : 'Revanche. Qui vient ?', 80, 1500);
  ctx.font = mono(40, 500);
  ctx.fillStyle = '#9a938a';
  ctx.fillText(`${window.location.host}/join/${data.code}`, 80, 1600);
  ctx.font = mono(100);
  ctx.fillStyle = '#5ee6e0';
  ctx.fillText(data.code, 80, 1760);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shares the card natively when possible, otherwise downloads it. Returns how it went. */
export async function shareCard(data: ShareCardData, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await renderShareCard(data);
  const file = new File([blob], `cityguess-${data.city.id}.png`, { type: 'image/png' });
  const url = `${window.location.origin}/join/${data.code}`;
  if (typeof navigator.share === 'function' && (navigator.canShare?.({ files: [file] }) ?? false)) {
    try {
      await navigator.share({ files: [file], title: 'CityGuess', text: `${text} ${url}` });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  return 'downloaded';
}
