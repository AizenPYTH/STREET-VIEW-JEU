import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';

export function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  const dismiss = useGameStore((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            type="button"
            className={`toast toast--${toast.kind}`}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            onClick={() => dismiss(toast.id)}
          >
            {toast.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
