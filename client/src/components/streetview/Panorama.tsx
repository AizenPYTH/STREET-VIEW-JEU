import type { PublicConfig } from '@cityguess/shared';
import { GooglePanorama } from './GooglePanorama';
import { MockPanorama } from './MockPanorama';

interface PanoramaProps {
  panoId: string;
  config: PublicConfig;
  onReady(): void;
}

export function Panorama({ panoId, config, onReady }: PanoramaProps) {
  if (config.streetViewProvider === 'google' && config.googleMapsBrowserKey) {
    return <GooglePanorama panoId={panoId} apiKey={config.googleMapsBrowserKey} onReady={onReady} />;
  }
  return <MockPanorama panoId={panoId} onReady={onReady} />;
}
