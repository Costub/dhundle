"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import GuessInput, { type GuessPick } from "./GuessInput";
// Guess autocomplete is streaming-search only. The in-house catalog would
// telegraph the answer pool, so it is never fetched by the game client.
import GuessList from "./GuessList";
import HintPanel from "./HintPanel";
import HowToPlay from "./HowToPlay";
import RevealCard from "./RevealCard";
import StemPlayer from "./StemPlayer";
import ThemeToggle from "./ThemeToggle";
import { CalendarIcon, QuestionIcon, TrophyIcon } from "./icons";
import type { HintLabel } from "@/lib/hints";
import {
  emptyStats,
  getOrCreateDeviceId,
  getPlayerName,
  loadArchiveState,
  loadGameState,
  loadStats,
  recordArchiveResult,
  recordResult,
  saveArchiveState,
  saveGameState,
} from "@/lib/storage";
import type {
  GameState,
  GuessResponse,
  HintReveal,
  PlayerStats,
  PublicPuzzle,
} from "@/lib/types";

const SEEN_HELP_KEY = "dhundle-seen-help-v1";

interface GameProps {
  /** Archive mode: play this past date instead of today. Daily when omitted. */
  archiveDate?: string;
}

function shimmerCls(extra = "") {
  return `animate-shimmer rounded-xl border border-line bg-[linear-gradient(110deg,var(--theme-surface)_0%,var(--theme-surface-raised)_40%,var(--theme-surface)_80%)] bg-[length:220%_100%] ${extra}`;
}

function LoadingSkeleton() {
  return (
    <div className="mt-6 space-y-4" aria-label="Loading today's puzzle">
      <div className={shimmerCls("h-36 rounded-[1.35rem]")} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={shimmerCls("h-14")} />
        ))}
      </div>
      <div className={shimmerCls("h-12")} />
    </div>
  );
}

export default function Game({ archiveDate }: GameProps) {
  const isArchive = Boolean(archiveDate);
  const [puzzle, setPuzzle] = useState<PublicPuzzle | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [stats, setStats] = useState<PlayerStats>(emptyStats());
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const persistState = useCallback(
    (next: GameState) => (isArchive ? saveArchiveState(next) : saveGameState(next)),
    [isArchive]
  );

  useEffect(() => {
    (async () => {
      try {
        const pRes = await fetch(
          archiveDate ? `/api/puzzle/${archiveDate}` : "/api/puzzle/today"
        );
        if (!pRes.ok) {
          setError(
            archiveDate
              ? "No puzzle exists for that date."
              : "No puzzle scheduled for today. Check back soon!"
          );
          return;
        }
        const p: PublicPuzzle = await pRes.json();
        setPuzzle(p);

        const saved = archiveDate ? loadArchiveState(archiveDate) : loadGameState();
        if (saved && saved.puzzleId === p.id && saved.date === p.date) {
          setState({ ...saved, maxAttempts: p.maxAttempts });
        } else {
          setState({
            puzzleId: p.id,
            puzzleNumber: p.number,
            date: p.date,
            maxAttempts: p.maxAttempts,
            guesses: [],
            status: "playing",
            hints: [],
          });
        }
        setStats(loadStats());
        if (!archiveDate && !localStorage.getItem(SEEN_HELP_KEY)) {
          setShowHelp(true);
          localStorage.setItem(SEEN_HELP_KEY, "1");
        }
      } catch {
        setError("Could not load the puzzle. Try refreshing.");
      }
    })();
  }, [archiveDate]);

  const submitAttempt = useCallback(
    async (pick: GuessPick | null) => {
      if (!puzzle || !state || state.status !== "playing" || submitting) return;
      const maxAttempts = puzzle.maxAttempts;
      setSubmitting(true);
      try {
        const deviceId = getOrCreateDeviceId();
        const res = await fetch("/api/guess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            puzzleId: puzzle.id,
            deviceId,
            songId: null,
            sourceId: pick?.kind === "external" ? pick.sourceId : undefined,
            query: pick?.kind === "text" ? pick.query : undefined,
            playToken: state.playToken,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(typeof data.error === "string" ? data.error : "guess failed");
        }
        const data: GuessResponse = await res.json();

        const correct = data.feedback?.correct ?? false;
        const over = correct || data.attempt >= maxAttempts;
        const fallbackTitle =
          pick?.kind === "external" ? pick.title : pick?.kind === "text" ? pick.query : null;
        const fallbackMovie = pick?.kind === "external" ? pick.movie : null;
        const next: GameState = {
          ...state,
          maxAttempts,
          guesses: [
            ...state.guesses,
            {
              songId: data.guess?.id ?? null,
              title: data.guess?.title ?? fallbackTitle,
              movie: data.guess?.movie ?? fallbackMovie,
              feedback: data.feedback,
            },
          ],
          status: over ? (correct ? "won" : "lost") : "playing",
          playToken: data.playToken,
          serverAttempts: data.attempt,
          answer: data.answer ?? state.answer,
        };
        setState(next);
        persistState(next);
        if (over) {
          const attempts = Math.min(data.attempt, maxAttempts);
          if (isArchive && archiveDate) {
            recordArchiveResult(archiveDate, {
              status: correct ? "won" : "lost",
              attempts,
              maxAttempts,
            });
          } else {
            setStats(recordResult(correct, attempts, next.date));
          }
          void fetch("/api/result", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              puzzleId: puzzle.id,
              deviceId,
              status: next.status,
              attempts,
              hintsUsed: next.hints.length,
              displayName: getPlayerName() || undefined,
            }),
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong submitting your guess.");
        setTimeout(() => setError(null), 3000);
      } finally {
        setSubmitting(false);
      }
    },
    [puzzle, state, submitting, isArchive, archiveDate, persistState]
  );

  const revealHint = useCallback(
    async (label: HintLabel) => {
      if (!puzzle || !state || state.status !== "playing") return;
      if (state.hints.some((h) => h.label === label)) return;
      try {
        const res = await fetch("/api/hint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            puzzleId: puzzle.id,
            deviceId: getOrCreateDeviceId(),
            label,
          }),
        });
        if (!res.ok) throw new Error("hint failed");
        const hint: HintReveal = await res.json();
        setState((prev) => {
          if (!prev || prev.hints.some((h) => h.label === hint.label)) return prev;
          const next = { ...prev, hints: [...prev.hints, hint] };
          persistState(next);
          return next;
        });
      } catch {
        setError("Could not reveal that hint. Try again.");
        setTimeout(() => setError(null), 3000);
      }
    },
    [puzzle, state, persistState]
  );

  const header = (
    <header className="stage-panel relative overflow-hidden px-4 py-3">
      <div className="pointer-events-none absolute inset-x-8 -top-20 h-32 rounded-full bg-gold/20 blur-3xl" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/" className="inline-flex flex-col">
            <span className="block bg-gradient-to-r from-gold-soft via-gold to-rose-glow bg-clip-text font-display text-[2rem] leading-none text-transparent">
              Dhoondle
            </span>
            <span className="mt-1 block text-[0.66rem] font-semibold uppercase text-subtle/80">
              bollywood bandle
            </span>
          </Link>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/archive" aria-label="Past challenges" className="icon-button">
            <CalendarIcon className="h-5 w-5" />
          </Link>
          <Link href="/leaderboard" aria-label="Leaderboard" className="icon-button">
            <TrophyIcon className="h-5 w-5" />
          </Link>
          <ThemeToggle />
          <button
            onClick={() => setShowHelp(true)}
            aria-label="How to play"
            className="icon-button"
          >
            <QuestionIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );

  if (error && !state) {
    return (
      <div>
        {header}
        <p className="stage-card mt-8 px-4 py-8 text-center text-sm text-muted">{error}</p>
      </div>
    );
  }
  if (!puzzle || !state) {
    return (
      <div>
        {header}
        <LoadingSkeleton />
      </div>
    );
  }

  const over = state.status !== "playing";
  const maxAttempts = puzzle.maxAttempts;
  const attemptsUsed = Math.max(state.serverAttempts ?? 0, state.guesses.length);
  const revealedCount = over
    ? puzzle.stems.length
    : Math.min(attemptsUsed + 1, puzzle.stems.length);

  return (
    <div className="space-y-4">
      {header}

      <div className="animate-fade-up">
        <StemPlayer stems={puzzle.stems} revealedCount={revealedCount} />
      </div>
      <div className="animate-fade-up [animation-delay:60ms]">
        <HintPanel hints={state.hints} canReveal={!over} onReveal={revealHint} />
      </div>

      {!over && (
        <div className="relative z-50 animate-fade-up [animation-delay:120ms]">
          <GuessInput
            disabled={submitting}
            attemptsLeft={maxAttempts - attemptsUsed}
            onGuess={(entry) => void submitAttempt(entry)}
            onSkip={() => void submitAttempt(null)}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-center text-xs font-medium text-danger">
          {error}
        </p>
      )}

      <div className="relative z-0 animate-fade-up [animation-delay:180ms]">
        <GuessList guesses={state.guesses} maxAttempts={maxAttempts} />
      </div>

      {over && (
        <RevealCard state={state} stats={stats} mode={isArchive ? "archive" : "daily"} />
      )}

      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
