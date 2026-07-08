"use client";

import { useEffect, useRef, useState } from "react";
import { FlagIcon, MusicIcon, SearchIcon, SkipIcon } from "./icons";
import type { TrackCandidate } from "@/lib/musicSearch";

/** What a submitted guess can be. */
export type GuessPick =
  | { kind: "external"; sourceId: string; title: string; movie: string }
  | { kind: "text"; query: string };

interface GuessInputProps {
  disabled: boolean;
  attemptsLeft: number;
  onGuess: (pick: GuessPick) => void;
  onSkip: () => void;
}

/**
 * Guess box backed entirely by Spotify search. The in-house catalog is
 * deliberately NOT shown here: listing the songs we've added would telegraph
 * the answer pool. Picks are resolved against the catalog server-side.
 */
export default function GuessInput({
  disabled,
  attemptsLeft,
  onGuess,
  onSkip,
}: GuessInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [results, setResults] = useState<TrackCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { results?: TrackCandidate[] };
          setResults(data.results ?? []);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const submit = (pick: GuessPick) => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onGuess(pick);
  };

  const pickOf = (t: TrackCandidate): GuessPick => ({
    kind: "external",
    sourceId: t.sourceId,
    title: t.title,
    movie: t.movie,
  });

  const lastChance = attemptsLeft <= 1;

  return (
    <div ref={boxRef} className="relative z-30">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            value={query}
            disabled={disabled}
            placeholder="Search Spotify for the song..."
            aria-label="Guess the song"
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < 2) setResults([]);
              setHighlight(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && results.length) {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, results.length - 1));
              } else if (e.key === "ArrowUp" && results.length) {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (results.length) {
                  submit(pickOf(results[highlight]));
                } else if (query.trim().length >= 2) {
                  submit({ kind: "text", query: query.trim() });
                }
              }
            }}
            className="input-field py-3.5 pl-10 pr-4"
          />
        </div>
        <button
          onClick={onSkip}
          disabled={disabled}
          className={lastChance ? "btn-quiet shrink-0 border-danger/35 text-danger hover:border-danger/60" : "btn-quiet shrink-0"}
        >
          {lastChance ? (
            <FlagIcon className="h-4 w-4" />
          ) : (
            <SkipIcon className="h-4 w-4" />
          )}
          {lastChance ? "Give up" : "Skip"}
        </button>
      </div>

      {open && (results.length > 0 || searching) && (
        <div
          className="absolute z-[100] mt-2 w-full animate-scale-in isolate rounded-2xl border border-line p-1 shadow-stage"
          style={{ backgroundColor: "var(--theme-surface-raised)" }}
        >
          <ul
            className="max-h-72 overflow-auto rounded-[0.85rem]"
            style={{ backgroundColor: "var(--theme-surface-raised)" }}
          >
          {results.map((t, i) => (
            <li key={t.sourceId}>
              <button
                onClick={() => submit(pickOf(t))}
                onMouseEnter={() => setHighlight(i)}
                className={
                  "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition duration-150 " +
                  (i === highlight ? "bg-gold/12" : "hover:bg-surface")
                }
              >
                {t.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.artworkUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-subtle">
                    <MusicIcon className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {t.title}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[t.movie, t.artists.join(", ")].filter(Boolean).join(" - ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {searching && results.length === 0 && (
            <li className="px-3.5 py-3 text-sm text-muted">Searching...</li>
          )}
          </ul>
        </div>
      )}
    </div>
  );
}
