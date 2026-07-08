import type { GameState } from "./types";

const SQUARE = {
  correct: "\u{1F7E9}",
  missed: "\u2B1B",
  unused: "\u2B1C",
  hint: "\u{1F7E6}",
} as const;

interface ShareOptions {
  url?: string;
}

function buildAttemptRow(state: GameState, maxAttempts: number): string {
  const cells: string[] = state.guesses.slice(0, maxAttempts).map((guess) => {
    if (guess.feedback?.correct) return SQUARE.correct;
    return SQUARE.missed;
  });

  while (cells.length < maxAttempts) cells.push(SQUARE.unused);
  return cells.join("");
}

function buildHintRow(hintsUsed: number, totalHints: number): string {
  return Array.from({ length: totalHints }, (_, index) =>
    index < hintsUsed ? SQUARE.hint : SQUARE.unused
  ).join("");
}

export function buildShareText(
  state: GameState,
  { url = "https://dhoondle.fun" }: ShareOptions = {}
): string {
  const maxAttempts = state.maxAttempts ?? 6;
  const totalHints = 4;
  const score = state.status === "won" ? String(state.guesses.length) : "X";

  return [
    `Dhoondle #${state.puzzleNumber} ${score}/${maxAttempts}`,
    "",
    `Tries  ${buildAttemptRow(state, maxAttempts)}`,
    `Hints  ${state.hints.length}/${totalHints} ${buildHintRow(state.hints.length, totalHints)}`,
    "",
    url,
  ].join("\n");
}
