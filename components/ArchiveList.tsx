"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckIcon, XMarkIcon } from "./icons";
import { loadArchiveResults, type ArchiveResult } from "@/lib/storage";
import type { PlayableDate } from "@/lib/puzzles";

export default function ArchiveList({
  dates,
  accountResults = {},
}: {
  dates: PlayableDate[];
  accountResults?: Record<string, ArchiveResult>;
}) {
  const [results, setResults] = useState<Record<string, ArchiveResult>>(accountResults);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setResults({ ...loadArchiveResults(), ...accountResults });
    });
    return () => {
      cancelled = true;
    };
  }, [accountResults]);

  if (dates.length === 0) {
    return (
      <p className="stage-card mt-6 px-5 py-10 text-center text-sm leading-relaxed text-muted">
        No past challenges yet. The archive fills up as daily puzzles go by.
      </p>
    );
  }

  return (
    <ul className="mt-5 grid gap-2">
      {dates.map(({ date, number }, i) => {
        const result = results[date];
        return (
          <li
            key={date}
            className="animate-fade-up"
            style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
          >
            <Link
              href={`/puzzle/${date}`}
              className="stage-card group flex items-center justify-between gap-3 px-4 py-3 transition duration-200 hover:border-gold/45 hover:bg-surface-raised/75 active:scale-[0.99]"
            >
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink">Puzzle #{number}</span>
                <span className="block font-mono text-xs text-muted">{date}</span>
              </span>
              {result ? (
                <span
                  className={
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold " +
                    (result.status === "won"
                      ? "border-emerald/25 bg-emerald/12 text-emerald"
                      : "border-danger/25 bg-danger/10 text-danger")
                  }
                >
                  {result.status === "won" ? (
                    <>
                      <CheckIcon className="h-3 w-3" />
                      {result.attempts}/{result.maxAttempts ?? 6}
                    </>
                  ) : (
                    <>
                      <XMarkIcon className="h-3 w-3" />
                      Lost
                    </>
                  )}
                </span>
              ) : (
                <span className="rounded-full border border-line px-3 py-1 text-xs font-bold text-muted transition group-hover:border-gold/35 group-hover:text-gold-soft">
                  Play
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
