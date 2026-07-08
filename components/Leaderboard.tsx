"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, TrophyIcon, XMarkIcon } from "./icons";
import type { AllTimeEntry, DailyEntry } from "@/lib/leaderboard";
import {
  getOrCreateDeviceId,
  getPlayerName,
  loadGameState,
  setPlayerName,
} from "@/lib/storage";

type Scope = "daily" | "alltime";

const rowCls = (isYou: boolean) =>
  "stage-card flex items-center gap-3 px-4 py-3 " +
  (isYou ? "border-gold/45 bg-gold/12" : "bg-surface/55");

function Rank({ n }: { n: number }) {
  const medal =
    n === 1 ? "text-gold" : n === 2 ? "text-muted" : n === 3 ? "text-vermilion" : "text-subtle";
  return (
    <span className={`w-7 shrink-0 text-center font-mono text-sm font-bold tabular-nums ${medal}`}>
      {n}
    </span>
  );
}

export default function Leaderboard({ initialDate }: { initialDate?: string }) {
  const [scope, setScope] = useState<Scope>("daily");
  const [daily, setDaily] = useState<DailyEntry[] | null>(null);
  const [allTime, setAllTime] = useState<AllTimeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [savedNote, setSavedNote] = useState(false);

  const load = useCallback(async () => {
    try {
      const dateParam = initialDate ? `&date=${initialDate}` : "";
      const [dRes, aRes] = await Promise.all([
        fetch(`/api/leaderboard?scope=daily${dateParam}`),
        fetch("/api/leaderboard?scope=alltime"),
      ]);
      if (!dRes.ok || !aRes.ok) throw new Error("load failed");
      setDaily((await dRes.json()).entries);
      setAllTime((await aRes.json()).entries);
      setError(null);
    } catch {
      setError("Could not load the leaderboard. Try refreshing.");
    }
  }, [initialDate]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setName(getPlayerName());
      void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const saveName = async () => {
    setPlayerName(name);
    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 3000);
    const state = loadGameState();
    if (state && state.status !== "playing") {
      await fetch("/api/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puzzleId: state.puzzleId,
          deviceId: getOrCreateDeviceId(),
          status: state.status,
          attempts: Math.min(state.serverAttempts ?? state.guesses.length, state.maxAttempts ?? 6),
          hintsUsed: state.hints.length,
          displayName: name.trim() || undefined,
        }),
      });
      void load();
    }
  };

  return (
    <div className="mt-5">
      <section className="stage-card p-4">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="tiny-label">Your leaderboard name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="Anonymous"
              className="input-field mt-1"
            />
          </div>
          <button onClick={() => void saveName()} className="btn-primary px-4 py-3">
            Save
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-subtle">
          {savedNote
            ? "Saved. It appears next to your finished games."
            : "Shown publicly next to your results. Leave empty to stay anonymous."}
        </p>
      </section>

      <nav className="mt-4 flex gap-1 rounded-2xl border border-line bg-surface-glass p-1 shadow-sm backdrop-blur">
        {(
          [
            ["daily", initialDate ? `Day ${initialDate}` : "Today"],
            ["alltime", "All-time"],
          ] as [Scope, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setScope(key)}
            className={
              "focus-ring flex-1 cursor-pointer rounded-xl px-4 py-2.5 text-sm font-bold transition duration-200 " +
              (scope === key
                ? "bg-gold text-night shadow-glow"
                : "text-muted hover:bg-surface hover:text-ink")
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-danger/30 bg-danger/10 px-3 py-3 text-center text-sm text-danger">
          {error}
        </p>
      )}
      {!error && scope === "daily" && <DailyBoard entries={daily} />}
      {!error && scope === "alltime" && <AllTimeBoard entries={allTime} />}
    </div>
  );
}

function EmptyBoard({ text }: { text: string }) {
  return (
    <div className="stage-card mt-5 px-5 py-10 text-center">
      <TrophyIcon className="mx-auto h-8 w-8 text-subtle" />
      <p className="mt-3 text-sm leading-relaxed text-muted">{text}</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <ul className="mt-4 grid gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="h-14 animate-shimmer rounded-2xl border border-line bg-[linear-gradient(110deg,var(--theme-surface)_0%,var(--theme-surface-raised)_40%,var(--theme-surface)_80%)] bg-[length:220%_100%]"
        />
      ))}
    </ul>
  );
}

function DailyBoard({ entries }: { entries: DailyEntry[] | null }) {
  if (!entries) return <LoadingRows />;
  if (entries.length === 0) {
    return <EmptyBoard text="No finished games for this day yet. Be the first on the board!" />;
  }
  return (
    <ul className="mt-4 grid gap-2">
      {entries.map((e, i) => (
        <li key={e.id} className={rowCls(e.isYou)}>
          <Rank n={i + 1} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
            {e.name}
            {e.isYou && <span className="ml-1.5 text-xs font-normal text-gold-soft">(you)</span>}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {e.hintsUsed > 0 && <span className="font-mono">{e.hintsUsed}h</span>}
            <span
              className={
                "flex items-center gap-1 rounded-full border px-2.5 py-1 font-bold " +
                (e.won
                  ? "border-emerald/25 bg-emerald/12 text-emerald"
                  : "border-danger/25 bg-danger/10 text-danger")
              }
            >
              {e.won ? (
                <>
                  <CheckIcon className="h-3 w-3" />
                  {e.attempts}
                </>
              ) : (
                <>
                  <XMarkIcon className="h-3 w-3" />
                  Lost
                </>
              )}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function AllTimeBoard({ entries }: { entries: AllTimeEntry[] | null }) {
  if (!entries) return <LoadingRows />;
  if (entries.length === 0) {
    return <EmptyBoard text="No games recorded yet. Finish today's puzzle to start the board." />;
  }
  return (
    <ul className="mt-4 grid gap-2">
      {entries.map((e, i) => (
        <li key={e.id} className={rowCls(e.isYou)}>
          <Rank n={i + 1} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
            {e.name}
            {e.isYou && <span className="ml-1.5 text-xs font-normal text-gold-soft">(you)</span>}
          </span>
          <span className="flex shrink-0 gap-3 text-right text-xs tabular-nums text-muted">
            <span>
              <span className="block font-bold text-ink">{e.wins}</span>
              wins
            </span>
            <span>
              <span className="block font-bold text-ink">{e.winPct}%</span>
              win rate
            </span>
            <span className="hidden sm:block">
              <span className="block font-bold text-ink">{e.avgAttempts || "-"}</span>
              avg tries
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
