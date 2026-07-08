// Local stem prep helper (no accounts, no APIs — just ffmpeg).
//
// You split a song into stems yourself (e.g. the free fadr.com/stems web UI)
// and download them into a folder. This script cuts every stem to the SAME
// hook window with clean fades, encodes to Opus 64k, names them for the
// reveal ladder, and writes a puzzle.json stub — ready for add-puzzle.mjs.
//
// Usage:
//   node scripts/trim-stems.mjs <folder-of-downloaded-stems> [options]
//
// Options:
//   --out <folder>     output puzzle folder (default incoming/<input-folder-name>)
//   --start <sec>      where the hook starts in the song (default 45)
//   --duration <sec>   clip length (default 25)
//
// Input files are matched to ladder positions by filename keywords:
//   drums → 1-drums, bass → 2-bass, melody/other/music → 3-melody,
//   vocals → 4-vocals. An "instrumental" stem is skipped on purpose: the
//   game layers stems live, so it would double up drums/bass/melody.
//
// Wrong hook window? Just run again with a different --start — the source
// downloads are untouched.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, extname, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIO_EXTS = new Set([".mp3", ".m4a", ".wav", ".flac", ".ogg", ".opus", ".aac", ".webm"]);

// Reveal ladder: least → most identifiable. "instrumental" intentionally absent.
const STEM_ORDER = [
  { match: /drum/i, position: 1, name: "drums" },
  { match: /bass/i, position: 2, name: "bass" },
  { match: /melod|other|music|instrument(?!al)/i, position: 3, name: "melody" },
  { match: /vocal|voice/i, position: 4, name: "vocals" },
];

const log = (msg) => console.log(`  ${msg}`);
const fail = (msg) => {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
};

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** First date from tomorrow (IST) onward with no scheduled puzzle. */
function nextFreeDate() {
  const puzzles = JSON.parse(readFileSync(join(ROOT, "data", "puzzles.json"), "utf8"));
  const taken = new Set(puzzles.filter((p) => p.date).map((p) => p.date));
  let t = Date.now() + 5.5 * 3600_000 + 86_400_000; // tomorrow IST
  for (;;) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (!taken.has(d)) return d;
    t += 86_400_000;
  }
}

function findCatalogSong(slug) {
  const songs = JSON.parse(readFileSync(join(ROOT, "data", "songs.json"), "utf8"));
  return songs.find((s) => s.id === slug || s.id.startsWith(slug) || slug.startsWith(s.id));
}

function trimStem(rawPath, outPath, start, duration) {
  const fade = 0.25;
  const args = [
    "-y",
    "-i", rawPath,
    "-ss", String(start),
    "-t", String(duration),
    "-af", `afade=t=in:st=0:d=${fade},afade=t=out:st=${duration - fade}:d=${fade}`,
    "-c:a", "libopus",
    "-b:a", "64k",
    outPath,
  ];
  const r = spawnSync("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed for ${basename(rawPath)}: ${r.stderr?.toString().slice(-300)}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const VALUE_FLAGS = new Set(["--out", "--start", "--duration"]);
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    if (VALUE_FLAGS.has(args[i])) i++;
    else if (!args[i].startsWith("--")) positionals.push(args[i]);
  }

  const input = positionals[0];
  if (!input || !existsSync(resolve(input))) {
    fail(
      "Usage: node scripts/trim-stems.mjs <folder-of-downloaded-stems> [--out incoming/slug] [--start 45] [--duration 25]"
    );
  }
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
    fail("ffmpeg is required (winget install ffmpeg), then re-run.");
  }

  const start = Number(flag("start", 45));
  const duration = Number(flag("duration", 25));
  const inDir = resolve(input);
  const slug = slugify(basename(inDir));
  const outDir = resolve(flag("out", join(ROOT, "incoming", slug)));
  mkdirSync(outDir, { recursive: true });

  const files = readdirSync(inDir).filter((f) => AUDIO_EXTS.has(extname(f).toLowerCase()));
  if (files.length === 0) fail(`No audio files in ${inDir}`);

  console.log();
  let produced = 0;
  const used = new Set();
  for (const spec of STEM_ORDER) {
    const file = files.find((f) => !used.has(f) && spec.match.test(basename(f, extname(f))));
    if (!file) {
      log(`⚠ No file matched "${spec.name}" — skipping position ${spec.position}`);
      continue;
    }
    used.add(file);
    trimStem(join(inDir, file), join(outDir, `${spec.position}-${spec.name}.opus`), start, duration);
    produced++;
    log(`✓ ${spec.position}-${spec.name}.opus  ← ${file}  (${start}s → ${start + duration}s)`);
  }
  const unmatched = files.filter((f) => !used.has(f));
  if (unmatched.length > 0) {
    log(`(ignored: ${unmatched.join(", ")})`);
  }
  if (produced < 4) {
    log("⚠ Fewer than 4 stems produced — add-puzzle.mjs needs at least 4.");
  }

  const stubPath = join(outDir, "puzzle.json");
  if (!existsSync(stubPath)) {
    const date = nextFreeDate();
    const catalogSong = findCatalogSong(slug);
    const stub = catalogSong
      ? { songId: catalogSong.id, date, officialLink: "" }
      : {
          songId: slug,
          date,
          officialLink: "",
          song: { title: "", movie: "", year: 0, singers: [""], actors: [""], musicDirector: "" },
        };
    writeFileSync(stubPath, JSON.stringify(stub, null, 2) + "\n");
    log(
      catalogSong
        ? `✓ puzzle.json (matched catalog song "${catalogSong.id}", date ${date})`
        : `✓ puzzle.json stub — fill in the "song" block before ingesting`
    );
  }

  console.log(`\n  Next: listen to the clips, re-run with a different --start if needed, then:`);
  console.log(`    node scripts/add-puzzle.mjs incoming/${slug} --dry\n`);
}

try {
  main();
} catch (e) {
  fail(e.message);
}
