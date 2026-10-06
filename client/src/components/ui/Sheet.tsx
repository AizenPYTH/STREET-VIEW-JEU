import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  onClose?(): void;
  title?: string;
  children: ReactNode;
  /** When false the sheet can't be dismissed by tapping the backdrop. */
  dismissible?: boolean;
}

/** Bottom sheet with backdrop, used for pickers and confirmations. */
export function Sheet({ open, onClose, title, children, dismissible = true }: SheetProps) {
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="sheet__backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => dismissible && onClose?.()}
        >
          <motion.div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet__handle" aria-hidden="true" />
            {title && <h2 className="sheet__title">{title}</h2>}
            <div className="sheet__body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
