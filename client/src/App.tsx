import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { PublicConfig } from '@cityguess/shared';
import { ConfigContext } from './hooks/useConfig';
import { loadPublicConfig } from './services/config';
import { getSocket } from './services/socket';
import { unlockAudio } from './services/sound';
import { ConnectionBanner } from './components/ui/ConnectionBanner';
import { Toasts } from './components/ui/Toasts';
import { Button } from './components/ui/Button';
import { Spinner } from './components/ui/Spinner';
import { Logo } from './components/ui/Logo';
import { HomeScreen } from './screens/HomeScreen';
import { CreateScreen } from './screens/CreateScreen';
import { JoinScreen } from './screens/JoinScreen';
import { RoomScreen } from './screens/RoomScreen';

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
        <div className="screen bg-aurora centered">
          <Logo size="lg" />
          <p className="muted" style={{ textAlign: 'center' }}>
            Can't reach the game server.
            <br />
            <span className="mono" style={{ fontSize: 13 }}>
              {error}
            </span>
          </p>
          <Button onClick={() => setAttempt((a) => a + 1)}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="app">
        <div className="screen bg-aurora centered">
          <Logo size="lg" />
          <Spinner size={28} />
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
            <Route path="/create" element={<CreateScreen />} />
            <Route path="/join/:code?" element={<JoinScreen />} />
            <Route path="/room/:code" element={<RoomScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <ConnectionBanner />
          <Toasts />
        </div>
      </BrowserRouter>
    </ConfigContext.Provider>
  );
}
