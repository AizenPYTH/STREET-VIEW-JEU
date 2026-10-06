import type { PublicConfig } from '@cityguess/shared';
import { GooglePanorama } from './GooglePanorama';
import { MockPanorama } from './MockPanorama';

interface PanoramaProps {
  panoId: string;
  config: PublicConfig;
}

export function Panorama({ panoId, config }: PanoramaProps) {
  if (config.streetViewProvider === 'google' && config.googleMapsBrowserKey) {
    return <GooglePanorama panoId={panoId} apiKey={config.googleMapsBrowserKey} />;
  }
  return <MockPanorama panoId={panoId} />;
}
