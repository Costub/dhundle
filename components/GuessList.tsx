"use client";

import { CheckIcon, SkipIcon, XMarkIcon } from "./icons";
import type { GuessRecord } from "@/lib/types";

function Badge({ children, tone }: { children: React.ReactNode; tone: "match" | "info" }) {
  return (
    <span
      className={
        "rounded-full border px-2 py-0.5 text-[10px] font-bold " +
        (tone === "match"
          ? "border-gold/25 bg-gold/12 text-gold-soft"
          : "border-line bg-surface-raised/70 text-muted")
      }
    >
      {children}
    </span>
  );
}

export default function GuessList({
  guesses,
  maxAttempts,
}: {
  guesses: GuessRecord[];
  maxAttempts: number;
}) {
  return (
    <ol className="space-y-2">
      {Array.from({ length: maxAttempts }).map((_, i) => {
        const g = guesses[i];
        if (!g) {
          return (
            <li
              key={i}
              className="flex h-12 items-center rounded-2xl border border-dashed border-line bg-surface/25 px-4 text-xs font-bold text-subtle"
            >
              Attempt {i + 1}
            </li>
          );
        }
        if (g.songId === null) {
          return (
            <li
              key={i}
              className="flex min-h-12 animate-fade-up items-center gap-2.5 rounded-2xl border border-line bg-surface/55 px-4 py-2 text-sm text-muted"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-line/45 text-subtle">
                <SkipIcon className="h-4 w-4" />
              </span>
              <span className="font-semibold">Skipped</span>
            </li>
          );
        }
        const f = g.feedback;
        const correct = f?.correct;
        return (
          <li
            key={i}
            className={
              "flex min-h-12 animate-fade-up flex-wrap items-center gap-2.5 rounded-2xl border px-4 py-2 shadow-sm " +
              (correct
                ? "border-emerald/40 bg-emerald/12"
                : "border-line bg-surface/55")
            }
          >
            <span
              className={
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full " +
                (correct
                  ? "bg-emerald/18 text-emerald"
                  : "bg-danger/12 text-danger")
              }
            >
              {correct ? (
                <CheckIcon className="h-3.5 w-3.5" />
              ) : (
                <XMarkIcon className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
              {g.title}
              <span className="font-normal text-muted"> - {g.movie}</span>
            </span>
            {f && !correct && (
              <span className="flex flex-wrap gap-1">
                {f.sameMovie && <Badge tone="match">Same movie</Badge>}
                {f.sameComposer && <Badge tone="match">Same composer</Badge>}
                {f.sharedSingers.length > 0 && <Badge tone="match">Singer match</Badge>}
                {f.sameDecade && !f.sameMovie && <Badge tone="match">Right decade</Badge>}
                {f.yearDirection !== 0 && (
                  <Badge tone="info">
                    {f.yearDirection === 1 ? "Answer is newer" : "Answer is older"}
                  </Badge>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
