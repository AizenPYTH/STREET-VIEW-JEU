# CityGuess

**Devine la ville. Bats tes amis.** — un jeu mobile multijoueur (2 à 8 joueurs, idéal 4) : tout le monde atterrit au même endroit en vue rue, explore, place un marqueur sur la carte, puis la vraie position est révélée. Plus tu es proche, plus tu marques. Cinq manches, la dernière en points doublés, puis **REVANCHE**.

L'app est une PWA mobile‑first (React + TypeScript strict) pilotée par un serveur de jeu autoritaire (Node + Socket.IO). Le serveur est la seule source de vérité : timer, position réelle, scores, classement, phases.

```
ACCUEIL ─┬─ Jouer ──▶ CRÉER ROOM ──▶ VILLE ──▶ LOBBY (hôte)
         └─ Rejoindre ──▶ CODE ──▶ PSEUDO ──▶ LOBBY (invité)
LOBBY ──▶ INTRO ──▶ MANCHE ──▶ GUESS ──▶ ATTENTE ──▶ RÉVÉLATION ──▶ SCORES ─┬─ (×n) ──▶ INTRO
                                                                            └─ FINAL ──▶ REVANCHE
```

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Variables d'environnement](#variables-denvironnement)
- [Clés Google Maps](#clés-google-maps)
- [Base de données (optionnelle, compatible Supabase)](#base-de-données-optionnelle-compatible-supabase)
- [Scripts](#scripts)
- [Tests](#tests)
- [Architecture](#architecture)
- [Règles du jeu et barème](#règles-du-jeu-et-barème)
- [Sécurité et anti‑triche](#sécurité-et-anti-triche)
- [Déploiement](#déploiement)
- [Ajouter une ville](#ajouter-une-ville)
- [Limites connues](#limites-connues)

## Démarrage rapide

Prérequis : Node 20+.

```bash
npm install
cp .env.example .env          # puis renseigne les clés Google (ou STREET_VIEW_PROVIDER=mock)
npm run dev                   # serveur sur :3000, client Vite sur :5173 (proxy /api et /socket.io)
```

Ouvre `http://localhost:5173` sur plusieurs appareils du même réseau (`http://<ip-locale>:5173`), ou plusieurs onglets en navigation privée (chaque onglet privé = un appareil).

Sans clé Google, lance le serveur en mode simulé pour tester la boucle complète :

```bash
STREET_VIEW_PROVIDER=mock npm run dev
```

Le mode `mock` remplace la vue rue par un panorama procédural (déterministe, même lieu pour tous). Il sert aux tests automatisés et au développement sans clé ; il n'est jamais utilisé en production avec le fournisseur Google.

## Variables d'environnement

Toutes les variables sont documentées dans [`.env.example`](.env.example).

| Variable | Rôle |
|---|---|
| `PORT` | Port du serveur (API + websockets + client en production). Défaut `3000`. |
| `NODE_ENV` | `production` sert `client/dist` et applique `CORS_ORIGIN`. |
| `CORS_ORIGIN` | Origine(s) autorisée(s) si le client est hébergé ailleurs que le serveur. |
| `STREET_VIEW_PROVIDER` | `google` (défaut) ou `mock`. |
| `GOOGLE_MAPS_SERVER_KEY` | Clé serveur : résolution des panoramas (Street View metadata API). |
| `GOOGLE_MAPS_BROWSER_KEY` | Clé navigateur : Maps JavaScript API (Street View) envoyée aux joueurs. |
| `GOOGLE_MAPS_API_KEY` | Raccourci dev : une seule clé pour les deux rôles. |
| `DATABASE_URL` | Postgres (Supabase, Neon, local…). Vide = tout en mémoire. |
| `DATABASE_SSL` | `require` si le fournisseur impose TLS. |
| `VITE_SERVER_URL` | (client, build) URL du serveur si le client est hébergé séparément. |

Aucune clé n'est jamais écrite dans le code. La clé navigateur est publique par nature : restreins‑la par référent HTTP.

## Clés Google Maps

Deux clés distinctes, parce qu'elles vivent dans deux endroits différents et ne doivent pas avoir les mêmes droits :

| | Clé **serveur** `GOOGLE_MAPS_SERVER_KEY` | Clé **navigateur** `GOOGLE_MAPS_BROWSER_KEY` |
|---|---|---|
| Où elle vit | Variable d'environnement du serveur, jamais envoyée au client | Envoyée à chaque joueur par `/api/config`, visible dans le navigateur |
| Ce qu'elle appelle | `maps.googleapis.com/maps/api/streetview/metadata` pour transformer un point aléatoire en vrai panorama (endpoint **gratuit**) | Maps JavaScript API pour afficher et naviguer dans le panorama (facturé au‑delà du quota gratuit mensuel) |
| API à activer | **Street View Static API** | **Maps JavaScript API** |
| Restriction recommandée | **Adresse IP** du serveur (une clé restreinte par référent est refusée côté serveur) | **Référent HTTP** = ton domaine (`https://cityguess.example.com/*`) |
| Si elle fuit | Un tiers peut faire des requêtes metadata gratuites avec ton quota | Un tiers ne peut l'utiliser que depuis ton domaine |

Étapes :

1. [Google Cloud Console](https://console.cloud.google.com/) → projet → facturation activée (obligatoire pour Maps Platform, même dans le quota gratuit).
2. APIs & Services → activer **Maps JavaScript API** et **Street View Static API**.
3. Identifiants → deux clés avec les restrictions ci‑dessus.
4. `.env` : `STREET_VIEW_PROVIDER=google`, `GOOGLE_MAPS_SERVER_KEY=…`, `GOOGLE_MAPS_BROWSER_KEY=…`.
5. En développement local uniquement, une seule clé sans restriction dans `GOOGLE_MAPS_API_KEY` remplit les deux rôles.

Validation réelle (à faire avec tes clés, voir [Tests](#tests)) : `scripts/validate-streetview.mjs` et `e2e/google.spec.ts`.

Les cartes de guess et de révélation utilisent Leaflet avec les tuiles CARTO Voyager (gratuites, attribution OpenStreetMap/CARTO conservée) : aucune clé nécessaire.

## Base de données (optionnelle, compatible Supabase)

Le jeu tourne entièrement en mémoire. Si `DATABASE_URL` est défini, le serveur enregistre en écriture continue rooms, joueurs, parties, manches (avec la position réelle), guesses (avec distance, score, bonus, temps, `auto`) et classements finaux. Les rooms en cours ne sont pas restaurées après un redémarrage du serveur (voir limites).

```bash
DATABASE_URL=postgres://user:pass@host:5432/cityguess npm run db:migrate -w server
```

Les migrations SQL reproductibles sont dans [`db/migrations`](db/migrations). Schéma :

- `cities` — référentiel (synchronisé au démarrage depuis la config)
- `rooms` (id, code, created_at, closed_at)
- `players` (room_id, name, avatar, color, joined_at)
- `games` (room_id, number, city_id, settings jsonb, started_at, finished_at, winner_player_id)
- `game_players` (total_score, total_distance_m, rank)
- `rounds` (game_id, index, pano_id, multiplier, lat, lng, explore_ends_at, revealed_at)
- `guesses` (round_id, player_id, lat, lng, distance_m, score, bonus, time_ms, auto, submitted_at)

**RLS** : la sécurité au niveau des lignes est activée sur toutes les tables sans aucune policy pour `anon`/`authenticated` (sauf lecture de `cities`). Seule la connexion de service du serveur lit et écrit. Une clé anon Supabase divulguée ne donne donc accès ni aux positions réelles ni aux guesses. Avec Supabase, utilise la chaîne de connexion directe ou le pooler (`DATABASE_SSL=require`).

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Build du package partagé puis serveur (`tsx watch`) + client (Vite) en parallèle |
| `npm run build` | Build shared → server → client (`client/dist`) |
| `npm start` | Démarre le serveur compilé (sert aussi `client/dist` en production) |
| `npm run typecheck` | TypeScript strict sur les trois packages |
| `npm test` | Tests unitaires et d'intégration (shared + server) |
| `npm run test:e2e` | Partie complète à 4 téléphones émulés (Playwright) |
| `npm run db:migrate -w server` | Applique les migrations SQL |

## Tests

- **Unitaires (shared)** : distance haversine, barème `calculateScore`, codes de room, classement/égalités, cohérence de la config des villes.
- **Moteur (server)** : partie complète à 4, solo et à 8, blocage tant que tout le monde n'est pas PRÊT, démarrage synchronisé du timer (attente des vues rue, max 4 s), guess auto au centre à l'expiration, guesses en retard / doublons / invalides, secret de la position avant révélation, déconnexion (retrait après 20 s, retour possible), transfert d'hôte, départ en cours de partie, revanche et nouvelle ville, échec de chargement des lieux, sélection des lieux (zones, séparation, exclusions), parsing de l'API Google.
- **Transport (server)** : 4 vrais sockets, reconnexion, erreurs explicites, config publique sans secret.
- **Persistance (server)** : migrations + écritures réelles sur Postgres + vérification RLS (`TEST_DATABASE_URL=postgres://… npm test -w server`).
- **E2E (Playwright, Chromium, viewport iPhone)** : 4 appareils → créer, rejoindre au clavier, lobby PRÊT, intro, manche, guess anticipé, rechargement en pleine manche, révélation scriptée (joueurs un par un, gagnant de manche), scores animés, auto‑guess, dernière manche doublée, final, revanche ; réglages, lien d'invitation, départ de l'hôte ; onboarding du premier lancement.
- **Google réel** (nécessite une clé) : `GOOGLE_MAPS_SERVER_KEY=… node scripts/validate-streetview.mjs marseille paris london tokyo new-york` mesure la couverture et la latence de chaque zone ; `GOOGLE_MAPS_API_KEY=… npx playwright test e2e/google.spec.ts` rend un panorama navigable dans cinq villes.

```bash
npm test
npx playwright test          # nécessite `npm run build` au préalable
```

## Architecture

```
packages/shared/   types, timings.ts (toutes les durées scriptées), scoring, geo, villes/zones, protocole socket
server/            moteur de jeu autoritaire (GameRoom, RoomManager), sélection des lieux, fournisseurs Street View, socket, persistance
client/            PWA React : écrans, design system (tokens §4–§8 du handoff), store, services (socket, horloge serveur, son, haptique)
db/migrations/     SQL reproductible (Postgres / Supabase)
e2e/               tests Playwright multi‑appareils
```

Points clés :

- **Machine à états** (`server/src/game/GameRoom.ts`) : `waiting → starting → round → guessing → revealing → results → … → finished`. Chaque transition est planifiée par le serveur ; les clients reçoivent un *snapshot* personnalisé (`snapshotFor(playerId)`) qui ne contient jamais la position réelle ni les guesses des autres avant la révélation.
- **Horloge** : les snapshots portent `serverNow` et les timestamps de chaque phase (`introStartsAt`, `exploreEndsAt`, `revealStartsAt`, `resultsStartsAt`…). Le client calcule son décalage d'horloge et dérive compte à rebours et séquences (révélation en 5 temps, scores, final) de ces timestamps : tous les téléphones sont synchrones et changer l'heure du téléphone ne sert à rien.
- **Lieux** : chaque ville définit des zones (centre, rayon, difficulté). Le serveur tire des points aléatoires, les « snappe » sur un vrai panorama via l'API metadata, impose une séparation minimale et évite les lieux des parties précédentes de la room. Tous les joueurs reçoivent le même `panoId`.
- **Reconnexion** : un jeton par appareil (localStorage) identifie le joueur ; rechargement ou coupure réseau → `room:rejoin` et reprise exacte de la phase en cours. Un joueur déconnecté passe en « reconnexion… » puis est retiré après 20 s (il peut revenir). L'hôte est transféré après 10 s.
- **Design** : tokens, typographies (Bricolage Grotesque + JetBrains Mono embarquées), composants et timings suivent le document de design (un seul CTA cyan par écran, ambre réservé à la vérité/bonus/podium, losange = marqueur du joueur).

## Règles du jeu et barème

- 2 à 8 joueurs, capacité choisie à la création ; 3, 5 ou 10 manches ; 15/30/45/60 s d'exploration ; 20 s pour placer le marqueur.
- `points = round(1000 × e^(−d / 1400))` (d en mètres) : 0 m = 1000, 500 m ≈ 700, 1 km ≈ 490, 2 km ≈ 240, 5 km ≈ 28.
- Bonus **+100** strictement sous 200 m (catégories affichées : 🔥 Parfait < 50 m, 🎯 Précis < 200 m, 👌 Proche < 500 m, 🙂 Pas loin < 1,5 km, 🧭 Loin).
- Dernière manche : courbe ×2 (option « Dernière manche ×2 »). Maximum 1 100 par manche, 2 100 en finale.
- Timer à 0 sans marqueur : guess automatique au centre de la ville (tag « auto »), jamais 0 par défaut.
- Classement par total décroissant, égalité départagée par distance cumulée. Flèches de mouvement, « X dépasse Y », écart au leader, série (manches consécutives au meilleur score) et « Série perdue ».
- Équilibre vérifié par simulation (`packages/shared/src/balance.test.ts`) : un expert gagne ~92 % contre des profils plus faibles, un second à moins de 600 pts avant la finale gagne ~27 %, égalités ~0 %. Détails dans [`docs/PHASE2_HANDOFF.md`](docs/PHASE2_HANDOFF.md).

## Sécurité et anti‑triche

- Scores, distances, classement, timer et transitions : **serveur uniquement**. Le client n'envoie qu'une coordonnée.
- La position réelle n'est jamais transmise avant la révélation ; seul l'identifiant de panorama circule. Limite connue : l'API Street View du navigateur expose la position du panorama à qui ouvre les outils de développement (comme dans tout jeu de ce type) ; la base de données, elle, est verrouillée par RLS.
- Validation de toutes les entrées (zod), limitation de débit par socket, actions d'hôte vérifiées côté serveur, guesses hors phase ou en double refusés.
- Aucune clé secrète côté client ; la clé navigateur doit être restreinte par référent.

## Déploiement

### Serveur + client (recommandé : un seul service)

```bash
npm run build
NODE_ENV=production PORT=3000 STREET_VIEW_PROVIDER=google \
GOOGLE_MAPS_SERVER_KEY=… GOOGLE_MAPS_BROWSER_KEY=… npm start
```

- Le `Dockerfile` construit tout et lance `node server/dist/index.js` (Fly.io, Railway, Render, VPS…).
- **Une seule instance** : l'état des rooms est en mémoire (pas d'adaptateur Socket.IO multi‑instances). Un redéploiement termine les parties en cours.
- **HTTPS obligatoire** : installation PWA, `navigator.share`, presse‑papiers et vibrations l'exigent. Un domaine + certificat (Let's Encrypt via la plateforme).
- **WebSocket** : le client tente `websocket` puis `polling`. Derrière un reverse proxy, transmettre l'upgrade :

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 120s;
}
```

  Sur Fly/Railway/Render, les websockets passent sans configuration. Pas besoin de sticky sessions tant qu'il n'y a qu'une instance.
- **PWA** : `manifest.webmanifest` + icônes sont servis par le serveur ; `index.html` est servi avec `Cache-Control: no-cache`, les assets Vite sont hashés (cache long). Pas de service worker (volontaire : un jeu temps réel ne doit pas servir un client périmé).

### Client séparé (optionnel)

Build avec `VITE_SERVER_URL=https://api.exemple.com` (Vercel/Netlify) et `CORS_ORIGIN=https://app.exemple.com` côté serveur. Les deux origines doivent être en HTTPS.

### Base de données

Optionnelle. Créer un projet Supabase (ou tout Postgres), appliquer `db/migrations/*.sql` (`npm run db:migrate -w server`), fournir `DATABASE_URL` (chaîne de connexion directe ou pooler, **jamais** la clé anon ni la service role key dans le client) et `DATABASE_SSL=require`.

### Variables en production

`NODE_ENV=production`, `PORT`, `STREET_VIEW_PROVIDER=google`, `GOOGLE_MAPS_SERVER_KEY`, `GOOGLE_MAPS_BROWSER_KEY`, optionnellement `DATABASE_URL` + `DATABASE_SSL`, et `CORS_ORIGIN` si le client est sur une autre origine. Aucune clé ne doit être commitée : `.env` est ignoré par git, `.env.example` ne contient que des champs vides.

## Dépannage

| Symptôme | Cause probable | Remède |
|---|---|---|
| « STREET_VIEW_PROVIDER=google requires … » au démarrage | clés manquantes | renseigner les deux clés ou `GOOGLE_MAPS_API_KEY`, ou `STREET_VIEW_PROVIDER=mock` |
| Lobby : « clé Google refusée (REQUEST_DENIED) » | clé serveur sans Street View Static API, ou restreinte par référent | activer l'API, restreindre par IP |
| Lobby : « quota Google dépassé » | quota metadata ou facturation | vérifier la facturation / les quotas dans la console |
| Lobby : « Google met trop de temps à répondre » | réseau sortant du serveur lent ou bloqué | vérifier l'accès à `maps.googleapis.com` depuis le serveur |
| Lobby : « Impossible de trouver assez de lieux » | couverture Street View faible dans les zones | lancer `scripts/validate-streetview.mjs <ville>` et déplacer les zones |
| Manche : « La vue rue n'a pas chargé » | clé navigateur sans Maps JavaScript API, référent non autorisé, ou réseau du joueur | console du navigateur (message Google), vérifier référent `https://domaine/*` |
| « Connexion perdue » en boucle | websocket bloqué par le proxy | configuration nginx ci‑dessus, ou vérifier que `/socket.io/` atteint le serveur |
| Les joueurs ne passent pas « Prêt » | la vue rue ne se charge pas sur leur appareil | idem « La vue rue n'a pas chargé » |
| Partage sans image | navigateur sans partage de fichiers | l'image est téléchargée à la place |
| `npm test` échoue sur Postgres | `TEST_DATABASE_URL` pointe vers une base inaccessible | lancer Postgres ou retirer la variable (le test est ignoré sans elle) |

## Ajouter une ville

Ajoute une entrée dans `packages/shared/src/cities.ts` : nom, pays, drapeau, centre, `bounds` (vue initiale de la carte), `maxRadiusMeters`, `hue` (teinte de la carte ville), `stars` (1–4) et des zones `z('Quartier', lat, lng, rayon, difficulté)` pour chaque niveau. Les tests vérifient automatiquement la cohérence (zones dans les limites, chaque difficulté couverte). Aucune modification du moteur n'est nécessaire.

## Phase 2 — game feel

Le document [`docs/PHASE2_HANDOFF.md`](docs/PHASE2_HANDOFF.md) décrit l'audit, la révélation en suspense (joueurs du plus loin au plus proche, gagnant de manche), les scores animés, les dépassements et séries, les quatre paliers du timer, l'onboarding, les états vides, l'image de partage 1080×1920 et la vérification d'équilibre du barème.

## Statut de release

**READY — GOOGLE VALIDATION REQUIRED.** Tout est testé sauf l'exécution réelle du fournisseur Google (aucune clé disponible pendant le développement). Checklist et détails dans [`docs/FINAL_HANDOFF.md`](docs/FINAL_HANDOFF.md).

## Limites connues

- Les rooms vivent en mémoire : un redémarrage du serveur termine les parties en cours (la base, si configurée, garde l'historique).
- Image de partage 1080×1920 (P1 du handoff) non générée : le partage envoie un texte + lien d'invitation.
- Les vibrations dépendent de `navigator.vibrate` (Android/Chrome) ; iOS Safari les ignore.
- Le mode `mock` ne reflète pas la qualité de couverture Street View d'une ville : vérifie les zones avec de vraies clés avant une sortie publique.
