import { normalizeSearchText } from "./catalog";
import type { GuessFeedback, Song } from "./types";

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Movie names from streaming metadata carry noise ("Aashiqui 2 (Original
 * Motion Picture Soundtrack)"), so compare normalized and allow containment.
 */
function sameMovieName(a: string, b: string): boolean {
  const na = normalizeSearchText(a);
  const nb = normalizeSearchText(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function computeFeedback(guess: Song, answer: Song): GuessFeedback {
  const correct = guess.id === answer.id;
  const answerSingers = new Set(answer.singers.map(normName));
  const sharedSingers = correct
    ? []
    : guess.singers.filter((s) => answerSingers.has(normName(s)));
  // year 0/undefined means "unknown" (external tracks) — never fake a direction.
  const yearsKnown = guess.year > 1900 && answer.year > 1900;
  return {
    correct,
    sameMovie: !correct && sameMovieName(guess.movie, answer.movie),
    sameComposer:
      !correct &&
      Boolean(normName(guess.musicDirector)) &&
      normName(guess.musicDirector) === normName(answer.musicDirector),
    sharedSingers,
    yearDirection: !yearsKnown
      ? 0
      : guess.year === answer.year
        ? 0
        : guess.year < answer.year
          ? 1
          : -1,
    sameDecade:
      !correct &&
      yearsKnown &&
      Math.floor(guess.year / 10) === Math.floor(answer.year / 10),
  };
}

export function hasPartialMatch(f: GuessFeedback): boolean {
  return f.sameMovie || f.sameComposer || f.sharedSingers.length > 0 || f.sameDecade;
}
