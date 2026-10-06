import { create } from 'zustand';
import type { PlayerPublic, RoomEvent, RoomSnapshot } from '@cityguess/shared';
import { playSound } from '../services/sound';
import { haptic } from '../services/haptics';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

interface GameState {
  connection: ConnectionStatus;
  snapshot: RoomSnapshot | null;
  /** Reason the last room was closed / left, shown once on the home screen. */
  closedReason: string | null;
  toasts: Toast[];
  setConnection(status: ConnectionStatus): void;
  applySnapshot(snapshot: RoomSnapshot): void;
  applyEvent(event: RoomEvent): void;
  leaveLocally(reason: string | null): void;
  pushToast(toast: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
  clearClosedReason(): void;
}

let toastId = 0;

export const useGameStore = create<GameState>((set, get) => ({
  connection: 'connecting',
  snapshot: null,
  closedReason: null,
  toasts: [],

  setConnection: (connection) => set({ connection }),

  applySnapshot: (snapshot) => {
    const previous = get().snapshot;
    set({ snapshot, closedReason: null });
    if (previous && previous.code === snapshot.code && previous.phase !== snapshot.phase) {
      switch (snapshot.phase) {
        case 'round':
          playSound('go');
          haptic('medium');
          break;
        case 'revealing':
          playSound('reveal');
          haptic('success');
          break;
        case 'finished':
          playSound('victory');
          haptic('victory');
          break;
        default:
          break;
      }
    }
  },

  applyEvent: (event) => {
    const { snapshot, pushToast } = get();
    const me = snapshot?.you;
    const isMe = event.playerId !== null && event.playerId === me;
    const name = event.playerName ?? 'A player';
    switch (event.type) {
      case 'playerJoined':
        if (!isMe) {
          pushToast({ kind: 'info', text: `${name} joined` });
          playSound('join');
          haptic('light');
        }
        break;
      case 'playerLeft':
        if (!isMe) pushToast({ kind: 'warning', text: `${name} left the room` });
        break;
      case 'playerDisconnected':
        if (!isMe) pushToast({ kind: 'warning', text: `${name} disconnected` });
        break;
      case 'playerReconnected':
        if (!isMe) pushToast({ kind: 'success', text: `${name} is back` });
        break;
      case 'hostChanged':
        pushToast({ kind: 'info', text: isMe ? 'You are now the host' : `${name} is now the host` });
        break;
      case 'playerReady':
        if (!isMe) playSound('ready');
        break;
      case 'guessLocked':
        if (!isMe) {
          playSound('tick');
          haptic('light');
        }
        break;
      case 'gameStartFailed':
        pushToast({ kind: 'error', text: 'Could not load locations for this city. Try again or pick another city.' });
        playSound('error');
        break;
      default:
        break;
    }
  },

  leaveLocally: (reason) => set({ snapshot: null, closedReason: reason }),

  pushToast: (toast) => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts.slice(-3), { ...toast, id }] }));
    setTimeout(() => get().dismissToast(id), 3200);
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clearClosedReason: () => set({ closedReason: null }),
}));

// ───────────── selectors ─────────────

export const selectMe = (state: GameState): PlayerPublic | null => {
  const s = state.snapshot;
  if (!s) return null;
  return s.players.find((p) => p.id === s.you) ?? null;
};

export const selectIsHost = (state: GameState): boolean => {
  const s = state.snapshot;
  return !!s && s.hostId === s.you;
};
