import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { SoundOffIcon, SoundOnIcon } from '../components/ui/Icons';
import { HowToPlaySheet } from '../components/HowToPlaySheet';
import { useGameStore } from '../store/gameStore';
import { storage } from '../services/storage';
import { isSoundEnabled, onSoundChange, setSoundEnabled } from '../services/sound';

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

export function HomeScreen() {
  const navigate = useNavigate();
  const snapshot = useGameStore((s) => s.snapshot);
  const closedReason = useGameStore((s) => s.closedReason);
  const clearClosedReason = useGameStore((s) => s.clearClosedReason);
  const [howTo, setHowTo] = useState(false);
  const [sound, setSound] = useState(isSoundEnabled());
  const lastRoom = snapshot?.code ?? storage.getLastRoom();

  useEffect(() => onSoundChange(setSound), []);

  return (
    <div className="screen bg-aurora bg-grid home">
      <div className="home__top">
        <IconButton label={sound ? 'Mute sounds' : 'Unmute sounds'} onClick={() => setSoundEnabled(!sound)}>
          {sound ? <SoundOnIcon /> : <SoundOffIcon />}
        </IconButton>
      </div>
      <div className="home__hero">
        <motion.div {...fade} transition={{ duration: 0.5 }}>
          <Logo size="lg" />
        </motion.div>
        <motion.p className="home__tagline" {...fade} transition={{ duration: 0.5, delay: 0.1 }}>
          Guess the city. Beat your friends.
        </motion.p>
        <motion.div className="home__pins" aria-hidden="true" {...fade} transition={{ duration: 0.6, delay: 0.2 }}>
          {['🇫🇷', '🇬🇧', '🇪🇸', '🇮🇹', '🇩🇪', '🇺🇸', '🇯🇵'].map((f, i) => (
            <span key={f} className="home__flag" style={{ animationDelay: `${i * 0.15}s` }}>
              {f}
            </span>
          ))}
        </motion.div>
      </div>
      <motion.div className="screen__footer home__actions" {...fade} transition={{ duration: 0.4, delay: 0.25 }}>
        {closedReason && (
          <button type="button" className="notice" onClick={clearClosedReason}>
            {closedReason}
          </button>
        )}
        {lastRoom && (
          <Button variant="surface" size="md" block onClick={() => navigate(`/room/${lastRoom}`)} data-testid="rejoin">
            {snapshot ? `Back to room ${lastRoom}` : `Rejoin room ${lastRoom}`}
          </Button>
        )}
        <Button block onClick={() => navigate('/create')} data-testid="create-room">
          Create room
        </Button>
        <Button block variant="secondary" onClick={() => navigate('/join')} data-testid="join-room">
          Join room
        </Button>
        <Button variant="ghost" size="md" block onClick={() => setHowTo(true)}>
          How to play
        </Button>
      </motion.div>
      <HowToPlaySheet open={howTo} onClose={() => setHowTo(false)} />
    </div>
  );
}
