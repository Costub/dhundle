import type { HintReveal, Song } from "./types";

/**
 * Hints the player can reveal manually, ordered least → most spoilery.
 * Revealing is optional and each reveal is counted in the final result.
 */
export const HINT_LABELS = [
  "Year",
  "Artist",
  "Actor",
  "Movie",
] as const;

export type HintLabel = (typeof HINT_LABELS)[number];

export function isHintLabel(label: unknown): label is HintLabel {
  return typeof label === "string" && (HINT_LABELS as readonly string[]).includes(label);
}

export function hintForLabel(label: HintLabel, answer: Song): HintReveal {
  switch (label) {
    case "Year":
      return { label, value: String(answer.year) };
    case "Artist":
      return { label, value: answer.singers.join(", ") };
    case "Actor":
      return { label, value: answer.actors?.length ? answer.actors.join(", ") : "Not listed" };
    case "Movie":
      return { label, value: answer.movie };
  }
}
