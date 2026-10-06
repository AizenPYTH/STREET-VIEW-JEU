import { useGameStore } from '../../store/gameStore';

/** Single top toast (§12): "X A REJOINT", "X a quitté", host changes. */
export function PlayerToast() {
  const toast = useGameStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div key={toast.id} className={`ptoast ${toast.kind === 'muted' ? 'ptoast--muted' : toast.kind === 'hot' ? 'ptoast--hot' : ''}`} role="status">
      {toast.text}
    </div>
  );
}
