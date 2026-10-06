import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CITIES, getCity, type RoomSnapshot } from '@cityguess/shared';
import { Button } from '../components/ui/Button';
import { CityCard } from '../components/ui/CityCard';
import { api, RequestError } from '../services/socket';
import { useGameStore } from '../store/gameStore';

/** VILLE step (host only, §16). */
export function CityScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const navigate = useNavigate();
  const showToast = useGameStore((s) => s.showToast);
  const [cityId, setCityId] = useState(snapshot.settings.cityId);
  const [loading, setLoading] = useState(false);
  const city = getCity(cityId);

  const confirm = async (): Promise<void> => {
    setLoading(true);
    try {
      await api.updateSettings({ cityId });
      navigate(`/room/${snapshot.code}`, { replace: true });
    } catch (e) {
      showToast(e instanceof RequestError ? e.message : 'Impossible de changer la ville', 'muted', 2000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen" data-testid="city-screen">
      <div className="screen__body">
        <h1 className="t-title">Choisis la ville</h1>
        <div className="city-grid" role="radiogroup" aria-label="Ville">
          {CITIES.map((c) => (
            <CityCard key={c.id} city={c} selected={c.id === cityId} onSelect={() => setCityId(c.id)} />
          ))}
        </div>
      </div>
      <div className="screen__footer">
        <Button loading={loading} glow onClick={() => void confirm()} data-testid="open-room">
          Ouvrir la room · {city?.name}
        </Button>
      </div>
    </div>
  );
}
