"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarIcon,
  CheckIcon,
  ClapperIcon,
  ExternalLinkIcon,
  ShareIcon,
  SparklesIcon,
  TrophyIcon,
} from "./icons";
import { msUntilNextPuzzle } from "@/lib/day";
import { buildShareText } from "@/lib/share";
import type { GameState, PlayerStats } from "@/lib/types";

function Countdown() {
  const [ms, setMs] = useState(msUntilNextPuzzle());
  useEffect(() => {
    const t = setInterval(() => setMs(msUntilNextPuzzle()), 1000);
    return () => clearInterval(t);
  }, []);
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return (
    <span className="font-mono text-base font-semibold tabular-nums text-ink">
      {h}:{m}:{s}
    </span>
  );
}

export default function RevealCard({
  state,
  stats,
  mode = "daily",
}: {
  state: GameState;
  stats: PlayerStats;
  mode?: "daily" | "archive";
}) {
  const isArchive = mode === "archive";
  const [copied, setCopied] = useState(false);
  const answer = state.answer;
  if (!answer) return null;
  const { song } = answer;
  const won = state.status === "won";
  const hintsUsed = state.hints.length;
  const maxAttempts = state.maxAttempts ?? 6;

  const share = async () => {
    const appUrl = "https://dhoondle.fun";
    const shareUrl = isArchive
      ? `${appUrl}/puzzle/${state.date}`
      : appUrl;
    const text = buildShareText(state, { url: shareUrl });
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (error) {
      // User cancelled share sheet.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked in non-secure contexts.
    }
  };

  return (
    <div className="stage-panel relative animate-pop overflow-hidden p-6 text-center">
      <div className="pointer-events-none absolute inset-x-6 -top-20 h-40 rounded-full bg-gold/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-rose-glow/16 blur-3xl" />
      <div
        className={
          "relative mx-auto flex h-14 w-14 items-center justify-center rounded-full border " +
          (won
            ? "border-gold/35 bg-gold/15 text-gold"
            : "border-line bg-surface-raised text-muted")
        }
      >
        {won ? <SparklesIcon className="h-7 w-7" /> : <ClapperIcon className="h-7 w-7" />}
      </div>
      <p className="relative mt-3 text-sm font-medium text-muted">
        {won
          ? `You got it in ${state.guesses.length} of ${maxAttempts}`
          : "Out of guesses - the answer was"}
      </p>
      <h2 className="relative mt-2 font-display text-3xl leading-tight text-gold-soft">
        {song.title}
      </h2>
      <p className="relative mt-1 text-sm font-semibold text-ink">
        {song.movie} ({song.year})
      </p>
      <p className="relative mt-1 text-xs leading-relaxed text-muted">
        {song.singers.join(", ")}
        {song.actors?.length ? ` - ${song.actors.join(", ")}` : ""}
      </p>
      <p className="relative mt-4 inline-flex rounded-full border border-line bg-night/35 px-3 py-1 text-xs font-semibold text-muted">
        Hints used: {hintsUsed}/4
      </p>

      {answer.officialLink && (
        <a
          href={answer.officialLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-quiet relative mt-4 rounded-full px-4 py-2 text-xs"
        >
          <ExternalLinkIcon className="h-3.5 w-3.5" />
          Listen to the original
        </a>
      )}

      {!isArchive && (
        <div className="relative mt-6 grid grid-cols-4 gap-2 text-center">
          {[
            ["Played", stats.played],
            ["Win %", stats.played ? Math.round((stats.won / stats.played) * 100) : 0],
            ["Streak", stats.currentStreak],
            ["Best", stats.maxStreak],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-line bg-surface/60 px-2 py-2.5">
              <p className="text-lg font-bold tabular-nums text-ink">{value}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase text-subtle">{label}</p>
            </div>
          ))}
        </div>
      )}

      <button onClick={share} className="btn-primary relative mt-6 w-full">
        {copied ? (
          <>
            <CheckIcon className="h-4 w-4" />
            Copied to clipboard
          </>
        ) : (
          <>
            <ShareIcon className="h-4 w-4" />
            Share your result
          </>
        )}
      </button>

      <div className="relative mt-4 flex items-center justify-center gap-2">
        <Link
          href={isArchive ? "/archive" : `/leaderboard?date=${state.date}`}
          className="btn-quiet rounded-full px-4 py-2 text-xs"
        >
          {isArchive ? (
            <>
              <CalendarIcon className="h-3.5 w-3.5" />
              More past challenges
            </>
          ) : (
            <>
              <TrophyIcon className="h-3.5 w-3.5" />
              See the leaderboard
            </>
          )}
        </Link>
      </div>

      {!isArchive && (
        <p className="relative mt-5 text-xs text-muted">
          Next puzzle in <Countdown />
        </p>
      )}
    </div>
  );
}
