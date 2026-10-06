import { create } from 'zustand';
import { TIMINGS, type PlayerPublic, type RoomEvent, type RoomSnapshot } from '@cityguess/shared';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface TopToast {
  id: number;
  kind: 'accent' | 'muted' | 'hot';
  text: string;
}

interface GameState {
  connection: ConnectionStatus;
  snapshot: RoomSnapshot | null;
  /** The room we just left and why: 'closed' (server) or 'left' (on purpose). Blocks auto‑rejoin. */
  lastLeft: { code: string; reason: 'closed' | 'left' } | null;
  toast: TopToast | null;
  setConnection(status: ConnectionStatus): void;
  applySnapshot(snapshot: RoomSnapshot): void;
  applyEvent(event: RoomEvent): void;
  leaveLocally(reason: 'closed' | 'left'): void;
  showToast(text: string, kind?: TopToast['kind'], ms?: number): void;
  clearLastLeft(): void;
}

let toastId = 0;
let toastTimer: number | null = null;

export const useGameStore = create<GameState>((set, get) => ({
  connection: 'connecting',
  snapshot: null,
  lastLeft: null,
  toast: null,

  setConnection: (connection) => set({ connection }),

  applySnapshot: (snapshot) => {
    const previous = get().snapshot;
    set({ snapshot, lastLeft: null });
    if (previous && previous.code === snapshot.code && previous.phase !== snapshot.phase) {
      if (snapshot.phase === 'guessing') {
        playSound('timeUp');
        haptic('medium');
      }
      if (snapshot.phase === 'finished') {
        const won = snapshot.final?.winnerIds.includes(snapshot.you);
        if (won) {
          playSound('victory');
          haptic('success');
          window.setTimeout(() => haptic('success'), 150);
        } else {
          playSound('defeat');
          haptic('medium');
        }
      }
    }
  },

  applyEvent: (event) => {
    const { snapshot, showToast } = get();
    const me = snapshot?.you;
    const isMe = event.playerId !== null && event.playerId === me;
    const name = event.playerName ?? 'Un joueur';
    switch (event.type) {
      case 'playerJoined':
        if (!isMe) {
          showToast(`${name} a rejoint`);
          playSound('join');
          haptic('light');
        }
        break;
      case 'playerLeft':
        if (!isMe) showToast(`${name} a quitté`, 'muted', 1600);
        break;
      case 'hostChanged':
        showToast(isMe ? "Tu es l'hôte" : `${name} est l'hôte`, 'muted', 1600);
        break;
      case 'rematchRequested':
        if (!isMe) showToast(`Revanche demandée par ${name}`, 'hot', 2500);
        break;
      case 'newCityRequested':
        if (!isMe) showToast(`${name} choisit une ville`, 'muted', 1600);
        break;
      case 'guessLocked':
        if (!isMe) playSound('tick');
        break;
      case 'gameStartFailed':
        showToast('Impossible de charger des lieux. Réessaie.', 'muted', 2500);
        playSound('error');
        haptic('error');
        break;
      default:
        break;
    }
  },

  leaveLocally: (reason) => set((state) => ({ snapshot: null, lastLeft: state.snapshot ? { code: state.snapshot.code, reason } : null })),

  showToast: (text, kind = 'accent', ms = TIMINGS.joinToastMs) => {
    if (toastTimer) window.clearTimeout(toastTimer);
    const id = ++toastId;
    set({ toast: { id, kind, text } });
    toastTimer = window.setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, ms);
  },

  clearLastLeft: () => set({ lastLeft: null }),
}));

export const selectMe = (state: GameState): PlayerPublic | null => {
  const s = state.snapshot;
  if (!s) return null;
  return s.players.find((p) => p.id === s.you) ?? null;
};
