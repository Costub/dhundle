-- Dhoondle initial schema (run in Supabase SQL editor or via `supabase db push`).

create table songs (
  id text primary key, -- slug, e.g. 'tum-hi-ho-aashiqui-2'
  title text not null,
  movie text not null,
  year int not null check (year between 1930 and 2100),
  singers text[] not null default '{}',
  actors text[] not null default '{}',
  music_director text not null,
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table puzzles (
  id uuid primary key default gen_random_uuid(),
  song_id text not null references songs(id),
  puzzle_date date unique, -- IST date this puzzle goes live; null = unscheduled draft
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  official_link text,
  notes text,
  created_at timestamptz not null default now()
);

create table stems (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  position int not null check (position between 1 and 6),
  instrument_label text not null,
  storage_path text not null, -- path in the 'stems' storage bucket
  duration_s numeric,
  unique (puzzle_id, position)
);

create table game_results (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid not null references puzzles(id) on delete cascade,
  user_id uuid, -- Supabase auth user id once signed in; null for anonymous
  anonymous_device_id text,
  status text not null check (status in ('won', 'lost')),
  attempts int not null check (attempts between 1 and 6),
  hints_used int not null default 0 check (hints_used between 0 and 5),
  finished_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (puzzle_id, user_id),
  unique (puzzle_id, anonymous_device_id),
  check (user_id is not null or anonymous_device_id is not null)
);

create index puzzles_status_date_idx on puzzles (status, puzzle_date);
create index puzzles_song_id_idx on puzzles (song_id);
create index stems_puzzle_id_idx on stems (puzzle_id);
create index game_results_puzzle_id_idx on game_results (puzzle_id);
create index game_results_user_id_idx on game_results (user_id) where user_id is not null;
create index game_results_anonymous_device_id_idx
  on game_results (anonymous_device_id)
  where anonymous_device_id is not null;

-- RLS: the app server uses the service-role key; nothing is exposed to anon.
alter table songs enable row level security;
alter table puzzles enable row level security;
alter table stems enable row level security;
alter table game_results enable row level security;

-- Storage: create a public bucket named 'stems' for rendered audio
-- (stem audio is not a spoiler — it never contains the song title).
