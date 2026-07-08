// Dhoondle content pipeline: validate and register a new puzzle from a
// prepared folder of stems. See docs/STEMS.md for the full guide.
//
// Usage:
//   node scripts/add-puzzle.mjs <folder>          # ingest a puzzle folder
//   node scripts/add-puzzle.mjs <folder> --dry    # validate only, write nothing
//   node scripts/add-puzzle.mjs --list            # show the schedule + gaps
//   node scripts/add-puzzle.mjs --validate        # check all registered puzzles
//
// A puzzle folder contains:
//   puzzle.json                  metadata (songId, date, officialLink, optional song)
//   1-rhythm.opus                stems named <position>-<instrument>.<ext>
//   2-bass.opus                  positions must be contiguous from 1
//   ...
//
// The script copies stems to public/stems/<date>/stem-<n>.<ext> (the URL and
// filenames never mention the song, so nothing in devtools spoils the answer),
// appends the puzzle to data/puzzles.json, and optionally adds a new song to
// data/songs.json.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUZZLES_PATH = join(ROOT, "data", "puzzles.json");
const SONGS_PATH = join(ROOT, "data", "songs.json");
const STEMS_DIR = join(ROOT, "public", "stems");

const AUDIO_EXTS = new Set([".opus", ".ogg", ".mp3", ".m4a", ".wav", ".webm"]);
const MIN_STEMS = 4;
const MAX_STEMS = 6;

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, data) => writeFileSync(p, JSON.stringify(data, null, 2) + "\n");

function fail(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

function titleCase(slug) {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function todayIST() {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  return ist.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- list mode

function listSchedule(puzzles, songs) {
  const songById = new Map(songs.map((s) => [s.id, s]));
  const dated = puzzles
    .filter((p) => p.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const undated = puzzles.filter((p) => !p.date);
  const today = todayIST();

  console.log(`\n  Schedule (today IST: ${today})\n`);
  if (dated.length === 0) {
    console.log(
      undated.length > 0
        ? "  No dated puzzles yet — the undated rotation is serving every day."
        : "  No puzzles yet."
    );
  }
  for (const p of dated) {
    const song = songById.get(p.songId);
    const marker = p.date < today ? "past " : p.date === today ? "TODAY" : "     ";
    console.log(
      `  ${marker}  ${p.date}  ${p.id.padEnd(14)} ${song ? `${song.title} — ${song.movie}` : `⚠ unknown song "${p.songId}"`}`
    );
  }

  // Find holes in the next 14 days.
  const datedSet = new Set(dated.map((p) => p.date));
  const gaps = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.parse(today) + i * 86_400_000).toISOString().slice(0, 10);
    if (!datedSet.has(d)) gaps.push(d);
  }
  if (gaps.length > 0) {
    console.log(
      `\n  Next 14 days without a scheduled puzzle (${gaps.length}):\n  ${gaps.join(", ")}`
    );
    if (undated.length > 0) {
      console.log(`  (${undated.length} undated puzzle(s) will rotate as fallback.)`);
    } else {
      console.log("  ⚠ No fallback puzzles — those days would show 'no puzzle'.");
    }
  } else {
    console.log("\n  ✓ The next 14 days are fully scheduled.");
  }
  console.log();
}

// ------------------------------------------------------------ validate mode

function validateAll(puzzles, songs) {
  const songById = new Map(songs.map((s) => [s.id, s]));
  const seenDates = new Map();
  const seenIds = new Set();
  let problems = 0;
  const complain = (msg) => {
    problems++;
    console.log(`  ✗ ${msg}`);
  };

  for (const p of puzzles) {
    if (seenIds.has(p.id)) complain(`duplicate puzzle id "${p.id}"`);
    seenIds.add(p.id);
    if (!songById.has(p.songId)) complain(`${p.id}: songId "${p.songId}" not in songs.json`);
    if (p.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) complain(`${p.id}: bad date "${p.date}"`);
      if (seenDates.has(p.date))
        complain(`${p.id}: date ${p.date} already used by ${seenDates.get(p.date)}`);
      seenDates.set(p.date, p.id);
    }
    if (!Array.isArray(p.stems) || p.stems.length < MIN_STEMS)
      complain(`${p.id}: needs at least ${MIN_STEMS} stems`);
    for (const s of p.stems ?? []) {
      const onDisk = join(ROOT, "public", s.src.replace(/^\//, ""));
      if (!existsSync(onDisk)) complain(`${p.id}: missing audio file ${s.src}`);
    }
    const positions = (p.stems ?? []).map((s) => s.position).sort((a, b) => a - b);
    positions.forEach((pos, i) => {
      if (pos !== i + 1) complain(`${p.id}: stem positions must be contiguous from 1`);
    });
  }

  console.log(
    problems === 0
      ? `\n  ✓ All ${puzzles.length} puzzles look good.\n`
      : `\n  ${problems} problem(s) found across ${puzzles.length} puzzles.\n`
  );
  process.exit(problems === 0 ? 0 : 1);
}

// -------------------------------------------------------------- ingest mode

function ingest(folder, { dry }) {
  const dir = resolve(folder);
  if (!existsSync(dir)) fail(`Folder not found: ${dir}`);
  const metaPath = join(dir, "puzzle.json");
  if (!existsSync(metaPath)) fail(`Missing ${join(folder, "puzzle.json")} — see docs/STEMS.md`);

  const meta = readJson(metaPath);
  const puzzles = readJson(PUZZLES_PATH);
  const songs = readJson(SONGS_PATH);

  // --- song ---
  if (!meta.songId) fail(`puzzle.json needs a "songId"`);
  let song = songs.find((s) => s.id === meta.songId);
  let addingSong = false;
  if (!song) {
    if (!meta.song) {
      fail(
        `Song "${meta.songId}" is not in data/songs.json.\n    Either fix the songId, or include a "song" block in puzzle.json to add it:\n    "song": { "title": "...", "movie": "...", "year": 2013, "singers": ["..."], "actors": ["..."], "musicDirector": "..." }`
      );
    }
    const s = meta.song;
    for (const field of ["title", "movie", "year", "singers", "musicDirector"]) {
      if (s[field] === undefined) fail(`puzzle.json "song" block is missing "${field}"`);
    }
    song = { id: meta.songId, ...s };
    addingSong = true;
  }

  // --- date ---
  if (!meta.date || !/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) {
    fail(`puzzle.json needs a "date" in YYYY-MM-DD (IST) format`);
  }
  const clash = puzzles.find((p) => p.date === meta.date);
  if (clash) fail(`Date ${meta.date} is already taken by puzzle "${clash.id}"`);
  if (meta.date < todayIST()) {
    console.log(`  ⚠ Date ${meta.date} is in the past (today IST is ${todayIST()}).`);
  }

  // --- stems ---
  const stemFiles = readdirSync(dir)
    .filter((f) => AUDIO_EXTS.has(extname(f).toLowerCase()))
    .map((f) => {
      const m = basename(f, extname(f)).match(/^(\d+)[-_](.+)$/);
      if (!m) fail(`Stem file "${f}" must be named <position>-<instrument>.<ext>, e.g. 1-rhythm.opus`);
      return { position: Number(m[1]), instrument: titleCase(m[2]), file: f };
    })
    .sort((a, b) => a.position - b.position);

  if (stemFiles.length < MIN_STEMS || stemFiles.length > MAX_STEMS) {
    fail(`Found ${stemFiles.length} stems — a puzzle needs between ${MIN_STEMS} and ${MAX_STEMS}`);
  }
  stemFiles.forEach((s, i) => {
    if (s.position !== i + 1) {
      fail(`Stem positions must be contiguous starting at 1 (missing position ${i + 1})`);
    }
  });

  // Puzzle id + public paths are date-based on purpose: stem URLs are visible
  // in devtools before the game ends, so they must never mention the song.
  const puzzleId = meta.date;
  const publicDir = join(STEMS_DIR, puzzleId);
  const stems = stemFiles.map((s) => ({
    position: s.position,
    instrument: s.instrument,
    src: `/stems/${puzzleId}/stem-${s.position}${extname(s.file).toLowerCase()}`,
  }));

  const entry = {
    id: puzzleId,
    songId: song.id,
    date: meta.date,
    stems,
    ...(meta.officialLink ? { officialLink: meta.officialLink } : {}),
  };

  // --- report ---
  console.log(`\n  Puzzle for ${meta.date}`);
  console.log(`    Song:   ${song.title} — ${song.movie} (${song.year})${addingSong ? "  [new catalog entry]" : ""}`);
  console.log(`    Stems:  ${stems.map((s) => s.instrument).join(" → ")}`);
  console.log(`    Link:   ${meta.officialLink ?? "(none)"}`);

  if (dry) {
    console.log("\n  ✓ Validation passed (--dry: nothing written).\n");
    return;
  }

  mkdirSync(publicDir, { recursive: true });
  for (const s of stemFiles) {
    copyFileSync(join(dir, s.file), join(publicDir, `stem-${s.position}${extname(s.file).toLowerCase()}`));
  }
  if (addingSong) {
    songs.push(song);
    songs.sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
    writeJson(SONGS_PATH, songs);
  }
  puzzles.push(entry);
  puzzles.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  writeJson(PUZZLES_PATH, puzzles);

  console.log(`\n  ✓ Copied ${stems.length} stems to public/stems/${puzzleId}/`);
  if (addingSong) console.log(`  ✓ Added "${song.title}" to data/songs.json`);
  console.log(`  ✓ Registered puzzle in data/puzzles.json`);
  console.log(`\n  Preview it: npm run dev, then open http://localhost:3000 on ${meta.date} (IST)\n`);
}

// --------------------------------------------------------------------- main

const args = process.argv.slice(2);
if (args.includes("--list")) {
  listSchedule(readJson(PUZZLES_PATH), readJson(SONGS_PATH));
} else if (args.includes("--validate")) {
  validateAll(readJson(PUZZLES_PATH), readJson(SONGS_PATH));
} else {
  const folder = args.find((a) => !a.startsWith("--"));
  if (!folder) {
    console.log(
      "\n  Usage:\n    node scripts/add-puzzle.mjs <folder>       ingest a puzzle folder\n    node scripts/add-puzzle.mjs <folder> --dry validate only\n    node scripts/add-puzzle.mjs --list         show schedule + gaps\n    node scripts/add-puzzle.mjs --validate     check all registered puzzles\n"
    );
    process.exit(1);
  }
  ingest(folder, { dry: args.includes("--dry") });
}
