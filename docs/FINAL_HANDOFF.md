# CITYGUESS — FINAL HANDOFF

Pour un développeur qui reprend le projet demain. Branche : `claude/pensive-curie-0470fn`. Les documents précédents (`README.md`, `docs/PHASE2_HANDOFF.md`) restent valables ; celui‑ci est la vue d'ensemble.

## RELEASE STATUS

**READY — GOOGLE VALIDATION REQUIRED.**

Tout ce qui peut être vérifié sans clé Google l'a été (tests unitaires, intégration, Postgres + RLS, bout en bout à quatre téléphones émulés, captures de chaque écran). Le fournisseur Google Street View est implémenté sur l'API documentée mais **n'a jamais été exécuté avec une vraie clé** : aucune clé n'était disponible dans l'environnement de développement. Voir « GOOGLE VALIDATION ».

## PRODUCT

CityGuess est un jeu mobile social : 2 à 8 amis (idéal 4), chacun sur son téléphone, rejoignent une room avec un code à 5 caractères. À chaque manche tous atterrissent au même endroit d'une ville en vue rue, explorent (15–60 s), posent un marqueur sur la carte (20 s), puis la vraie position est révélée. Plus on est proche, plus on marque ; la dernière manche compte double ; le meilleur total gagne ; **REVANCHE** relance sans friction. PWA web mobile‑first, installable, un lien d'invitation suffit.

## ARCHITECTURE

```
client/   React 19 + TypeScript strict + Vite — PWA, Leaflet (cartes), Google Maps JS (vue rue), Socket.IO client, zustand
server/   Node 22 + Express + Socket.IO — moteur de jeu autoritaire en mémoire, sélection des lieux, persistance optionnelle
packages/shared/   types, protocole socket, timings, barème, géo, villes/zones — importé par les deux
db/migrations/     SQL Postgres (compatible Supabase), RLS verrouillée
e2e/               Playwright (4 contextes = 4 téléphones), test Google réel conditionnel
scripts/           validate-streetview.mjs (couverture/latence par zone avec une clé)
```

Une seule instance serveur sert l'API (`/api/config`, `/api/rooms/:code`, `/api/health`), les websockets et le client compilé. Le client se connecte avec un jeton par appareil (localStorage) ; le serveur pousse un *snapshot* personnalisé après chaque mutation.

## GAME STATE

| Phase | Entrée | Sortie |
|---|---|---|
| `waiting` | création, « Nouvelle ville », échec de lancement | hôte lance (tous les connectés PRÊTS) |
| `starting` | lancement (700 ms logo) ou revanche (3 s) ; les lieux sont résolus pendant ce temps | round 1 |
| `round` | intro 3,8 s puis exploration ; le timer démarre quand toutes les vues rue sont prêtes (max +4 s) | fin du timer → `guessing`, ou tous verrouillés → `revealing` |
| `guessing` | 20 s pour poser le marqueur | tous verrouillés ou deadline (guess auto au centre) → `revealing` |
| `revealing` | séquence scriptée, durée `revealDurationMs(n)` | → `results` |
| `results` | scores, classement, CTA hôte ; auto‑avance après `resultsDurationMs(n)` | round suivant ou `finished` |
| `finished` | final, REVANCHE / Nouvelle ville / Partager / ⌂ | revanche → `starting`, nouvelle ville → `waiting` |

Toutes les durées sont dans `packages/shared/src/timings.ts` et dérivent de timestamps serveur.

## GAME RULES

- Capacité 2–8 (choisie à la création), manches 3/5/10, exploration 15/30/45/60 s, guess 20 s, difficulté des lieux (facile → expert = zones), dernière manche ×2 (option, défaut oui).
- Pseudo 2–12 caractères unique dans la room ; avatar unique (8 formes/couleurs), préféré si libre sinon premier libre.
- PRÊT = l'appareil peut charger la vue rue ; l'hôte ne peut lancer que si tous les connectés sont prêts.
- Guess verrouillé irréversible ; un seul par manche ; refusé hors phase. Timer à 0 sans marqueur → guess automatique au centre de la ville (tag « auto »).
- Déconnexion : « reconnexion… » 20 s puis retrait (retour possible, manches manquées = 0 et 50 km de pénalité au départage). Hôte transféré après 10 s de déconnexion ou immédiatement s'il quitte.
- Classement : total décroissant, égalité départagée par distance cumulée ; gagnants multiples possibles sur égalité parfaite.
- Lieux : jamais deux fois le même dans une partie (séparation ≥ 300 m), évite ceux des parties précédentes de la room et les 300 derniers joués sur le serveur ; repli sur toutes les zones si la difficulté manque de couverture ; budget de 9 s pour la sélection.

## SCORING

`points = round(1000 · e^(−d/1400)) × multiplicateur` (d en mètres), bonus +100 strictement sous 200 m, multiplicateur 2 sur la dernière manche si l'option est active. Repères : 0 m = 1000, 500 m ≈ 700, 1 km ≈ 490, 2 km ≈ 240, 5 km ≈ 28. Maximum 1 100 par manche, 2 100 en finale. Catégories affichées : 🔥 Parfait < 50 m, 🎯 Précis < 200 m, 👌 Proche < 500 m, 🙂 Pas loin < 1,5 km, 🧭 Loin.

## BALANCE

Simulation `packages/shared/src/balance.test.ts` (4 000 parties par scénario, profils expert/moyen/mauvais/chanceux) : expert ~92 % de victoires, un second à ≤ 600 pts avant la finale gagne ~27 % (22 % sans finale ×2), leader de la manche 4 battu ~10 %, égalités ~0 % ; entre quatre joueurs de niveau égal, le leader de la manche 4 perd ~40 %. La formule récompense le niveau sans rendre l'issue acquise ; la finale doublée crée le retournement sans le rendre facile. Conservée telle quelle.

## STREET VIEW

- **Serveur** : `GoogleStreetViewResolver` appelle l'endpoint *metadata* (gratuit) avec `source=outdoor`, rayon 150 m, timeout 4 s, et traduit les statuts Google en messages actionnables (clé refusée, quota, erreur temporaire). `pickLocations` tire des points dans les zones de la difficulté, snappe sur un vrai panorama, valide (rayon ville, séparation, exclusions), repli sur toutes les zones, budget total 9 s. Tous les joueurs reçoivent le même `panoId`.
- **Client** : `GooglePanorama` charge Maps JS (`loading=async`), crée un `StreetViewPanorama` avec `pano`, interface Google masquée sauf les flèches de navigation, labels de rues cachés, cap initial déterministe (hash du panoId). Statut OK → `game:panoReady`. Erreur → « La vue rue n'a pas chargé » + Réessayer inline ; le timer démarre pour tous après 4 s maximum, le joueur peut toujours deviner.
- **Mock** (`STREET_VIEW_PROVIDER=mock`) : panorama procédural déterministe pour les tests ; non activable par un client.

## SECURITY

- Le serveur calcule tout : distances, scores, classement, timers, phases. Le client n'envoie qu'une coordonnée et des intents (`setReady`, `panoReady`, `start`, `nextRound`, `rematch`, `leave`).
- `snapshotFor(playerId)` n'inclut `round.reveal` (position réelle, guesses, standings) qu'à partir de la phase `revealing`. Avant : `panoId`, timestamps, `hasGuessed` des autres (booléen) et son propre guess. Test `integration.test.ts` : toutes les trames reçues par un invité avant la révélation sont capturées et vérifiées.
- Intents refusés : guess hors phase (`TOO_LATE`), doublon (`ALREADY_GUESSED`), non‑hôte (`NOT_HOST`), mauvaise phase (`BAD_PHASE`), payload invalide (`INVALID_INPUT`, zod), débit (40 événements / 5 s), buffer 16 Ko, jeton d'auth obligatoire.
- Limite connue : l'API Street View du navigateur expose la position du panorama à qui ouvre les DevTools (inhérent à tout jeu Street View). La base est verrouillée par RLS ; aucune clé secrète côté client ; clé navigateur à restreindre par référent.

## REALTIME (Socket.IO)

Client → serveur (avec ack `{ok, data} | {ok:false, error:{code,message}}`) : `room:create`, `room:join`, `room:rejoin`, `room:leave`, `room:updateSettings`, `room:setReady`, `game:start`, `game:panoReady`, `game:submitGuess`, `game:nextRound`, `game:rematch`, `time:ping`.
Serveur → client : `room:state` (snapshot personnalisé), `room:event` (joined/left/disconnected/reconnected/hostChanged/ready/guessLocked/gameStarted/gameStartFailed/roundStarted/roundRevealed/gameFinished/rematchRequested/newCityRequested), `room:closed`.

## RECONNECTION

Jeton par appareil → `room:rejoin` au `connect` (code mémorisé). Même joueur, même manche, même état ; le guess verrouillé est conservé ; aucun doublon. « Connexion perdue » plein écran après 1,5 s de coupure, avec Réessayer. Rechargement de page = même chose. Après 20 s de déconnexion le joueur est retiré de la manche (les autres ne l'attendent plus) mais peut revenir.

## HOST TRANSFER

Hôte parti (quitte) → transfert immédiat au plus ancien joueur connecté ; hôte déconnecté → transfert après 10 s s'il n'est pas revenu. Testé pour chaque phase (lobby, manche, guess, révélation, scores) : le nouvel hôte peut lancer, passer à la manche suivante et relancer la revanche. Si tout le monde est parti, la room se ferme.

## REMATCH

REVANCHE (hôte, écran final) → 3 s « Revanche demandée par X » → manche 1, mêmes joueurs, nouveaux lieux, scores/séries/guesses remis à zéro (testé : aucune fuite dans les snapshots). « Nouvelle ville » → lobby, l'hôte choisit, les autres attendent. Les joueurs retirés sont supprimés à la revanche.

## DESIGN

Handoff design (phase 1) : fond chaud `#15130f`, un seul CTA cyan par écran (64 px, en bas), ambre réservé à la vérité/bonus/podium/dernière manche, Bricolage Grotesque + JetBrains Mono embarquées, 8 avatars forme + couleur, losange = marqueur. Phase 2 : révélation du plus loin au plus proche avec gagnant de manche, scores animés, dépassements, séries, ligne personnelle, timer en quatre paliers, onboarding 3 cartes, image de partage.

## TESTS

- `npm test` : shared (34) + serveur (moteur, lieux, budget de temps, messages Google, RoomManager, sockets, payloads malformés, secret sur le fil, Postgres + RLS avec `TEST_DATABASE_URL`).
- `npx playwright test` : partie complète à 4 téléphones avec rechargement, auto‑guess, finale doublée, revanche ; réglages/lien/départ de l'hôte ; onboarding. `e2e/google.spec.ts` est ignoré sans clé.
- Captures d'écran de chaque écran dans `test-results/` après un run.

## GOOGLE VALIDATION

Non exécutée (pas de clé). Commandes exactes :

```bash
npm run build -w packages/shared
GOOGLE_MAPS_SERVER_KEY=… node scripts/validate-streetview.mjs marseille paris london tokyo new-york
GOOGLE_MAPS_API_KEY=… npx playwright test e2e/google.spec.ts
STREET_VIEW_PROVIDER=google GOOGLE_MAPS_API_KEY=… npm run dev   # puis une vraie partie
```

À vérifier ville par ville : couverture ≥ 50 % par zone (sinon déplacer la zone dans `cities.ts`), latence metadata < 500 ms, panorama rendu avec flèches de navigation (`links > 0`), cap initial identique sur deux téléphones, chargement < 4 s sur mobile.

## RELEASE CHECKLIST

| Item | Statut | Vérifié par |
|---|---|---|
| Home | ✅ | E2E + capture |
| Create Room | ✅ | E2E (options repliées) + capture |
| Join Room | ✅ | E2E (clavier, lien d'invitation, code invalide → écran d'erreur) + capture |
| Lobby | ✅ | E2E (PRÊT, compteur, départ de l'hôte) + capture |
| City selection | ✅ | E2E + capture |
| Start | ✅ | E2E (logo, intro, 3·2·1, GO) |
| Street View | ⏳ **READY FOR REAL API VALIDATION** | `scripts/validate-streetview.mjs`, `e2e/google.spec.ts` (mock validé en E2E) |
| Timer | ✅ | tests moteur (démarrage synchronisé, paliers), E2E |
| Guess | ✅ | E2E (tap, verrou, guess anticipé) + capture |
| Waiting | ✅ | E2E + capture (statuts) |
| Reveal | ✅ | E2E (joueurs un par un, gagnant) + capture |
| Score | ✅ | E2E (count‑up, totaux) + capture |
| Leaderboard | ✅ | E2E (flèches, LEADER/écart, ligne perso) |
| Final | ✅ | E2E + captures (victoire / défaite chiffrée, stats, partage) |
| Rematch | ✅ | tests moteur (aucune fuite) + E2E |
| Reconnection | ✅ | tests moteur + sockets + E2E (rechargement en pleine manche) |
| Host transfer | ✅ | tests moteur pour chaque phase + E2E lobby |
| Security | ✅ | capture des trames avant révélation, intents forgés refusés, zod, rate limit |
| RLS | ✅ | test Postgres (rôle anon : 0 ligne sur rounds/guesses) |
| Google API | ⏳ | voir GOOGLE VALIDATION |
| Mobile | ✅ viewport iPhone (Chromium) · ⏳ vrais iPhone/Android | E2E ; à jouer sur 4 vrais téléphones |
| Error states | ✅ | 5 écrans d'erreur, bandeaux lobby, retry vue rue, connexion perdue |
| Performance | ✅ par construction (rAF, marqueurs DOM légers, snapshots ≤ 8 joueurs) · ⏳ mesure sur appareil réel | — |

## KNOWN LIMITATIONS

- Rooms en mémoire : un redémarrage serveur termine les parties en cours (l'historique reste en base si configurée). Une seule instance (pas d'adaptateur Socket.IO).
- Vibrations ignorées par iOS Safari. Partage de fichier image refusé par certains navigateurs → téléchargement.
- Tuiles CARTO : usage gratuit raisonnable ; prévoir une clé MapTiler/Mapbox si le trafic devient important.
- Les coordonnées des zones ont été placées à la main ; la qualité réelle des spots dépend de la validation Google.

## FUTURE (volontairement non implémenté)

Modes contre‑la‑montre / sans bouger / duel, nappes sonores, skip collectif de la révélation, motifs par joueur (daltonisme), profil/XP, chat, amis, boutique, matchmaking, persistance Redis des rooms vivantes, multi‑instances.
