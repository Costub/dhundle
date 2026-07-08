# Stems & Content Pipeline

How puzzle audio gets made, added, and managed. You produce the stems and the
song info; then either the **`/admin` dashboard** (upload + schedule + song
catalog in the browser) or the CLI scripts below turn them into a scheduled
puzzle.

## The /admin dashboard (easiest path)

Open `/admin` (unlock with `ADMIN_SECRET` locally, or Google sign-in with an
`ADMIN_EMAILS` address in production). Three tabs:

- **Overview** — backend status, upcoming 14-day schedule with gaps, and
  one-click puzzle removal.
- **Schedule** - pick a date and song, add an official link, choose 4-6 stem
  files at the same time, set the trim start/length, preview the mixed hook,
  reorder/label the reveal ladder, then "Upload & schedule" does everything:
  ffmpeg trims each stem to the same Opus hook, files go to Supabase Storage
  when configured or `public/stems/<date>/` in local dev, and the puzzle row is
  created/replaced.
- **Songs** - search the whole catalog, add, edit, or remove songs. Admin
  metadata is limited to Movie, Year, Artist, and Actor; title and aliases are
  catalog/search fields. The add-song form has a **"Prefill from Spotify"**
  search when Spotify credentials are configured: pick a track and
  title/movie/year/artists fill automatically — you add actors/aliases — and
  the track's public link is shown with a copy button to reuse as the
  puzzle's official link on the Schedule tab.

The dashboard can trim raw exports during upload as long as ffmpeg is installed
and visible to the server running Next.js. If you see `spawnSync ffmpeg ENOENT`,
install ffmpeg (`winget install Gyan.FFmpeg` on Windows), run `where ffmpeg` in
a fresh terminal, set `FFMPEG_PATH` in `.env.local` to the full `ffmpeg.exe`
path, and restart the dev server. You can also turn off **Trim on upload with
ffmpeg** and upload stems that are already trimmed to the same hook length. You
can still pre-trim with `scripts/trim-stems.mjs` for bulk/offline preparation.
Everything the dashboard does also works without Supabase: writes land in
`data/*.json` and `public/stems/`, same as the CLI.

## 1. Produce the stems

### Option A — split with fadr.com/stems (free web UI) + trim helper

1. Go to [fadr.com/stems](https://fadr.com/stems), upload the song, and
   download the separated stems (vocals, drums, bass, melody/other) into one
   folder per song, e.g. `downloads/tum-hi-ho/`.
2. Run the local trim helper (needs ffmpeg — `winget install ffmpeg`):

```bash
# Cuts every stem to the same 25s hook starting at 45s, encodes Opus 64k,
# names them for the reveal ladder, writes a puzzle.json stub:
node scripts/trim-stems.mjs downloads/tum-hi-ho --start 45 --duration 25

# Wrong hook window? Source files are untouched — just run again:
node scripts/trim-stems.mjs downloads/tum-hi-ho --start 62
```

Files are matched by filename keywords (drums / bass / melody-or-other /
vocals) and become `1-drums → 2-bass → 3-melody → 4-vocals` in
`incoming/<slug>/`. An "instrumental" download is skipped on purpose — the
player layers stems live, so it would double up drums/bass/melody. Rename or
re-order the output files before ingesting if a song works better with a
different ladder. (`incoming/` is gitignored, so audio sources never get
committed.)

### Option B — produce stems yourself

Any DAW export or MIDI re-creation works (basic-pitch → MuseScore →
`fluidsynth` → ffmpeg is one path); the pipeline only cares about the files.
You need **4–6 audio files**, one per layer, revealed in whatever order you
name them — e.g. rhythm → bass → keys → strings → lead melody → full mix.
The instrument names are yours to choose per song (a classical number might
use "Harmonium" and "Tabla") — whatever you name the files is what players see.

**Technical requirements (both options):**

- **Same length, loop-cleanly**: all stems in one puzzle must be the same
  duration (~20–30 s of the hook). The player loops them sample-locked and
  mutes/solos them live, so they must stay in sync.
- **Format**: Opus at 64 kbps is the sweet spot (`.opus`); `.mp3`, `.m4a`,
  `.ogg`, `.wav` also work. Keep files small — every visitor downloads them.
- **Balance**: keep the stems' natural relative volumes (they should sum back
  to the full mix). Don't loudness-normalize each stem individually.

## 2. Prepare a puzzle folder

Make a folder anywhere (e.g. `incoming/tum-hi-ho/`) containing the stems named
`<position>-<instrument>.<ext>` plus a `puzzle.json`:

```
incoming/tum-hi-ho/
├── puzzle.json
├── 1-rhythm.opus
├── 2-bass.opus
├── 3-keys.opus
├── 4-strings.opus
├── 5-lead-melody.opus
└── 6-full-mix.opus
```

Multi-word instruments use hyphens: `5-lead-melody.opus` → "Lead Melody".

`puzzle.json`:

```json
{
  "songId": "tum-hi-ho-aashiqui-2",
  "date": "2026-07-20",
  "officialLink": "https://www.youtube.com/watch?v=..."
}
```

- `songId` — must match an entry in `data/songs.json` (the guessable catalog).
- `date` — the IST day this puzzle runs (`YYYY-MM-DD`). One puzzle per day.
- `officialLink` — shown on the reveal screen ("Listen to the original").

**Song not in the catalog yet?** Add a `song` block and the pipeline registers
it in `data/songs.json` for you:

```json
{
  "songId": "new-song-slug",
  "date": "2026-07-21",
  "officialLink": "https://...",
  "song": {
    "title": "Song Title",
    "movie": "Movie Name",
    "year": 2019,
    "singers": ["Arijit Singh"],
    "actors": ["Aditya Roy Kapur", "Shraddha Kapoor"],
    "aliases": ["Alternate Spelling"]
  }
}
```

`actors` and `aliases` are optional, but actor metadata powers the Actor hint.
Add common alternate spellings to `aliases` so players' typing matches the
catalog search.

## 3. Run the pipeline

```bash
# Validate without writing anything
node scripts/add-puzzle.mjs incoming/tum-hi-ho --dry

# Ingest for real
node scripts/add-puzzle.mjs incoming/tum-hi-ho
```

This validates everything (song exists, date free, stems contiguous and 4–6),
then:

1. Copies stems to `public/stems/<date>/stem-<n>.opus`. Files and URLs are
   deliberately named by **date, not song** — stem URLs are visible in
   devtools before the game ends, so they must never spoil the answer.
2. Appends the puzzle to `data/puzzles.json` (kept sorted by date).
3. Adds the song to `data/songs.json` if you supplied a `song` block.

Commit the resulting changes (`public/stems/`, `data/*.json`) and deploy —
the puzzle goes live automatically at midnight IST on its date.

## 4. Manage the schedule

```bash
# What's scheduled? Which of the next 14 days have no puzzle?
node scripts/add-puzzle.mjs --list

# Health-check every registered puzzle (missing files, duplicate dates…)
node scripts/add-puzzle.mjs --validate
```

Things to know:

- **Fallback**: days with no dated puzzle show "no puzzle scheduled". If you
  ever want a rotation fallback instead, add puzzles without a `date` to
  `data/puzzles.json` — undated entries rotate on empty days.
- **Fixing a mistake**: to change a puzzle's date or link, edit its entry in
  `data/puzzles.json` directly. To replace stems, overwrite the files in
  `public/stems/<date>/`. To remove a puzzle, delete its entry and folder.
- **Don't reveal the future**: `data/puzzles.json` maps dates to songs, so
  keep the repo private (or move puzzles to Supabase before opening it up).

## 5. Supabase mode

When Supabase env vars are configured (see [DEPLOYMENT.md](DEPLOYMENT.md) for
the full migration order; `0001_initial_schema.sql` creates the `songs`,
`puzzles`, and `stems` tables), `/admin` writes catalog songs and scheduled
puzzles directly to Supabase and uploads audio to the public `stems` storage
bucket. Without those env vars, the same admin actions write local JSON and
`public/stems/` so development stays offline-friendly.

The CLI path is still useful for batch ingest into local files. The browser
admin path is the source of truth for production content entry once Supabase is
configured. Tracked in [ROADMAP.md](../ROADMAP.md).
