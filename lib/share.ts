import type { GameState } from "./types";
import { hasPartialMatch } from "./feedback";

export function buildShareText(state: GameState, url = "https://dhoondle.app"): string {
  const score = state.status === "won" ? String(state.guesses.length) : "X";
  const maxAttempts = state.maxAttempts ?? 6;
  const hints = ` Hints: ${state.hints.length}`;
  const row = state.guesses
    .map((g) => {
      if (g.songId === null) return "⬛";
      if (g.feedback?.correct) return "🟩";
      if (g.feedback && hasPartialMatch(g.feedback)) return "🟨";
      return "🟥";
    })
    .join("");
  return `Dhoondle #${state.puzzleNumber} ${score}/${maxAttempts}${hints}\n\n${row}\n\n${url}`;
}
