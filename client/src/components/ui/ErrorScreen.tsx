import { Button } from './Button';

export type ErrorKind = 'roomNotFound' | 'roomFull' | 'connectionLost' | 'hostLeft' | 'gameOver' | 'generic';

const CONTENT: Record<ErrorKind, { title: string; body: string; cta: string }> = {
  roomNotFound: { title: 'Room introuvable', body: "Vérifie le code sur l'écran de ton ami. Les codes font 5 caractères.", cta: 'Réessayer' },
  roomFull: { title: 'Room pleine', body: "Cette room a déjà 8 joueurs. Demande à l'hôte d'en créer une autre.", cta: 'Créer ma room' },
  connectionLost: { title: 'Connexion perdue', body: 'Reconnexion en cours… ton guess est sauvegardé.', cta: 'Réessayer' },
  hostLeft: { title: "L'hôte est parti", body: 'La room est fermée. Tu peux créer la tienne.', cta: 'Créer une room' },
  gameOver: { title: 'Partie terminée', body: "Demande à l'hôte un code de revanche.", cta: 'Accueil' },
  generic: { title: 'Oups', body: "Quelque chose s'est mal passé. Réessaie dans un instant.", cta: 'Réessayer' },
};

interface ErrorScreenProps {
  kind: ErrorKind;
  body?: string;
  onAction(): void;
  onHome?(): void;
  loading?: boolean;
}

/** Full‑screen error (§28). */
export function ErrorScreen({ kind, body, onAction, onHome, loading = false }: ErrorScreenProps) {
  const c = CONTENT[kind];
  return (
    <div className="screen" data-testid={`error-${kind}`}>
      <div className="screen__center">
        <div className="error-icon" aria-hidden="true">
          !
        </div>
        <h1 className="error-title">{c.title}</h1>
        <p className="error-body">{body ?? c.body}</p>
      </div>
      <div className="screen__footer">
        <Button small loading={loading} onClick={onAction} data-testid="error-action">
          {c.cta}
        </Button>
        {onHome && (
          <Button variant="ghost" center onClick={onHome}>
            Accueil
          </Button>
        )}
      </div>
    </div>
  );
}
