import type { ReactNode } from 'react';

export function Sheet({ open, onClose, children, title }: { open: boolean; onClose(): void; children: ReactNode; title: string }) {
  if (!open) return null;
  return (
    <div className="sheet__backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2 className="t-h2 t-h2--sm">{title}</h2>
        {children}
      </div>
    </div>
  );
}
