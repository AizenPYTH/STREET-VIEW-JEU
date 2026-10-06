import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { isSoundEnabled, onSoundChange, setSoundEnabled } from '../services/sound';
import { isHapticsEnabled, setHapticsEnabled } from '../services/haptics';

export function SettingsScreen() {
  const navigate = useNavigate();
  const [sound, setSound] = useState(isSoundEnabled());
  const [haptics, setHaptics] = useState(isHapticsEnabled());
  useEffect(() => onSoundChange(setSound), []);
  return (
    <div className="screen" data-testid="settings-screen">
      <div className="topbar">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          ← Accueil
        </Button>
      </div>
      <div className="screen__body">
        <h1 className="t-title">Réglages</h1>
        <Toggle label="Son" hint="Musique et effets" on={sound} onChange={setSoundEnabled} />
        <Toggle
          label="Vibrations"
          hint="Retours haptiques (Android)"
          on={haptics}
          onChange={(v) => {
            setHapticsEnabled(v);
            setHaptics(v);
          }}
        />
        <p className="t-meta" style={{ marginTop: 'auto' }}>
          CityGuess · vue rue © Google · cartes © OpenStreetMap, CARTO
        </p>
      </div>
    </div>
  );
}
