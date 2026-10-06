import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { PublicConfig } from '@cityguess/shared';
import { ConfigContext } from './hooks/useConfig';
import { loadPublicConfig } from './services/config';
import { getSocket, reconnectNow } from './services/socket';
import { unlockAudio } from './services/sound';
import { useGameStore } from './store/gameStore';
import { PlayerToast } from './components/ui/PlayerToast';
import { ErrorScreen } from './components/ui/ErrorScreen';
import { Loader } from './components/ui/Spinner';
import { Logo } from './components/ui/Logo';
import { HomeScreen } from './screens/HomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { CreateScreen } from './screens/CreateScreen';
import { JoinScreen } from './screens/JoinScreen';
import { NameScreen } from './screens/NameScreen';
import { RoomScreen } from './screens/RoomScreen';

/** Full‑screen "Connexion perdue" after a short grace period (brief blips never show it). */
function ConnectionOverlay() {
  const connection = useGameStore((s) => s.connection);
  const snapshot = useGameStore((s) => s.snapshot);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (connection === 'connected' || connection === 'connecting') {
      setShow(false);
      return;
    }
    const t = window.setTimeout(() => setShow(true), 1500);
    return () => window.clearTimeout(t);
  }, [connection]);
  if (!show) return null;
  return (
    <div className="connection-overlay">
      <ErrorScreen kind="connectionLost" body={snapshot?.yourGuess ? 'Reconnexion en cours… ton guess est sauvegardé.' : 'Reconnexion en cours…'} onAction={reconnectNow} loading={connection === 'reconnecting'} />
    </div>
  );
}

export function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadPublicConfig()
      .then((c) => {
        if (cancelled) return;
        setConfig(c);
        getSocket();
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    const unlock = (): void => unlockAudio();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  if (error) {
    return (
      <div className="app">
        <ErrorScreen kind="generic" body={`Impossible de joindre le serveur de jeu. ${error}`} onAction={() => setAttempt((a) => a + 1)} />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="app">
        <div className="screen screen--deep">
          <div className="screen__center">
            <Logo inline />
            <Loader label="Chargement" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ConfigContext.Provider value={config}>
      <BrowserRouter>
        <div className="app">
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/create" element={<CreateScreen />} />
            <Route path="/join" element={<JoinScreen />} />
            <Route path="/join/:code" element={<JoinScreen />} />
            <Route path="/join/:code/name" element={<NameScreen />} />
            <Route path="/room/:code/:sub?" element={<RoomScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <PlayerToast />
          <ConnectionOverlay />
        </div>
      </BrowserRouter>
    </ConfigContext.Provider>
  );
}
