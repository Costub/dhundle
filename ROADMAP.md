# Dhoondle Go-Live Roadmap

## Latest Pre-Deploy Audit Pass

Completed on 2026-07-08 — full-project review before the first commit/deploy:

- **Fixed (was a launch-blocking bug):** the Supabase access-token cookie
  expires after ~1 h and nothing used the 30-day refresh token, so every
  signed-in player would be logged out between daily visits and their
  `POST /api/result` writes would 401. Added `proxy.ts` (this Next version's
  renamed `middleware.ts`) which silently refreshes the session. Verified:
  registration, matcher include/exclude (`/stems/` audio skipped), runtime
  env reads, and branch logic via an isolated production build; the live
  refresh round-trip still needs real Supabase creds (post-deploy check).
- `next.config.ts` now honors `NEXT_DIST_DIR` so verification builds don't
  clobber a running dev server's `.next`.
- `.gitignore` now excludes `.claude/` and `.agents/` (vendored agent
  tooling, ~6 MB, machine-local settings).
- Audit found no answer leakage (guess/hint/puzzle routes clean, catalog
  never shipped to clients), no injection paths (ffmpeg args are arrays,
  storage paths validated), open-redirect guard present, admin cookie can't
  validate without a real `ADMIN_SECRET`, leaderboard exposes only hashed
  player ids. Gates: tsc, eslint, `validate:puzzles`, isolated `next build`.
- **Blocking TODO before deploy:** `.env.local` still has PLACEHOLDER values
  for `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `DHUNDLE_TOKEN_SECRET`, and `ADMIN_SECRET` — the app currently runs in
  local-JSON mode and account surfaces/admin unlock are inert. See
  docs/DEPLOYMENT.md (updated with proxy notes, ffmpeg-on-Vercel caveat,
  CI branch mismatch `master` vs `main`, private-repo requirement).

## Latest Account-Gated Leaderboard/Archive Pass

Completed on 2026-07-08:

- Supabase Google sign-in now covers player account surfaces, not only `/admin`.
- `/leaderboard`, `/archive`, and `/puzzle/[date]` render a Google sign-in
  gate when no Supabase session is present. Today's `/` puzzle remains publicly
  playable.
- OAuth sign-in supports a safe `next` destination, so users return to the
  leaderboard, archive, past puzzle, or admin page that requested auth.
- `POST /api/result` attaches `game_results.user_id` server-side when signed
  in; client-provided user ids are never trusted. Same-device anonymous rows
  can be claimed to avoid duplicate leaderboard identities.
- Leaderboard aggregation now keys signed-in players by Supabase user id, with
  anonymous device id only as a local/dev or legacy fallback.
- Archive completion badges merge account-backed Supabase results over
  localStorage results, so past challenge history can follow a user across
  devices.
- Added `supabase/migrations/0004_user_result_history.sql` for signed-in
  result history reads.
- Verification: `npm.cmd run lint` and `npm.cmd run build`. Build passes with
  the existing Turbopack trace warning from the admin upload/audio trim path.

## Latest Spotify-Only Guess Search Pass

Completed on 2026-07-08:

- Public guess dropdown should only use Spotify results from `/api/search`.
- The answer/catalog song list must not be merged into or substituted for the
  dropdown, even when the typed query exactly matches an added song.
- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are required for public
  search. Without them, players can still type a guess, but no fallback
  provider/catalog suggestions should appear.
- `lib/musicSearch.ts` no longer has an iTunes fallback; `/api/search` returns
  Spotify results only, or an empty list when Spotify credentials are missing
  or Spotify fails.
- `components/Game.tsx` now submits only `sourceId` or free text from the
  guess box, never a client-side catalog song id.
- Rate-limit notes were refreshed in `README.md`.
- Verification: `npm.cmd run lint`, `npx.cmd tsc --noEmit`,
  `npm.cmd run validate:puzzles`, and `npm.cmd run build`.

## Latest Admin Spotify-Prefill Pass

Completed on 2026-07-08 (user has real SPOTIFY_CLIENT_ID/SECRET in .env.local
now — guess search confirmed running against Spotify):

- `/admin` Songs tab has a "Prefill from Spotify" search above the add-song
  form (same `/api/search` proxy the game uses): picking a result fills
  title, movie, year, and artists; actors/aliases stay manual.
- Search results now carry the public track `url`
  (open.spotify.com/music.apple.com); after a prefill pick the admin sees the
  link with a copy button to reuse as the puzzle's official link when
  scheduling.
- Verification: tsc, eslint, curl (`/api/search` returns spotify: source ids
  with `url`). UI is live via HMR on the user's dev server.

## Latest Open-Search Pass

Completed on 2026-07-08: the guess box now searches the full streaming
catalog instead of only the in-house song list.

- `lib/musicSearch.ts` — provider layer: Spotify Web API (client-credentials,
  when `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` are set) with automatic
  fallback behavior existed initially but was superseded by the Spotify-only
  pass above. In-memory query
  (10 min) and track (6 h) caches; Bollywood title cleanup extracts the movie
  from `Song (From "Movie")` and strips soundtrack suffixes.
- `GET /api/search` — rate-limited server proxy; provider keys never reach
  the browser.
- `POST /api/guess` accepts `sourceId` picks:
  metadata is re-resolved server-side (client-supplied text is never
  trusted), matched space-insensitively against the catalog (title, aliases,
  title+movie) for the win check, and non-catalog guesses get proximity
  feedback from their own public metadata (movie≈album normalized, artist
  overlap, year direction/decade; composer/actor never fake-match, unknown
  year gives no direction).
- `components/GuessInput.tsx` — 300 ms debounced external search with artwork
  + artist + movie rows, merged after (deduped against) in-house catalog
  matches; free-text alias submission still works.
- Also fixed: catalog guess matching is now space-insensitive
  ("D.K. Bose" ≈ "DK Bose" — this was a real false negative on the
  2026-07-08 puzzle).
- Verification: tsc, eslint, curl e2e against the live dev server (external
  search, win via external pick, wrong-guess feedback with same-decade +
  older-direction, short-query guard). UI hot-reloaded on the running dev
  server; browser play-through pending on the user's session.
- Migration note: content added in local mode (data/*.json, public/stems/)
  does NOT auto-sync to Supabase later — plan a one-time migration (script or
  re-entry via /admin) when real Supabase credentials land.

## Latest Gameplay/Brand Pass

Completed on 2026-07-08:

- Game attempts now follow each puzzle's actual stem count (4-6) instead of
  rendering a constant 6-slot guess ladder.
- Admin stem labels are explicit so the player-facing instrument name is set
  while uploading.
- Metadata hints are reduced to Year, Artist, Actor, and Movie.
- Guessing now lets typed aliases match directly instead of relying only
  on visible autocomplete rows.
- App name is Dhoondle across UI/docs.
- Verification: `npm.cmd run lint`, `npx.cmd tsc --noEmit`,
  `npm.cmd run validate:puzzles`, and `npm.cmd run build` (with network for
  Google Fonts). Build passes with one Turbopack warning for the server-only
  ffmpeg temp-file helper.

## Latest Admin Metadata Trim

Completed on 2026-07-08:

- Removed music director/composer from the `/admin` song form/table so admin
  metadata matches the player hint set: Year, Artist, Actor, Movie.
- Kept title and search aliases as operational catalog fields.
- Internally derive the legacy `musicDirector` value from Artist when needed
  so existing schema/API paths remain compatible.

## Latest Admin Stem Workflow Pass

Completed on 2026-07-08:

- `/admin` Schedule accepts a variable 4-6 stem ladder per song.
- The same page handles song/date/link metadata, multi-stem upload, browser
  mix preview, trim start/length selection, server-side ffmpeg trim, storage
  upload, and puzzle insert/replace.
- Admin song edits already write through the active backend: Supabase tables
  when Supabase env is configured, otherwise local JSON for dev.
- Verification: `npm.cmd run lint`, `npx.cmd tsc --noEmit`,
  `npm.cmd run validate:puzzles`, `npm.cmd run build`, and smoke checks for
  `/` + `/admin` on the local dev server.

## Latest FFmpeg Fallback Pass

- Completed on 2026-07-08 after admin upload hit `spawnSync ffmpeg ENOENT` on
  a machine where ffmpeg is not
  installed or not visible to the Next server process.
- `/admin` Schedule now lets pre-trimmed stems skip server-side ffmpeg;
  trim-on-upload remains available when ffmpeg is installed.
- `FFMPEG_PATH` is supported for Windows installs where the server process does
  not inherit the updated PATH.

## Latest P1 Pass

Completed on 2026-07-08: past challenges archive (`/archive`, deep-linkable
`/puzzle/[date]`; archive plays use separate localStorage state and never
touch daily stats or streak) and leaderboard (`/leaderboard`, Today +
All-time tabs, optional public display name, opaque hashed player ids — raw
device ids never leave the server). Dual-backend like everything else:
Supabase `game_results` (apply every file in `supabase/migrations/` in order)
or `data/results.local.json` in dev. This was later upgraded from device-backed
identity to account-backed Supabase identity in the account-gated pass above.
Verification: tsc, eslint, `next build`, curl e2e of all new endpoints
(date guards, ranking, name sanitization, isYou flags), and a full archive
play-through in the browser.

## Latest Cleanup

Completed on 2026-07-07: app and docs copy were cleaned up to stay in English,
hints remain manual and are counted in final/share results, and stale
legal-style copy was removed from the player experience and docs. Verification:
`npm.cmd run lint` and `npm.cmd run build`.

## Latest Roadmap Pass

Completed on 2026-07-07 while real stems are being produced: added basic
server-side anti-cheat/rate limiting, anonymous device id plumbing,
`POST /api/result`, and Supabase `game_results` schema support. Verification:
`npm.cmd run lint` and `npm.cmd run build`.

## Latest P0 Completion Pass

Completed on 2026-07-07, excluding real content and legal review by request:
Supabase-backed data access with JSON fallback, durable result writes,
Google/admin-secret auth, `/admin` operations, deployment env/docs/CI
scaffolding. Verification: `npm.cmd run lint`, `npm.cmd run build`, and
`npm.cmd run validate:puzzles`.

The MVP daily puzzle loop is done. Content tooling lives in
[docs/STEMS.md](docs/STEMS.md).

## P0 Must Have Before Launch

- [ ] **Real content** - produce stems for at least the first ~30 days of
  puzzles: split each song manually on fadr.com/stems (free), download, then
  `node scripts/trim-stems.mjs <folder>` (needs ffmpeg) and
  `node scripts/add-puzzle.mjs incoming/<slug>` per song — see docs/STEMS.md.
  Demo puzzles/songs/stems were removed on 2026-07-08; the catalog and
  schedule start empty. Spot-check each puzzle on a phone.
- [x] **Supabase data layer** - `lib/puzzles.ts` / `lib/catalog.ts` read from
  Supabase when env vars exist, with JSON fallback for local/dev. The schema
  and storage-path mapping are ready for the public `stems` bucket.
- [x] **Auth integration** - Supabase Google OAuth is wired for player account
  surfaces (`/leaderboard`, `/archive`, `/puzzle/[date]`) and `/admin`.
  `ADMIN_EMAILS` allowlists admin access, `ADMIN_SECRET` remains the local-dev
  admin fallback, and today's puzzle still allows anonymous play.
- [x] **Admin dashboard** (`/admin`) - full content console: stem file upload
  (Supabase Storage or local `public/stems/` fallback), puzzle scheduling with
  visual stem ordering, puzzle removal, and song catalog management
  (add/edit/remove with search). Works identically with or without Supabase
  configured; template env values are detected and treated as unconfigured.
- [x] **Server-side result storage** - `POST /api/result` writes signed-in
  Supabase results to `game_results.user_id` when configured, with local
  fallback for dev.
- [x] **Rate limiting and anti-cheat basics** - `/api/guess` and `/api/hint`
  throttle per IP/device; `/api/guess` uses a signed play token so a forged
  final-attempt request cannot reveal the answer.
- [x] **Deploy** - env template, deployment checklist, and CI are in place.
  Actual Vercel/Supabase resources and domain connection are external setup.
- [x] **Legal pass** - ignored by request for this P0 pass.

## P1 Fast Follow

- [x] **Past challenges / archive** - signed-in `/archive` + `/puzzle/[date]`,
  tracked separately from the daily streak and merged with account-backed
  result history.
- [x] **Leaderboard** - `/leaderboard` with daily + all-time tabs (wins,
  win %, avg attempts), account-backed identity, opaque public row ids, and an
  optional display name. Later: streak column and a friends-only view.
- [ ] **Onboarding polish** - animated first-run demo instead of the static
  how-to modal; sample puzzle that does not consume the daily.
- [ ] **SEO and sharing** - OG images, metadata, sitemap, and referral-tagged
  share links.
- [ ] **Analytics** - puzzle funnel, attempt distribution per puzzle, and
  difficulty tuning. Plausible/PostHog are good candidates.
- [ ] **PWA** - installable shell, offline shell, and later push notification at
  puzzle drop time.

## P2 Later

- [ ] **Multiplayer** - race mode: same puzzle, live opponents, fewest
  stems/fastest guess wins. Needs realtime channel and lobby.
- [ ] **Difficulty modes** - easy vs hard, or a second daily hard puzzle.
- [ ] **Hint economy** - optional extra hints (first letter, lyrics snippet)
  at the cost of the share-grid score.
- [ ] **Regional expansion** - Tamil/Telugu/Punjabi editions share the engine;
  only catalog and stems differ.
- [ ] **Native wrapper** - only if PWA retention justifies it.

## Engineering Hygiene

- [ ] Tests for `lib/day.ts`, `lib/feedback.ts`, and `lib/catalog.ts`
  normalization.
- [ ] Error monitoring (Sentry) before launch.
- [x] CI: lint, build, and `node scripts/add-puzzle.mjs --validate` are wired.
