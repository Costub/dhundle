"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrackCandidate } from "@/lib/musicSearch";
import type { PuzzleDefinition, Song } from "@/lib/types";

interface AdminDashboardProps {
  songs: Song[];
  puzzles: PuzzleDefinition[];
  today: string;
  supabaseReady: boolean;
}

type Tab = "overview" | "schedule" | "songs";

interface StemDraft {
  file: File;
  label: string;
}

interface ReusablePuzzle {
  puzzle: PuzzleDefinition;
  song?: Song;
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function labelFromFilename(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^\d+[-_\s]*/, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ") || "Stem";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const inputCls = "input-field rounded-lg px-3 py-2";
const buttonPrimary = "btn-primary rounded-lg px-4 py-2.5";
const buttonQuiet = "btn-quiet rounded-lg px-3 py-1.5 text-xs";
const MIN_STEMS = 4;
const MAX_STEMS = 6;
const MIN_TRIM_DURATION = 5;
const MAX_TRIM_DURATION = 60;

export default function AdminDashboard({
  songs,
  puzzles,
  today,
  supabaseReady,
}: AdminDashboardProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const notify = (kind: "ok" | "error", text: string) => {
    setBanner({ kind, text });
    if (kind === "ok") setTimeout(() => setBanner(null), 4000);
  };

  const scheduledDates = useMemo(
    () => new Set(puzzles.map((p) => p.date).filter(Boolean)),
    [puzzles]
  );
  const nextFourteen = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDays(today, i)),
    [today]
  );
  const firstGap = nextFourteen.find((d) => !scheduledDates.has(d)) ?? addDays(today, 14);
  const songById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);

  return (
    <div>
      <nav className="mt-5 flex gap-1 rounded-2xl border border-line bg-surface-glass p-1 shadow-sm backdrop-blur">
        {(
          [
            ["overview", "Overview"],
            ["schedule", "Schedule"],
            ["songs", `Songs (${songs.length})`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              "focus-ring flex-1 cursor-pointer rounded-xl px-4 py-2.5 text-sm font-bold transition duration-200 " +
              (tab === key ? "bg-gold text-night shadow-glow" : "text-muted hover:bg-surface hover:text-ink")
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {banner && (
        <p
          role={banner.kind === "error" ? "alert" : "status"}
          className={
            "mt-4 rounded-xl border px-3 py-2 text-sm font-medium " +
            (banner.kind === "ok"
              ? "border-gold/30 bg-gold/10 text-gold-soft"
              : "border-danger/30 bg-danger/10 text-danger")
          }
        >
          {banner.text}
        </p>
      )}

      {tab === "overview" && (
        <Overview
          puzzles={puzzles}
          songById={songById}
          nextFourteen={nextFourteen}
          supabaseReady={supabaseReady}
          onDeleted={() => {
            notify("ok", "Puzzle removed.");
            router.refresh();
          }}
          onError={(m) => notify("error", m)}
        />
      )}
      {tab === "schedule" && (
        <ScheduleTab
          songs={songs}
          puzzles={puzzles}
          defaultDate={firstGap}
          scheduledDates={scheduledDates}
          onScheduled={(date) => {
            notify("ok", `Puzzle scheduled for ${date}.`);
            router.refresh();
          }}
          onError={(m) => notify("error", m)}
        />
      )}
      {tab === "songs" && (
        <SongsTab
          songs={songs}
          onSaved={(msg) => {
            notify("ok", msg);
            router.refresh();
          }}
          onError={(m) => notify("error", m)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ overview

function Overview({
  puzzles,
  songById,
  nextFourteen,
  supabaseReady,
  onDeleted,
  onError,
}: {
  puzzles: PuzzleDefinition[];
  songById: Map<string, Song>;
  nextFourteen: string[];
  supabaseReady: boolean;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const gaps = nextFourteen.filter((d) => !puzzles.some((p) => p.date === d));

  const remove = async (p: PuzzleDefinition) => {
    if (!confirm(`Remove the puzzle on ${p.date}? Stem files are kept.`)) return;
    setBusy(p.id);
    try {
      const res = await fetch(`/api/admin/puzzles?id=${encodeURIComponent(p.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-6">
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["Backend", supabaseReady ? "Supabase" : "Local JSON"],
          ["Scheduled", puzzles.filter((p) => p.date).length],
          ["14-day gaps", gaps.length],
          ["Next gap", gaps[0] ?? "none"],
        ].map(([label, value]) => (
          <div key={String(label)} className="stage-card rounded-xl px-4 py-3">
            <p className="tiny-label">{label}</p>
            <p className="mt-1 truncate text-lg font-bold text-ink">{value}</p>
          </div>
        ))}
      </section>

      <h2 className="tiny-label mt-8">
        Upcoming schedule
      </h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface/45 shadow-float">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-raised/80 text-xs uppercase text-subtle">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Song</th>
              <th className="px-3 py-2">Stems</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {nextFourteen.map((date) => {
              const puzzle = puzzles.find((p) => p.date === date);
              const song = puzzle && songById.get(puzzle.songId);
              return (
                <tr key={date} className="bg-surface/45">
                  <td className="px-3 py-2 font-mono text-xs text-muted">{date}</td>
                  <td className="px-3 py-2 text-ink">
                    {puzzle ? (
                      song ? (
                        `${song.title} (${song.movie})`
                      ) : (
                        puzzle.songId
                      )
                    ) : (
                      <span className="text-subtle">Unscheduled</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {puzzle ? puzzle.stems.map((s) => s.instrument).join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {puzzle && (
                      <button
                        onClick={() => void remove(puzzle)}
                        disabled={busy === puzzle.id}
                        className={buttonQuiet + " hover:border-danger/50 hover:text-danger"}
                      >
                        {busy === puzzle.id ? "Removing…" : "Remove"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ schedule

function ScheduleTab({
  songs,
  puzzles,
  defaultDate,
  scheduledDates,
  onScheduled,
  onError,
}: {
  songs: Song[];
  puzzles: PuzzleDefinition[];
  defaultDate: string;
  scheduledDates: Set<string | undefined>;
  onScheduled: (date: string) => void;
  onError: (msg: string) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [songQuery, setSongQuery] = useState("");
  const [songId, setSongId] = useState("");
  const [reusePuzzleId, setReusePuzzleId] = useState("");
  const [officialLink, setOfficialLink] = useState("");
  const [stems, setStems] = useState<StemDraft[]>([]);
  const [trimOnUpload, setTrimOnUpload] = useState(true);
  const [trimStart, setTrimStart] = useState(0);
  const [trimDuration, setTrimDuration] = useState(25);
  const [previewing, setPreviewing] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const previewTimerRef = useRef<number | null>(null);

  const matches = useMemo(() => {
    const q = songQuery.trim().toLowerCase();
    if (!q) return songs.slice(0, 8);
    return songs
      .filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.movie.toLowerCase().includes(q) ||
          (s.aliases ?? []).some((alias) => alias.toLowerCase().includes(q)) ||
          s.id.includes(q)
      )
      .slice(0, 8);
  }, [songs, songQuery]);
  const selected = songs.find((s) => s.id === songId);
  const reusablePuzzles = useMemo<ReusablePuzzle[]>(
    () =>
      [...puzzles]
        .filter((p) => Boolean(p.date) && p.stems.length >= MIN_STEMS)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((puzzle) => ({ puzzle, song: songs.find((s) => s.id === puzzle.songId) })),
    [puzzles, songs]
  );
  const reuseSource = reusablePuzzles.find(({ puzzle }) => puzzle.id === reusePuzzleId);

  const stopPreview = () => {
    for (const source of previewSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Source may already have ended.
      }
      source.disconnect();
    }
    previewSourcesRef.current = [];
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    void previewCtxRef.current?.close();
    previewCtxRef.current = null;
    setPreviewing(false);
  };

  useEffect(
    () => () => {
      for (const source of previewSourcesRef.current) {
        try {
          source.stop();
        } catch {
          // Source may already have ended.
        }
      }
      if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
      void previewCtxRef.current?.close();
    },
    []
  );

  const applyReusePuzzle = (id: string) => {
    setReusePuzzleId(id);
    const source = reusablePuzzles.find(({ puzzle }) => puzzle.id === id);
    if (!source) return;
    stopPreview();
    setSongId(source.puzzle.songId);
    setSongQuery("");
    setOfficialLink(source.puzzle.officialLink ?? "");
    setStems([]);
    setPreviewStatus(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const clearReusePuzzle = () => {
    setReusePuzzleId("");
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setReusePuzzleId("");
    stopPreview();
    const next = [...stems];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_STEMS) break;
      next.push({ file, label: labelFromFilename(file.name) });
    }
    setStems(next);
    if (fileRef.current) fileRef.current.value = "";
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stems.length) return;
    const next = [...stems];
    [next[i], next[j]] = [next[j], next[i]];
    setStems(next);
  };

  const validateTrim = () => {
    if (!trimOnUpload) return null;
    if (!Number.isFinite(trimStart) || trimStart < 0) {
      return "Trim start must be 0 or greater.";
    }
    if (
      !Number.isFinite(trimDuration) ||
      trimDuration < MIN_TRIM_DURATION ||
      trimDuration > MAX_TRIM_DURATION
    ) {
      return `Trim length must be ${MIN_TRIM_DURATION}-${MAX_TRIM_DURATION} seconds.`;
    }
    return null;
  };

  const previewMix = async () => {
    if (stems.length < MIN_STEMS || stems.length > MAX_STEMS) {
      return onError(`Add ${MIN_STEMS} to ${MAX_STEMS} stem files before previewing.`);
    }
    const trimError = validateTrim();
    if (trimError) return onError(trimError);

    stopPreview();
    setPreviewStatus("Preparing preview...");
    try {
      const AudioContextCtor =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("This browser cannot preview audio.");

      const ctx = new AudioContextCtor();
      previewCtxRef.current = ctx;
      const decoded = await Promise.all(
        stems.map(async (stem) => ({
          stem,
          buffer: await ctx.decodeAudioData(await stem.file.arrayBuffer()),
        }))
      );
      const previewStart = trimOnUpload ? trimStart : 0;
      const previewDuration = trimOnUpload ? trimDuration : Math.min(trimDuration, 30);
      const tooShort = decoded.find(({ buffer }) => previewStart >= buffer.duration);
      if (tooShort) throw new Error(`${tooShort.stem.file.name} is shorter than the trim start.`);

      const mixGain = ctx.createGain();
      mixGain.gain.value = 1 / Math.max(1, Math.sqrt(decoded.length));
      mixGain.connect(ctx.destination);
      const startAt = ctx.currentTime + 0.05;
      const sources = decoded.map(({ buffer }) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(mixGain);
        source.start(startAt, previewStart, Math.min(previewDuration, buffer.duration - previewStart));
        return source;
      });

      previewSourcesRef.current = sources;
      setPreviewing(true);
      setPreviewStatus(`Previewing ${previewDuration}s mix from ${previewStart}s.`);
      previewTimerRef.current = window.setTimeout(() => {
        stopPreview();
        setPreviewStatus("Preview complete.");
      }, (previewDuration + 0.2) * 1000);
    } catch (e) {
      stopPreview();
      setPreviewStatus(null);
      onError(e instanceof Error ? e.message : "Could not preview the mix.");
    }
  };

  const submit = async () => {
    if (reuseSource) {
      if (scheduledDates.has(date) && !confirm(`${date} already has a puzzle. Replace it?`)) {
        return;
      }
      stopPreview();
      try {
        setProgress("Scheduling reused stems...");
        const res = await fetch("/api/admin/puzzles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            copyFromPuzzleId: reuseSource.puzzle.id,
            date,
            officialLink,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Scheduling failed");
        setReusePuzzleId("");
        setOfficialLink("");
        setPreviewStatus(null);
        onScheduled(date);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setProgress(null);
      }
      return;
    }

    if (!selected) return onError("Pick a song first.");
    if (stems.length < MIN_STEMS || stems.length > MAX_STEMS) {
      return onError(`Add ${MIN_STEMS} to ${MAX_STEMS} stem files.`);
    }
    const trimError = validateTrim();
    if (trimError) return onError(trimError);
    if (scheduledDates.has(date) && !confirm(`${date} already has a puzzle. Replace it?`)) {
      return;
    }
    stopPreview();
    try {
      const uploaded = [];
      for (let i = 0; i < stems.length; i++) {
        setProgress(
          `${trimOnUpload ? "Trimming/uploading" : "Uploading"} ${i + 1} of ${stems.length}: ${stems[i].file.name}...`
        );
        const fd = new FormData();
        fd.append("file", stems[i].file);
        fd.append("date", date);
        fd.append("position", String(i + 1));
        if (trimOnUpload) {
          fd.append("start", String(trimStart));
          fd.append("duration", String(trimDuration));
        }
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        uploaded.push({
          position: i + 1,
          instrument: stems[i].label.trim() || `Stem ${i + 1}`,
          storagePath: data.storagePath,
        });
      }
      setProgress("Scheduling...");
      const res = await fetch("/api/admin/puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId, date, officialLink, stems: uploaded }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scheduling failed");
      setStems([]);
      setOfficialLink("");
      setPreviewStatus(null);
      onScheduled(date);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      <section className="stage-card grid content-start gap-4 rounded-2xl p-4">
        <div className="grid gap-1.5">
          <label className="tiny-label">
            Date (IST)
          </label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          {scheduledDates.has(date) && (
            <p className="text-xs font-medium text-gold">
              This date already has a puzzle — scheduling will replace it.
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <label className="tiny-label">
            Reuse stems from date
          </label>
          <select
            value={reusePuzzleId}
            onChange={(e) => applyReusePuzzle(e.target.value)}
            className={inputCls}
          >
            <option value="">Upload new stems</option>
            {reusablePuzzles.map(({ puzzle, song }) => (
              <option key={puzzle.id} value={puzzle.id}>
                {puzzle.date ?? puzzle.id}
                {song ? ` - ${song.title}` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs leading-relaxed text-muted">
            Pick a previous scheduled date to reuse its stored Supabase stem files for this new
            date. No files are uploaded again.
          </p>
          {reuseSource && (
            <div className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-muted">
              <p className="font-semibold text-ink">
                Reusing {reuseSource.puzzle.date ?? reuseSource.puzzle.id}
                {reuseSource.song ? ` - ${reuseSource.song.title}` : ""}
              </p>
              <p className="mt-1">
                {reuseSource.puzzle.stems.length} stems will be copied into the new puzzle row.
              </p>
              <button onClick={clearReusePuzzle} className={buttonQuiet + " mt-2"}>
                Upload different stems instead
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-1.5">
          <label className="tiny-label">
            Song
          </label>
          {selected ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2">
              <span className="text-sm font-semibold text-ink">
                {selected.title}{" "}
                <span className="font-normal text-muted">
                  — {selected.movie} ({selected.year})
                </span>
              </span>
              {reuseSource ? (
                <span className="shrink-0 rounded-full border border-line bg-surface/50 px-2 py-1 text-[10px] font-bold uppercase text-subtle">
                  copied
                </span>
              ) : (
                <button onClick={() => setSongId("")} className={buttonQuiet}>
                  Change
                </button>
              )}
            </div>
          ) : (
            <>
              <input
                value={songQuery}
                onChange={(e) => setSongQuery(e.target.value)}
                placeholder="Search title, movie, or slug…"
                className={inputCls}
              />
              <ul className="max-h-56 overflow-auto rounded-xl border border-line bg-surface/60">
                {matches.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => setSongId(s.id)}
                      className="flex w-full cursor-pointer flex-col px-3 py-2 text-left transition hover:bg-gold/10"
                    >
                      <span className="text-sm font-semibold text-ink">{s.title}</span>
                      <span className="text-xs text-muted">
                        {s.movie} ({s.year})
                      </span>
                    </button>
                  </li>
                ))}
                {matches.length === 0 && (
                  <li className="px-3 py-2 text-sm text-muted">
                    No matches — add it in the Songs tab first.
                  </li>
                )}
              </ul>
            </>
          )}
        </div>

        <div className="grid gap-1.5">
          <label className="tiny-label">
            Official link (optional)
          </label>
          <input
            type="url"
            value={officialLink}
            onChange={(e) => setOfficialLink(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            className={inputCls}
          />
        </div>
      </section>

      <section className="stage-card grid content-start gap-3 rounded-2xl p-4">
        <label className="tiny-label">
          {reuseSource
            ? `Reused stems (${reuseSource.puzzle.stems.length}) - copied from ${reuseSource.puzzle.date ?? reuseSource.puzzle.id}`
            : `Stems (${stems.length} selected, 4-6 required) - reveal order, least to most identifiable`}
        </label>
        {reuseSource && (
          <div className="grid gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-3 py-3">
            {reuseSource.puzzle.stems.map((stem) => (
              <div
                key={`${reuseSource.puzzle.id}-${stem.position}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface/60 px-3 py-2"
              >
                <span className="w-5 text-center font-mono text-xs text-subtle">
                  {stem.position}
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
                  {stem.instrument}
                </span>
                <span className="hidden max-w-48 truncate font-mono text-[10px] text-subtle sm:block">
                  {stem.src}
                </span>
              </div>
            ))}
            <p className="text-xs leading-relaxed text-muted">
              These saved stems will be reused as-is. No upload or trimming will run.
            </p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".opus,.ogg,.mp3,.m4a,.wav,.webm,audio/*"
          disabled={Boolean(reuseSource)}
          onChange={(e) => addFiles(e.target.files)}
          className="cursor-pointer rounded-2xl border border-dashed border-line-strong bg-surface/60 px-3 py-6 text-sm text-muted disabled:hidden file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-gold file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-night"
        />
        <p className={"text-xs text-muted " + (reuseSource ? "hidden" : "")}>
          Edit each Player label below; that exact label is what players see on the unlocked
          stem chip.
        </p>
        <div className={"grid gap-3 rounded-2xl border border-line bg-surface/60 px-3 py-3 sm:grid-cols-[1fr_1fr_auto] " + (reuseSource ? "hidden" : "")}>
          <label className="tiny-label flex items-center gap-2 sm:col-span-3">
            <input
              type="checkbox"
              checked={trimOnUpload}
              onChange={(e) => setTrimOnUpload(e.target.checked)}
              className="h-4 w-4 accent-gold"
            />
            Trim on upload with ffmpeg
          </label>
          <label className="tiny-label grid gap-1">
            Trim start
            <input
              type="number"
              min={0}
              step={0.1}
              value={trimStart}
              onChange={(e) => setTrimStart(Number(e.target.value))}
              disabled={!trimOnUpload}
              className={inputCls + " font-mono disabled:opacity-40"}
            />
          </label>
          <label className="tiny-label grid gap-1">
            Length
            <input
              type="number"
              min={MIN_TRIM_DURATION}
              max={MAX_TRIM_DURATION}
              step={0.1}
              value={trimDuration}
              onChange={(e) => setTrimDuration(Number(e.target.value))}
              disabled={!trimOnUpload}
              className={inputCls + " font-mono disabled:opacity-40"}
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={() => (previewing ? stopPreview() : void previewMix())}
              disabled={progress !== null}
              className={buttonQuiet + " h-10 px-4"}
            >
              {previewing ? "Stop" : "Preview mix"}
            </button>
          </div>
          {previewStatus && (
            <p className="text-xs text-muted sm:col-span-3">{previewStatus}</p>
          )}
          {!trimOnUpload && (
            <p className="text-xs text-muted sm:col-span-3">
              ffmpeg will be skipped. Use this only when every selected stem already starts at
              the hook and has the same length.
            </p>
          )}
        </div>
        <ul className={"grid gap-2 " + (reuseSource ? "hidden" : "")}>
          {stems.map((stem, i) => (
            <li
              key={`${stem.file.name}-${i}`}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface/60 px-3 py-2"
            >
              <span className="w-5 text-center font-mono text-xs text-subtle">{i + 1}</span>
              <input
                value={stem.label}
                onChange={(e) =>
                  setStems(stems.map((s, j) => (j === i ? { ...s, label: e.target.value } : s)))
                }
                placeholder={`Player label for stem ${i + 1}`}
                aria-label={`Player-visible label for stem ${i + 1}`}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-ink outline-none focus:border-gold/40"
              />
              <span className="hidden truncate text-xs text-subtle sm:block sm:max-w-32">
                {stem.file.name}
              </span>
              <button onClick={() => move(i, -1)} disabled={i === 0} className={buttonQuiet + " disabled:opacity-30"} aria-label="Move up">
                ↑
              </button>
              <button onClick={() => move(i, 1)} disabled={i === stems.length - 1} className={buttonQuiet + " disabled:opacity-30"} aria-label="Move down">
                ↓
              </button>
              <button
                onClick={() => setStems(stems.filter((_, j) => j !== i))}
                className={buttonQuiet + " hover:border-danger/50 hover:text-danger"}
                aria-label="Remove stem"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <p className={"text-xs leading-relaxed text-subtle " + (reuseSource ? "hidden" : "")}>
          Upload raw or pre-trimmed stems together. The preview uses the selected trim window,
          and scheduling stores date-based Opus files so URLs cannot spoil the answer.
        </p>
        <button onClick={() => void submit()} disabled={progress !== null} className={buttonPrimary}>
          {progress ?? (reuseSource ? "Schedule reused stems" : "Upload & schedule")}
        </button>
      </section>
    </div>
  );
}

// --------------------------------------------------------------------- songs

const emptySongForm = {
  id: "",
  title: "",
  movie: "",
  year: "",
  singers: "",
  actors: "",
  aliases: "",
};

function SongsTab({
  songs,
  onSaved,
  onError,
}: {
  songs: Song[];
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptySongForm);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Prefill-from-streaming-search (Spotify credentials required).
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<TrackCandidate[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [pickedUrl, setPickedUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    const q = lookupQuery.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookupBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { results?: TrackCandidate[] };
          setLookupResults(data.results ?? []);
        }
      } catch {
        // aborted or offline
      } finally {
        setLookupBusy(false);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [lookupQuery]);

  const applyCandidate = (t: TrackCandidate) => {
    setForm((f) => ({
      ...f,
      title: t.title,
      movie: t.movie,
      year: t.year ? String(t.year) : f.year,
      singers: t.artists.join(", "),
      id: "",
    }));
    setPickedUrl(t.url ?? null);
    setLookupQuery("");
    setLookupResults([]);
    setEditing(false);
  };

  const copyLink = async () => {
    if (!pickedUrl) return;
    try {
      await navigator.clipboard.writeText(pickedUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      // clipboard blocked — the link is still visible to copy manually
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.movie.toLowerCase().includes(q) ||
        (s.aliases ?? []).some((alias) => alias.toLowerCase().includes(q)) ||
        (s.actors ?? []).some((actor) => actor.toLowerCase().includes(q)) ||
        s.singers.some((singer) => singer.toLowerCase().includes(q))
    );
  }, [songs, query]);

  const set = (key: keyof typeof emptySongForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const startEdit = (song: Song) => {
    setEditing(true);
    setForm({
      id: song.id,
      title: song.title,
      movie: song.movie,
      year: String(song.year),
      singers: song.singers.join(", "),
      actors: (song.actors ?? []).join(", "),
      aliases: (song.aliases ?? []).join(", "),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    setBusy(true);
    try {
      const id = form.id.trim() || slugify(`${form.title} ${form.movie}`);
      const res = await fetch("/api/admin/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title: form.title,
          movie: form.movie,
          year: Number(form.year),
          singers: form.singers.split(",").map((s) => s.trim()).filter(Boolean),
          actors: form.actors.split(",").map((s) => s.trim()).filter(Boolean),
          musicDirector: form.singers.split(",").map((s) => s.trim()).filter(Boolean)[0] ?? "Unknown",
          aliases: form.aliases.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save song");
      setForm(emptySongForm);
      setEditing(false);
      onSaved(editing ? "Song updated." : `Song added (${data.id}).`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save song");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (song: Song) => {
    if (!confirm(`Remove "${song.title}" from the catalog?`)) return;
    try {
      const res = await fetch(`/api/admin/songs?id=${encodeURIComponent(song.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not remove song");
      onSaved("Song removed.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not remove song");
    }
  };

  return (
    <div className="mt-6">
      <section className="stage-card rounded-2xl p-4">
        <h2 className="tiny-label">
          {editing ? `Edit song — ${form.id}` : "Add a song"}
        </h2>

        {!editing && (
          <div className="mt-3">
            <input
              value={lookupQuery}
              onChange={(e) => {
                setLookupQuery(e.target.value);
                if (e.target.value.trim().length < 2) setLookupResults([]);
              }}
              placeholder="Prefill from Spotify — search a track…"
              className={inputCls + " w-full"}
            />
            {(lookupResults.length > 0 || lookupBusy) && (
              <ul className="mt-2 max-h-56 overflow-auto rounded-xl border border-line bg-surface-raised/90">
                {lookupResults.map((t) => (
                  <li key={t.sourceId}>
                    <button
                      onClick={() => applyCandidate(t)}
                      className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition hover:bg-gold/10"
                    >
                      {t.artworkUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.artworkUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg border border-line object-cover" loading="lazy" />
                      ) : (
                        <span className="h-9 w-9 shrink-0 rounded-lg border border-line bg-surface" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{t.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {[t.movie, t.artists.join(", "), t.year ?? ""].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {lookupBusy && lookupResults.length === 0 && (
                  <li className="px-3 py-2 text-sm text-muted">Searching...</li>
                )}
              </ul>
            )}
            {pickedUrl && (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted">
                <span className="truncate">Track link: {pickedUrl}</span>
                <button onClick={() => void copyLink()} className={buttonQuiet + " shrink-0"}>
                  {linkCopied ? "Copied" : "Copy for official link"}
                </button>
              </p>
            )}
          </div>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input value={form.title} onChange={set("title")} placeholder="Title *" className={inputCls} />
          <input value={form.movie} onChange={set("movie")} placeholder="Movie *" className={inputCls} />
          <input value={form.year} onChange={set("year")} placeholder="Year *" inputMode="numeric" className={inputCls} />
          <input value={form.singers} onChange={set("singers")} placeholder="Artist (comma-separated) *" className={inputCls} />
          <input value={form.actors} onChange={set("actors")} placeholder="Actors (comma-separated)" className={inputCls} />
          <input value={form.aliases} onChange={set("aliases")} placeholder="Search aliases (comma-separated)" className={inputCls} />
          {!editing && (
            <input
              value={form.id}
              onChange={set("id")}
              placeholder="Slug (optional — auto from title)"
              className={inputCls + " font-mono text-xs sm:col-span-2"}
            />
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => void save()} disabled={busy} className={buttonPrimary}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add song"}
          </button>
          {editing && (
            <button
              onClick={() => {
                setEditing(false);
                setForm(emptySongForm);
              }}
              className={buttonQuiet}
            >
              Cancel
            </button>
          )}
        </div>
      </section>

      <div className="mt-6 flex items-center justify-between gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs, aliases, movies, actors, artists..."
          className={inputCls + " w-full max-w-sm"}
        />
        <p className="shrink-0 text-xs text-muted">
          {filtered.length} of {songs.length}
        </p>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface/45 shadow-float">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-raised/80 text-xs uppercase text-subtle">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Movie</th>
              <th className="px-3 py-2">Year</th>
              <th className="px-3 py-2">Artist</th>
              <th className="px-3 py-2">Actors</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((song) => (
              <tr key={song.id} className="bg-surface/45">
                <td className="px-3 py-2 font-semibold text-ink">{song.title}</td>
                <td className="px-3 py-2 text-muted">{song.movie}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted">{song.year}</td>
                <td className="max-w-48 truncate px-3 py-2 text-muted">
                  {song.singers.join(", ")}
                </td>
                <td className="max-w-48 truncate px-3 py-2 text-muted">
                  {song.actors?.join(", ") || "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => startEdit(song)} className={buttonQuiet}>
                      Edit
                    </button>
                    <button
                      onClick={() => void remove(song)}
                      className={buttonQuiet + " hover:border-danger/50 hover:text-danger"}
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
