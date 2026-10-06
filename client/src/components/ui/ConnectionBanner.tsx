import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';

export function ConnectionBanner() {
  const connection = useGameStore((s) => s.connection);
  const visible = connection === 'reconnecting' || connection === 'disconnected';
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`connection connection--${connection}`}
          role="status"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
        >
          <span className="connection__dot" />
          {connection === 'reconnecting' ? 'Reconnecting…' : 'Disconnected — check your connection'}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
