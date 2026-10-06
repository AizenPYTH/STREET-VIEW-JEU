import type { City } from '@cityguess/shared';
import { playSound } from '../../services/sound';
import { haptic } from '../../services/haptics';

const DIFFICULTY_WORD: Record<number, string> = { 1: 'Facile', 2: 'Normal', 3: 'Difficile', 4: 'Expert' };

export function CityCard({ city, selected, onSelect }: { city: City; selected: boolean; onSelect(): void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`city-card ${selected ? 'city-card--selected' : ''}`}
      style={{ ['--city-hue' as string]: city.hue }}
      onClick={() => {
        playSound('click');
        haptic('light');
        onSelect();
      }}
      data-testid={`city-${city.id}`}
    >
      <div className="city-card__top">
        <span className="city-card__flag" aria-label={city.country}>
          {city.flag}
        </span>
        <span className="city-card__spots">{city.zones.length} spots</span>
      </div>
      <div>
        <div className="city-card__name">{city.name}</div>
        <div className="city-card__difficulty">
          <span>{DIFFICULTY_WORD[city.stars]}</span>
          <span className="city-card__stars" aria-label={`${city.stars} sur 4`}>
            {'★'.repeat(city.stars)}
            {'☆'.repeat(4 - city.stars)}
          </span>
        </div>
      </div>
    </button>
  );
}
