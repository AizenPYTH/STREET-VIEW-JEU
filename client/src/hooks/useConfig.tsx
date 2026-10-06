import { createContext, useContext } from 'react';
import type { PublicConfig } from '@cityguess/shared';

export const ConfigContext = createContext<PublicConfig | null>(null);

export function useConfig(): PublicConfig {
  const config = useContext(ConfigContext);
  if (!config) throw new Error('useConfig must be used inside ConfigContext');
  return config;
}
