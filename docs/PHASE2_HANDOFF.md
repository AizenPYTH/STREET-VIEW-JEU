# CITYGUESS — PHASE 2 HANDOFF

Document de passation pour le prochain développeur (humain ou Claude Code). Phase 1 a livré un MVP fonctionnel et conforme au handoff design ; Phase 2 a transformé la boucle en jeu qui donne envie de rejouer. Tout ce qui est décrit ici est implémenté, testé et poussé sur la branche `claude/pensive-curie-0470fn`.

KPI visé : après une partie, le joueur appuie sur **REVANCHE**.

---

## 1. Audit initial (ce qui ne marchait pas assez bien)

| Moment | Problème constaté | Correction |
|---|---|---|
| Création de room | Six groupes de réglages avant de jouer : trop de décisions dans les 30 premières secondes. | Options repliées derrière « Options de la partie » avec un résumé ; pseudo + avatar + CTA seulement. |
| Premier lancement | Aucune explication, le joueur découvre le timer en jouant. | Onboarding 3 cartes (Explore / Devine / Gagne), « Passer », jamais réaffiché. |
| Attente « starting » | Logo seul, aucun signal de chargement. | « Préparation de {Ville}… » avec points animés. |
| Attente des autres | Liste de ✓ muette. | Statut par joueur : « verrouillé » / « réfléchit… » / « reconnexion… ». |
| Révélation | Tous les marqueurs tombaient en 0,4 s, grille de distances instantanée, pas de gagnant de manche. | Séquence : vraie position → joueurs du plus loin au plus proche (550 ms chacun, le gagnant tombe en dernier) → catégorie par joueur → « X remporte la manche » → bonus. Étiquettes nom sur les marqueurs. |
| Scores | « +842 » apparaissait d'un bloc, totaux invisibles. | Count‑up « +842 » avec ticks, puis « 2 431 → 3 273 » animé. |
| Classement | Flèches seules, aucune histoire. | « ⚡ Alex dépasse Farouq » (son + haptique), « 🔥 Série ×n », « Série perdue », ligne personnelle « Tu es 2e. Tout reste possible. ». |
| Timer | Trois paliers, rien entre 30 et 10 s. | Quatre paliers : calme → attention (15 s) → tension (10 s) → urgence (5 s + vignette). |
| Final | « X l'emporte. Revanche ? » pour tout le monde ; stats seulement personnelles ; partage texte. | Défaite chiffrée (« Tu étais à 180 points. Une bonne manche aurait tout changé. »), tuiles 📍 plus proche / ⚡ plus rapide / 🔥 série, image de partage 1080×1920 avec code d'invitation. |
| Ville | Nom + drapeau. | Tagline par ville (« Méditerranée », « Ville Lumière »…) sur la carte et l'intro. |
| Lieux | Un échec de couverture bloquait le lancement ; mêmes spots possibles entre deux rooms. | Repli sur toutes les zones de la ville avant d'échouer ; mémoire serveur des 300 derniers lieux joués. |
| Erreurs de lancement | Toast fugace. | Bandeau persistant dans le lobby jusqu'au prochain lancement. |
| Lobby vide | Rien. | Après 45 s seul : « Personne n'a encore rejoint. Partage le code — ou lance en solo. » |

## 2. Boucle de jeu (inchangée dans sa structure, resserrée dans son rythme)

```
JOIN → START → INTRO (ville, tagline, 3·2·1, GO) → EXPLORE (timer 4 paliers)
→ GUESS (20 s, verrou) → WAIT (statuts) → REVEAL (scripté, gagnant en dernier)
→ SCORE (count‑up, totaux) → LEADERBOARD (flèches, dépassement, série) → NEXT (hôte ou auto 8 s)
→ FINAL (victoire/défaite chiffrée, stats, partage) → REVANCHE (3 s, sans lobby)
```

Aucun écran intermédiaire n'a été ajouté. Les seules validations humaines restent « Manche suivante » (hôte, auto après 8 s) et « Revanche » (hôte).

## 3. Timings (fichier unique `packages/shared/src/timings.ts`)

Toutes les durées sont dérivées de timestamps serveur ; les clients ne décrémentent rien localement.

| Séquence | Valeurs |
|---|---|
| Intro | titre 1200 → 3·2·1 (700 chacun) → GO 500 = 3 800 ms |
| Révélation | vraie position 500 ms · joueurs à partir de 1 400 ms, 550 ms d'intervalle (du plus loin au plus proche) · gagnant +250 ms · bonus +700 ms · fin +1 300 ms. Durée = `revealDurationMs(n)` (4 joueurs : 5 500 ms, 8 joueurs : 7 700 ms). |
| Scores | lignes à partir de 500 ms, 600 ms d'intervalle (meilleur en premier) · classement = dernière ligne + 1 000 ms (`resultsLeaderboardAt(n)`) · dépassement +700 ms · auto‑avance +8 000 ms |
| Final | 400 / 1 200 / 2 000 / 2 800 ms |
| Timer | attention ≤ 15 s · tension ≤ 10 s (tick) · urgence ≤ 5 s (tick rapide, vignette, haptique 3·2·1) |

Le serveur utilise les mêmes fonctions (`revealDurationMs`, `resultsDurationMs`) pour planifier les phases.

## 4. Scoring (vérifié, conservé)

`points = round(1000 · e^(−d/1400)) × multiplicateur`, bonus +100 strictement sous 200 m, dernière manche ×2 (option). Maximum : 1 100 par manche, 2 100 en finale, 6 500 sur 5 manches.

Simulation (`packages/shared/src/balance.test.ts`, 4 000 parties, profils expert / moyen / mauvais / chanceux) :

| Mesure | Valeur |
|---|---|
| Victoires expert / moyen / mauvais / chanceux | 92 % / 1 % / 0 % / 7 % |
| Leader après la manche 4 qui perd | 10 % (7 % sans finale ×2) |
| Second à ≤ 600 pts après la manche 4 qui gagne | 27 % (22 % sans finale ×2) |
| Égalités | 0 % |
| Entre 4 amis de niveau égal, le leader de la manche 4 perd | ≈ 40 % |

Conclusion : le meilleur joueur est récompensé, la finale doublée crée des retournements crédibles sans les rendre faciles. Aucune modification de formule. Catégories de guess (affichage seulement) : 🔥 Parfait < 50 m · 🎯 Précis < 200 m · 👌 Proche < 500 m · 🙂 Pas loin < 1,5 km · 🧭 Loin.

## 5. Nouvelles interactions, animations, sons, haptiques

**Interactions** : options de création repliées ; onboarding skippable ; bouton « Partager » du final génère une image (feuille native si `navigator.canShare` accepte les fichiers, sinon téléchargement) ; « Réessayer » inline si la vue rue ne charge pas ; bandeau d'erreur de lancement.

**Animations** : marqueurs de révélation `cg-pop` avec étiquette nom ; lignes dessinées (`stroke-dashoffset`) ; tuile du gagnant en ambre ; count‑up des points et des totaux (`useCountUp`, ease‑out, rAF) ; callout de dépassement `cg-pop` ; ligne personnelle `cg-up` ; vignette rouge ≤ 5 s.

**Sons** (`client/src/services/sound.ts`, synthèse Web Audio, un seul toggle) : ajoutés `overtake`, `roundWinner`, `closeGuess` (dernier joueur révélé), `countUp` (ticks de score). Conservés : click, join, introBeep, go, tick, tickFast, timeUp, marker, lock, impact, whoosh, points, perfect, victory, defeat, error.

**Haptiques** (`client/src/services/haptics.ts`) : ajoutés `overtake`, `winner`. Déclencheurs : verrou (medium), 3·2·1 (light), vraie position (heavy), mon joueur révélé (light), gagnant de manche si c'est moi (success), bonus (success), mes points (light), dépassement me concernant (overtake), victoire (success ×2), défaite (medium).

## 6. Règles ajoutées ou précisées

- La révélation montre les joueurs du plus loin au plus proche ; le gagnant de la manche = guess le plus proche (auto inclus).
- Les faits saillants du final excluent les guesses automatiques (plus proche, plus rapide) ; la série la plus longue est affichée dès 2.
- Les lieux joués récemment sur le serveur (300 derniers) sont évités par toutes les rooms, en plus des lieux de la room.
- Si la difficulté choisie n'a pas assez de couverture Street View, le serveur retombe sur toutes les zones de la ville avant d'échouer.

## 7. Bugs corrigés en phase 2

- Le toast du haut débordait à droite (transform écrasé par l'animation).
- La « room précédente » obsolète restait proposée sur l'accueil après expiration.
- Le classement et l'auto‑avance supposaient 4 joueurs ; les durées dépendent maintenant du nombre de joueurs (8 joueurs ne voyaient pas toutes les lignes avant le classement).

## 8. Tests

- Unitaires shared : 34 (dont balance et catégories).
- Serveur : 37 (moteur, lieux, sockets, Postgres+RLS). Nouveau : capture de toutes les trames reçues par un invité avant la révélation — aucune ne contient la position réelle ni les guesses des autres ; intents forgés refusés (phase, doublon, payload invalide).
- E2E Playwright (Chromium, viewport iPhone) : partie à 4 avec rechargement, auto‑guess, finale doublée, revanche ; réglages/lien/départ de l'hôte ; onboarding premier lancement.
- Google réel : `scripts/validate-streetview.mjs` (couverture et latence par zone via l'API metadata) et `e2e/google.spec.ts` (rendu d'un panorama navigable dans 5 villes), tous deux conditionnés à une clé.

## 9. Configuration

Aucune nouvelle variable d'environnement. Aucune nouvelle dépendance. Scripts ajoutés : `node scripts/validate-streetview.mjs <villes…>`, `npx playwright test e2e/google.spec.ts` (avec `GOOGLE_MAPS_API_KEY`).

## 10. Points restants

**P0** — Valider les zones avec de vraies clés (`validate-streetview.mjs`) et déplacer celles sous 50 % de couverture.
**P1** — Mettre l'image de partage en cache ; sons d'ambiance (nappe accueil, ambiance ville) ; skip collectif de la révélation si tous tapent.
**P2** — Modes supplémentaires (contre‑la‑montre, sans bouger, duel) ; motifs par joueur sur les lignes (daltonisme) ; profil/XP.
**FUTURE** — Persistance des rooms vivantes (Redis) pour survivre à un redéploiement ; adaptateur Socket.IO multi‑instances.

---

# HANDOFF TECHNIQUE

## FILES CHANGED (phase 2)

- `packages/shared/src/timings.ts` — nouvelles durées + fonctions `revealMarkerAt`, `revealWinnerAt`, `revealPerfectAt`, `revealDurationMs`, `resultsRowAt`, `resultsLeaderboardAt`, `resultsDurationMs`.
- `packages/shared/src/scoring.ts` — `guessCategory`, `maxRoundPoints`.
- `packages/shared/src/types.ts` — `Standing.previousStreak`, `GameHighlights`, `FinalResults.highlights`.
- `packages/shared/src/cities.ts` — `tagline` par ville.
- `packages/shared/src/balance.test.ts` — simulation d'équilibre.
- `server/src/game/GameRoom.ts` — durées dynamiques, `previousStreak`, `computeHighlights`.
- `server/src/game/RoomManager.ts` — mémoire des lieux récents.
- `server/src/game/locations.ts` — repli sur toutes les zones.
- `server/src/socket/integration.test.ts` — test de secret sur le fil et intents forgés.
- `client/src/screens/RevealScreen.tsx`, `ScoresScreen.tsx`, `FinalScreen.tsx` — réécrits.
- `client/src/components/map/RevealMap.tsx`, `leafletUtils.ts` — ordre de révélation, étiquettes.
- `client/src/screens/CreateScreen.tsx`, `HomeScreen.tsx`, `LobbyScreen.tsx`, `StartingScreen.tsx`, `PlayScreen.tsx` — options repliées, onboarding, notices, tagline.
- `client/src/components/Onboarding.tsx`, `client/src/hooks/useCountUp.ts`, `client/src/services/shareCard.ts` — nouveaux.
- `client/src/components/ui/Timer.tsx`, `PlayerRow.tsx`, `CityCard.tsx`, `services/sound.ts`, `services/haptics.ts`, `services/storage.ts`, `store/gameStore.ts`, `styles/components.css`.
- `scripts/validate-streetview.mjs`, `e2e/google.spec.ts`, `e2e/game.spec.ts`.

## SERVER LOGIC CHANGED

Phase `revealing` dure `revealDurationMs(nombre de guesses)` ; phase `results` dure `resultsDurationMs(nombre de standings)`. Les standings portent `previousStreak`. Le final porte `highlights` (plus proche, plus rapide, série). `RoomManager` enveloppe le sélecteur de lieux pour exclure les 300 derniers lieux joués. `pickLocations` retombe sur toutes les zones si la difficulté demandée ne résout pas.

## DATABASE CHANGES

Aucun (schéma `db/migrations/001_init.sql` inchangé).

## API CHANGES

Protocole socket inchangé. Snapshot : `round.reveal.standings[].previousStreak`, `final.highlights` ajoutés (rétro‑compatibles).

## NEW ENV VARIABLES / DEPENDENCIES

Aucune.

## TESTS ADDED

`balance.test.ts` (6), catégories (2), `integration.test.ts` secret sur le fil + intents forgés, `game.spec.ts` onboarding + beats de révélation + count‑ups, `google.spec.ts` (clé réelle).

## KNOWN ISSUES

- L'image de partage est générée à la demande (~100 ms) ; sur iOS < 16 le partage de fichiers peut être refusé → téléchargement.
- Les tuiles CARTO ne se chargent pas dans l'environnement de test (réseau fermé) ; le rendu réel a été validé uniquement sur la structure des cartes.
- Les zones Street View ne sont validées qu'avec une clé réelle (script fourni).

---

# POUR CLAUDE CODE

## DO NOT BREAK

1. Le serveur reste la seule source de vérité : scores, timers, phases, position réelle. Le client n'envoie qu'une coordonnée (`game:submitGuess`) et des intents.
2. `snapshotFor(playerId)` ne contient jamais `round.reveal` avant la phase `revealing`. Le test `integration.test.ts` le vérifie sur le fil.
3. Toutes les séquences dérivent de timestamps serveur via `useSequence` ; ne jamais réintroduire de `setTimeout` local pour une étape de jeu.
4. Un seul CTA cyan par écran, en bas, 64 px. L'ambre est réservé à la vérité, aux bonus, au podium, à la dernière manche.
5. Les 8 avatars (forme + couleur) et le losange comme marqueur.
6. Les timings de `timings.ts` sont le jeu : les raccourcir casse le suspense.
7. Les tests E2E tournent avec `STREET_VIEW_PROVIDER=mock` ; le mock ne doit jamais être activable par un client.

## IMPORTANT ARCHITECTURAL DECISIONS

- PWA web mobile‑first plutôt qu'Expo : Street View et Leaflet sont des technologies web, un lien suffit pour inviter, et tout est testable avec Playwright.
- État des rooms en mémoire (une instance), Postgres optionnel en écriture continue avec RLS verrouillée.
- Durées de phase dépendantes du nombre de joueurs, calculées par les mêmes fonctions côté serveur et client.

## GAMEPLAY RULES

Voir §4 (scoring) et §6 (règles). Capacité 2–8, manches 3/5/10, exploration 15–60 s, guess 20 s, guess auto au centre à l'expiration, retrait après 20 s de déconnexion (retour possible), hôte transféré après 10 s.

## DESIGN RULES

Handoff design §4–§35 (palette, typographies Bricolage Grotesque + JetBrains Mono embarquées, rayons, boutons, timer, leaderboard). Phase 2 n'a ajouté que des composants qui respectent ces tokens (`.round-winner`, `.overtake`, `.me-line`, `.dist__cat`, `.gmk__label`, `.onboarding`).

## KNOWN EDGE CASES

- Tous les joueurs déconnectés : les timers continuent, la room se ferme après 15 min d'inactivité.
- Un joueur revient après avoir été retiré : il reprend sa place, ses manches manquées valent 0 et pèsent 50 km dans le départage.
- Hôte seul : peut lancer en solo (tous « prêts » = lui).
- Égalité parfaite : départage par distance cumulée ; plusieurs gagnants possibles si tout est égal.
- Vue rue en erreur chez un joueur : le timer démarre pour tous après 4 s maximum, ce joueur garde « Réessayer ».

## NEXT RECOMMENDED TASKS

1. Lancer `scripts/validate-streetview.mjs` avec une clé et ajuster les zones faibles.
2. Jouer 3 vraies parties à 4 sur téléphones et noter les moments d'attente ressentis.
3. Si la revanche n'est pas spontanée : raccourcir l'auto‑avance des scores (8 s → 6 s) avant de toucher à autre chose.
