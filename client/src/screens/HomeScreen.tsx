import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/ui/Logo';
import { Onboarding } from '../components/Onboarding';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { GearIcon } from '../components/ui/Icons';
import { useGameStore } from '../store/gameStore';
import { storage } from '../services/storage';

export function HomeScreen() {
  const navigate = useNavigate();
  const snapshot = useGameStore((s) => s.snapshot);
  const lastRoom = snapshot?.code ?? storage.getLastRoom();
  const [onboarding, setOnboarding] = useState(() => !storage.hasSeenOnboarding());

  if (onboarding) {
    return (
      <div className="screen" data-testid="home">
        <Onboarding
          onDone={() => {
            storage.setSeenOnboarding();
            setOnboarding(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="screen" data-testid="home">
      <div className="home__top">
        <IconButton label="Réglages" onClick={() => navigate('/settings')} data-testid="settings">
          <GearIcon />
        </IconButton>
      </div>
      <div className="home__hero">
        <Logo />
        <p className="home__tagline cg-up" style={{ animationDelay: '0.3s' }}>
          Devine la ville. Bats tes amis.
        </p>
      </div>
      <div className="home__actions cg-up" style={{ animationDelay: '0.45s' }}>
        {lastRoom && (
          <Button variant="secondary" filled onClick={() => navigate(`/room/${lastRoom}`)} data-testid="rejoin">
            Reprendre la room {lastRoom}
          </Button>
        )}
        <Button glow onClick={() => navigate('/create')} data-testid="create-room">
          Jouer
        </Button>
        <Button variant="secondary" onClick={() => navigate('/join')} data-testid="join-room">
          Rejoindre une room
        </Button>
      </div>
    </div>
  );
}
