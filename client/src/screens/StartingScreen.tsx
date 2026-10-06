import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { getCity, type RoomSnapshot } from '@cityguess/shared';
import { useCountdown } from '../hooks/useCountdown';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

export function StartingScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const { seconds } = useCountdown(snapshot.phaseEndsAt, 100);
  const city = getCity(snapshot.settings.cityId);
  useEffect(() => {
    if (seconds > 0) {
      playSound('countdown');
      haptic('countdown');
    }
  }, [seconds]);
  return (
    <div className="screen bg-aurora centered starting" data-testid="starting">
      <span className="eyebrow">Get ready</span>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={seconds}
          className="starting__number"
          initial={{ scale: 1.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 24 }}
        >
          {seconds > 0 ? seconds : 'GO'}
        </motion.span>
      </AnimatePresence>
      <p className="starting__city">
        <span>{city?.flag}</span> {city?.name}
      </p>
      <p className="muted">
        {snapshot.settings.rounds} rounds · {snapshot.settings.exploreSeconds}s to explore
      </p>
    </div>
  );
}
