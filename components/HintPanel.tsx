"use client";

import { useState } from "react";
import { LockIcon } from "./icons";
import { HINT_LABELS, type HintLabel } from "@/lib/hints";
import type { HintReveal } from "@/lib/types";

interface HintPanelProps {
  hints: HintReveal[];
  /** false once the game is over; reveal buttons disappear */
  canReveal: boolean;
  onReveal: (label: HintLabel) => Promise<void>;
}

export default function HintPanel({ hints, canReveal, onReveal }: HintPanelProps) {
  const [pending, setPending] = useState<HintLabel | null>(null);
  const revealed = new Map(hints.map((h) => [h.label, h.value]));

  const reveal = async (label: HintLabel) => {
    if (pending) return;
    setPending(label);
    try {
      await onReveal(label);
    } finally {
      setPending(null);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <p className="tiny-label">{canReveal ? "Still need help?" : "Hints"}</p>
        <p className="text-[11px] font-medium text-subtle">
          {revealed.size === 0
            ? canReveal
              ? "Reveal a clue"
              : "None used"
            : `${revealed.size} used`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {HINT_LABELS.map((label) => {
          const value = revealed.get(label);
          if (value) {
            return (
              <div
                key={label}
                className="col-span-2 animate-scale-in rounded-2xl border border-gold/30 bg-gold/12 px-3 py-2.5 shadow-sm"
              >
                <p className="text-[10px] font-bold uppercase text-subtle">{label}</p>
                <p
                  className="mt-0.5 whitespace-normal break-words text-sm font-semibold leading-snug text-gold-soft"
                  title={value}
                >
                  {value}
                </p>
              </div>
            );
          }
          if (!canReveal) {
            return (
              <div
                key={label}
                className="rounded-2xl border border-line bg-surface/50 px-3 py-2.5"
              >
                <p className="text-[10px] font-bold uppercase text-subtle">{label}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-subtle">
                  <LockIcon className="h-3 w-3" />
                  Not used
                </p>
              </div>
            );
          }
          return (
            <button
              key={label}
              onClick={() => void reveal(label)}
              disabled={pending !== null}
              className="focus-ring group min-h-16 cursor-pointer rounded-2xl border border-line bg-surface/55 px-3 py-2.5 text-left shadow-sm transition duration-200 hover:border-gold/40 hover:bg-gold/8 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <p className="text-[10px] font-bold uppercase text-subtle">{label}</p>
              <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-muted transition duration-200 group-hover:text-gold-soft">
                {pending === label ? (
                  "Revealing..."
                ) : (
                  <>
                    <LockIcon className="h-3 w-3" />
                    Reveal
                  </>
                )}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
