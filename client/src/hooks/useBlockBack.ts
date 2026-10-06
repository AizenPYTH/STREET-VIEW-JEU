import { useEffect } from 'react';

/**
 * Keeps the player on the current screen when the system back gesture fires
 * (§26: blocked from INTRO to FINAL). A history entry is pushed so "back" lands here again.
 */
export function useBlockBack(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const push = (): void => window.history.pushState({ cgBlock: true }, '');
    push();
    const onPop = (): void => push();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [active]);
}
