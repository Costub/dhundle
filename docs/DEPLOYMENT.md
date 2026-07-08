# Deployment Checklist

This app is deploy-ready once external services are connected.

## Supabase

1. Create a Supabase project.
2. Apply every file in `supabase/migrations/` in order with the SQL editor or
   CLI. As of 2026-07-08 that means `0001_initial_schema.sql`,
   `0002_leaderboard.sql`, `0003_song_actors.sql`, and
   `0004_user_result_history.sql`.
3. Create a public storage bucket named `stems`.
4. Copy the project URL and `service_role` key from Project Settings > API into
   `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Placeholder
   values like `https://<project-ref>.supabase.co` are detected and treated as
   unconfigured.

Daily gameplay and local admin content editing can still use JSON/local files
without Supabase. Account-backed surfaces (`/leaderboard`, `/archive`, and
`/puzzle/[date]`) require Supabase Google sign-in.

## Authentication and Admin Access

Google sign-in is the player account system for leaderboard and past challenge
history. Today's puzzle at `/` remains publicly playable, but account surfaces
require a valid Supabase session so results can be stored in
`game_results.user_id`.

There are two independent ways into `/admin`:

- **`ADMIN_SECRET`** - any strong random string in the env
  (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).
  Enter it in the "Unlock locally" form; it sets a signed 12-hour cookie. This
  works with or without Supabase and is the local-dev path.
- **Google sign-in** - requires Supabase:
  1. In Google Cloud Console, configure the OAuth consent screen, then create a
     Web application OAuth client with redirect URI
     `https://<project-ref>.supabase.co/auth/v1/callback`.
  2. In Supabase Authentication > Providers > Google, enable Google and paste
     the Client ID and Secret.
  3. In Supabase Authentication > URL Configuration, add the app callback to the
     redirect allowlist: `http://localhost:3000/api/auth/callback` for dev and
     `https://<your-domain>/api/auth/callback` for production.
  4. Any Google account that can complete Supabase OAuth can use player account
     surfaces. Set `ADMIN_EMAILS` to a comma-separated allowlist for admin
     access; only those accounts get `/admin`.

## Vercel Environment Variables

Set these for Preview and Production:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DHUNDLE_TOKEN_SECRET`
- `ADMIN_SECRET`
- `ADMIN_EMAILS`
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` (required for public guess
  search suggestions and admin Spotify prefill)

`ADMIN_EMAILS` is only the `/admin` allowlist; it does not restrict normal
leaderboard/archive sign-in. Spotify credentials come from a free app at
developer.spotify.com/dashboard and are used server-side only
(client-credentials flow, never sent to the browser).

Every secret must be a real value in production. `DHUNDLE_TOKEN_SECRET` in
particular: without it the play-token HMAC falls back to a known dev string,
which makes anti-cheat tokens forgeable.

## Session Refresh (proxy.ts)

`proxy.ts` (this Next version's replacement for `middleware.ts`) silently
exchanges the 30-day Supabase refresh-token cookie for a new ~1-hour access
token when it expires, so signed-in players stay signed in between daily
visits. It activates automatically once the Supabase env vars are real; with
placeholders it no-ops. It skips `/stems/` audio and `_next/` assets.

## Recommended Content Workflow (local admin → cloud DB)

The admin's backend follows the env vars, not where the server runs. With the
real Supabase URL + service-role key in your local `.env.local`, running
`npm run dev` and using `/admin` locally writes straight to production
Supabase (storage bucket + tables) — the deployed site serves it immediately.
Do stem uploads from the local admin with "Trim on upload with ffmpeg" ON
(local ffmpeg + `FFMPEG_PATH`); you never need ffmpeg on Vercel. Remember:
with real creds locally, the local admin edits the LIVE database.

## Production Caveats

- **ffmpeg is not available on Vercel serverless.** Trimming through the
  *deployed* admin panel will fail — use the local-admin workflow above, or
  upload pre-trimmed stems (prepared with `scripts/trim-stems.mjs`) with
  "Trim on upload" turned off.
- **Keep the repo private**: `data/puzzles.json` and `data/songs.json` reveal
  the future schedule and answer pool (production content should live in
  Supabase anyway).
- **Content migration is one-way manual**: anything added while running in
  local-JSON mode stays in `data/*.json` / `public/stems/` and must be
  re-added (or scripted) into Supabase when it becomes the backend.
- **CI branch**: `.github/workflows/ci.yml` triggers on pushes to `main`.
  The local default branch is `master` — rename it (`git branch -m master
  main`) before pushing, or update the workflow.
- Parallel builds while `next dev` is running clobber `.next`; use
  `NEXT_DIST_DIR=.next-verify npm run build` for local verification builds.

## Deploy Flow

```bash
npm.cmd run lint
npm.cmd run build
vercel deploy
vercel deploy --prod
```

GitHub Actions can run CI with `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and
`VERCEL_PROJECT_ID` configured as repository secrets.

## Post-Deploy Checks

- Open `/api/puzzle/today`; it should not expose `songId`.
- Open `/leaderboard` signed out; verify the Google sign-in gate appears.
- Sign in with Google and verify `/leaderboard`, `/archive`, and a
  `/puzzle/YYYY-MM-DD` past challenge return to the requested page.
- Wait 1+ hour (or delete the `dhundle-sb-access` cookie in devtools) and
  reload `/leaderboard` — you should stay signed in (proxy refresh working).
- Open `/admin`; verify an `ADMIN_EMAILS` account or `ADMIN_SECRET` works.
- Schedule one future puzzle in `/admin` after uploading stems to the `stems`
  bucket.
- Finish a signed-in game and confirm a row appears in `game_results` with
  `user_id` populated.
- Verify the next puzzle timer rolls over at midnight IST.
