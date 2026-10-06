import { useState } from 'react';
import { Button } from './ui/Button';
import { playSound } from '../services/sound';

const CARDS = [
  { emoji: '👀', title: 'Explore', text: 'Tout le monde atterrit au même endroit. Regarde autour de toi avant la fin du timer.' },
  { emoji: '📍', title: 'Devine', text: 'Pose ton marqueur sur la carte. Plus tu es proche, plus tu marques.' },
  { emoji: '🏆', title: 'Gagne', text: 'Cinq manches, la dernière compte double. Le meilleur total l’emporte.' },
];

/** First launch only (phase 2 §35): three cards, skippable, never shown again. */
export function Onboarding({ onDone }: { onDone(): void }) {
  const [index, setIndex] = useState(0);
  const card = CARDS[index]!;
  const last = index === CARDS.length - 1;
  return (
    <div className="onboarding" role="dialog" aria-label="Comment jouer" data-testid="onboarding">
      <div className="onboarding__top">
        <Button variant="ghost" onClick={onDone} data-testid="onboarding-skip">
          Passer
        </Button>
        <span className="onboarding__dots" aria-hidden="true">
          {CARDS.map((_, i) => (
            <span key={i} className={`onboarding__dot ${i === index ? 'onboarding__dot--on' : ''}`} />
          ))}
        </span>
      </div>
      <div key={index} className="onboarding__card cg-up">
        <span className="onboarding__emoji" aria-hidden="true">
          {card.emoji}
        </span>
        <h2 className="t-title">{card.title}</h2>
        <p className="t-body">{card.text}</p>
      </div>
      <div className="screen__footer">
        <Button
          glow={last}
          onClick={() => {
            if (last) onDone();
            else {
              playSound('click');
              setIndex(index + 1);
            }
          }}
          data-testid="onboarding-next"
        >
          {last ? "C'est parti" : 'Suivant'}
        </Button>
      </div>
    </div>
  );
}
