import { useEffect, useRef } from 'react';

interface MockPanoramaProps {
  panoId: string;
}

function seedFrom(panoId: string): () => number {
  let s = 0;
  for (const ch of panoId) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Procedural 360° "street" used when the server runs with STREET_VIEW_PROVIDER=mock
 * (automated tests and key‑less development). Drag horizontally to look around.
 * It is never used in production with the Google provider.
 */
export function MockPanorama({ panoId }: MockPanoramaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rng = seedFrom(panoId);
    const buildings = Array.from({ length: 28 }, () => ({
      x: rng(),
      w: 0.03 + rng() * 0.06,
      h: 0.25 + rng() * 0.45,
      hue: 200 + rng() * 40,
      light: 18 + rng() * 22,
      windows: Math.floor(2 + rng() * 5),
    }));
    const skyHue = 200 + rng() * 30;
    let heading = 0;
    let dragging = false;
    let lastX = 0;
    let frame = 0;

    const draw = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, `hsl(${skyHue} 60% 55%)`);
      sky.addColorStop(0.6, `hsl(${skyHue + 10} 50% 78%)`);
      sky.addColorStop(0.61, '#5a5f66');
      sky.addColorStop(1, '#2d3036');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);
      const horizon = height * 0.6;
      const span = width * 2.5;
      for (const b of buildings) {
        const x = (((b.x * span - (heading / 360) * span) % span) + span) % span;
        for (const offset of [-span, 0, span]) {
          const bx = x + offset;
          const bw = b.w * span;
          if (bx + bw < 0 || bx > width) continue;
          const bh = b.h * horizon;
          ctx.fillStyle = `hsl(${b.hue} 20% ${b.light}%)`;
          ctx.fillRect(bx, horizon - bh, bw, bh);
          ctx.fillStyle = 'rgba(255, 230, 150, 0.55)';
          for (let r = 0; r < b.windows; r++) {
            for (let c = 0; c < 3; c++) {
              ctx.fillRect(bx + 6 + c * (bw / 3.4), horizon - bh + 10 + r * (bh / (b.windows + 1)), 5, 7);
            }
          }
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.setLineDash([18, 14]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(width / 2 + Math.sin((heading * Math.PI) / 180) * 80, height);
      ctx.lineTo(width / 2, horizon + 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '600 13px system-ui';
      ctx.fillText(`MOCK STREET VIEW · heading ${Math.round(((heading % 360) + 360) % 360)}°`, 12, height - 14);
    };

    const onDown = (e: PointerEvent): void => {
      dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent): void => {
      if (!dragging) return;
      heading -= (e.clientX - lastX) * 0.35;
      lastX = e.clientX;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    const onUp = (): void => {
      dragging = false;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', draw);
    draw();
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      window.removeEventListener('resize', draw);
    };
  }, [panoId]);

  return (
    <div className="pano" data-testid="panorama" data-provider="mock" data-pano={panoId}>
      <canvas ref={canvasRef} className="pano__canvas pano__canvas--mock" />
    </div>
  );
}
