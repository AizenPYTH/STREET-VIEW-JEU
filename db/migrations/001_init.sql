-- CityGuess — game records.
-- The game server (service connection) is the only writer/reader.
-- Row Level Security is enabled with no policies, so anon/authenticated roles (Supabase REST,
-- Realtime, a leaked anon key…) can never read round locations or guesses.

create extension if not exists pgcrypto;

create table if not exists cities (
  id           text primary key,
  name         text not null,
  country      text not null,
  country_code text not null,
  center_lat   double precision not null,
  center_lng   double precision not null
);

create table if not exists rooms (
  id         uuid primary key,
  code       text not null,
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
create index if not exists rooms_code_idx on rooms (code);
create index if not exists rooms_created_at_idx on rooms (created_at);

create table if not exists players (
  id        uuid primary key,
  room_id   uuid not null references rooms (id) on delete cascade,
  name      text not null check (char_length(name) between 2 and 12),
  avatar    text not null,
  color     text not null,
  joined_at timestamptz not null default now()
);
create index if not exists players_room_idx on players (room_id);

create table if not exists games (
  id               uuid primary key,
  room_id          uuid not null references rooms (id) on delete cascade,
  number           integer not null check (number >= 1),
  city_id          text not null references cities (id),
  settings         jsonb not null,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  winner_player_id uuid references players (id) on delete set null,
  unique (room_id, number)
);
create index if not exists games_room_idx on games (room_id);

create table if not exists game_players (
  game_id          uuid not null references games (id) on delete cascade,
  player_id        uuid not null references players (id) on delete cascade,
  total_score      integer not null default 0 check (total_score >= 0),
  total_distance_m double precision,
  rank             integer check (rank >= 1),
  primary key (game_id, player_id)
);

create table if not exists rounds (
  id              uuid primary key,
  game_id         uuid not null references games (id) on delete cascade,
  index           integer not null check (index >= 0),
  city_id         text not null references cities (id),
  zone_name       text not null,
  provider        text not null check (provider in ('google', 'mock')),
  pano_id         text not null,
  multiplier      integer not null default 1 check (multiplier >= 1),
  -- The real location. Never exposed to clients before the reveal.
  lat             double precision not null check (lat between -90 and 90),
  lng             double precision not null check (lng between -180 and 180),
  explore_ends_at timestamptz,
  revealed_at     timestamptz,
  unique (game_id, index)
);
create index if not exists rounds_game_idx on rounds (game_id);

create table if not exists guesses (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references rounds (id) on delete cascade,
  player_id    uuid not null references players (id) on delete cascade,
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  distance_m   double precision not null check (distance_m >= 0),
  score        integer not null check (score >= 0),
  bonus        integer not null default 0 check (bonus >= 0),
  time_ms      integer not null check (time_ms >= 0),
  -- true when the server placed the guess at the city centre because the player ran out of time
  auto         boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (round_id, player_id)
);
create index if not exists guesses_player_idx on guesses (player_id);

-- Lock everything down for non‑service roles (Supabase: anon / authenticated).
alter table cities       enable row level security;
alter table rooms        enable row level security;
alter table players      enable row level security;
alter table games        enable row level security;
alter table game_players enable row level security;
alter table rounds       enable row level security;
alter table guesses      enable row level security;

-- Cities are public reference data; everything else stays private (no policy = no access).
drop policy if exists cities_public_read on cities;
create policy cities_public_read on cities for select using (true);
