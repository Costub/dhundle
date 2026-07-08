# Dhoondle

**Wordle x Bandle, for Bollywood.** One hidden song per day. You start hearing
a single instrument stem and get 4-6 attempts depending on that puzzle's stem
ladder. Every wrong guess or skip unlocks the next stem. Metadata hints (year,
artist, actor, movie) are optional: reveal them manually whenever you want, and
every hint used is counted in your final result and share grid. Wrong guesses
give Wordle-style proximity feedback: same movie / shared singer / right decade
/ older-newer.

## Run it

```bash
npm install
npm run dev                            # http://localhost:3000
```

The game shows "no puzzle scheduled" until content is added. Add songs and
schedule puzzles via `/admin` or the CLI pipeline below. Daily gameplay and
admin content editing can run against local JSON files (`data/*.json`,
`public/stems/`) until Supabase credentials are configured. Account-backed
surfaces (`/leaderboard`, `/archive`, and `/puzzle/[date]`) require Supabase
Google sign-in.

## How it fits together

- `lib/` - game core: [types.ts](lib/types.ts), IST day/puzzle-number logic
  ([day.ts](lib/day.ts)), search normalization ([catalog.ts](lib/catalog.ts)),
  guess proximity feedback ([feedback.ts](lib/feedback.ts)), on-demand hint lookup
  ([hints.ts](lib/hints.ts)), puzzle store ([puzzles.ts](lib/puzzles.ts)), and
  localStorage state/stats ([storage.ts](lib/storage.ts)).
- `app/api/` - `GET /api/puzzle/today` (never contains the answer),
  `POST /api/guess` (server-side answer check, so devtools can't spoil),
  `GET /api/search` (Spotify-only guess-box song search; see
  `lib/musicSearch.ts`), `POST /api/hint` (manual hint reveal),
  `POST /api/result` (finished-game result persistence), auth/admin routes, and
  admin/internal catalog routes.
- `components/` - `StemPlayer` (Web Audio API, sample-locked multi-stem sync with
  mute/solo chips), `GuessInput` (searches Spotify only when
  `SPOTIFY_CLIENT_ID/SECRET` are set; it never merges in-house catalog matches,
  and typed alias submission still works), `GuessList`, `HintPanel`,
  `RevealCard` (stats, share grid, countdown), and `HowToPlay`.
- `data/songs.json` - the answer catalog (grow it via `/admin` or the CLI; it is
  not shipped to the game client as autocomplete data). Guesses are not limited
  to this catalog: Spotify picks are re-resolved server-side, matched against the
  catalog for the win check, and otherwise get proximity feedback from their own
  public metadata (movie/album, artists, year).
- `data/puzzles.json` - puzzle schedule for local/dev mode. A puzzle with a
  `date` runs on that IST day; undated puzzles rotate as a fallback if any exist.
- `/archive` - signed-in replay of any previous day (`/puzzle/[date]`); archive
  plays are stored separately and never affect the daily streak, but completion
  badges are synced through the Supabase account when configured.
- `/leaderboard` - signed-in daily and all-time standings with an optional
  public display name. Raw user/device ids never leave the server; rows expose
  only opaque hashes.
- `/admin` - content console: add/edit songs, prefill metadata from Spotify,
  upload 4-6 stems, preview/trim the hook window, and schedule or replace
  puzzles.

## Privacy and launch plumbing

The browser stores the current game, local stats, archive state, and an
anonymous device id in localStorage. The device id is sent only to the game APIs
so guesses, hints, and finished results can be rate-limited and local/dev
results can still work without Supabase. Finished results go through
`POST /api/result`; when Supabase env vars are set, result writes require the
Google session and are stored in `game_results.user_id`. Legacy/local anonymous
rows remain readable, but signed-in leaderboard identity is account-based. Set
`DHUNDLE_TOKEN_SECRET` in production so signed play tokens cannot be forged.

Current in-app rate limits are in-memory, per server process:

- `GET /api/search`: 40 requests per minute per IP.
- `POST /api/guess`: 24 requests per minute per IP/device, plus signed
  per-puzzle attempt tokens.
- `POST /api/hint`: 20 requests per minute per IP/device.
- `POST /api/result`: 12 requests per minute per IP/device.
- `GET /api/leaderboard`: 30 requests per minute per IP.

For a public launch, add platform-level protection such as Vercel Firewall or a
Redis/Upstash-backed distributed limiter. Spotify also applies its own app-level
Web API quota, and 429 responses include a `Retry-After` value.

## Admin and deployment

Google OAuth via Supabase is the player account system for leaderboard and past
challenges. `/admin` adds an authorization layer on top: only signed-in emails
listed in `ADMIN_EMAILS`, or a local `ADMIN_SECRET`, can access the content
console. It shows schedule coverage, environment readiness, and a single-page
scheduling flow for metadata, stem upload, trim preview, storage, and puzzle
insertion. With Supabase env vars configured it writes to Supabase; otherwise it
writes local JSON and `public/stems/` for development.

Deployment setup is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Copy
[.env.example](.env.example), set the Supabase/Vercel/Spotify values, and run
`npm run validate:puzzles` before shipping content.

## Adding puzzles

Split each song into stems (for example, the free fadr.com/stems web UI),
download them into a folder, then two scripts take it from there:

```bash
node scripts/trim-stems.mjs downloads/<song>         # cut all stems to the same
                                                     # hook window, encode, stage
node scripts/add-puzzle.mjs incoming/<song-folder>   # validate + schedule a folder
node scripts/add-puzzle.mjs --list                   # schedule + coverage gaps
node scripts/add-puzzle.mjs --validate               # health-check all puzzles
```

The browser admin flow can also trim during upload when ffmpeg is installed and
visible to the server. If ffmpeg is not available, turn off "Trim on upload with
ffmpeg" in `/admin` and upload stems that are already cut to the same hook
length. The CLI trim step is still useful for batch preparation; you can also
prepare stem files entirely yourself and skip it.

The full guide, including stem production tips, folder convention,
`puzzle.json` format, and schedule management, is in [docs/STEMS.md](docs/STEMS.md).

## Going to production

Everything left before and after go-live, including content, account-backed
history, and multiplayer, is tracked with priorities in [ROADMAP.md](ROADMAP.md).
The schema lives in `supabase/migrations/`; apply every migration in order.
