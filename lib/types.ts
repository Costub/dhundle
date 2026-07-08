// Shared types for Dhoondle — the daily Bollywood song-guessing game.

export interface Song {
  id: string; // stable slug, e.g. "tum-hi-ho-aashiqui-2"
  title: string; // Roman-script title, e.g. "Tum Hi Ho"
  movie: string;
  year: number;
  singers: string[];
  actors?: string[];
  musicDirector: string;
  aliases?: string[]; // alternate spellings / longer titles for search
}

export interface StemInfo {
  position: number; // 1..6, reveal order
  instrument: string; // label shown to the player, e.g. "Rhythm", "Bass"
  src: string; // public URL of the audio file
}

/** Puzzle as stored server-side (knows the answer). */
export interface PuzzleDefinition {
  id: string; // e.g. "demo-1" or a db uuid
  songId: string;
  date?: string; // optional explicit YYYY-MM-DD (IST); demo puzzles rotate
  stems: StemInfo[];
  officialLink?: string; // YouTube/Spotify link to the real song for the reveal
}

/** What the client is allowed to see before the game is over. */
export interface PublicPuzzle {
  id: string;
  number: number; // Dhoondle #N
  date: string; // YYYY-MM-DD in IST
  stems: StemInfo[];
  maxAttempts: number;
}

export interface GuessFeedback {
  correct: boolean;
  sameMovie: boolean;
  sameComposer: boolean;
  sharedSingers: string[];
  /** -1 = guess is older than answer, 1 = newer, 0 = same year */
  yearDirection: -1 | 0 | 1;
  sameDecade: boolean;
}

export interface AnswerCard {
  song: Song;
  officialLink?: string;
}

export interface HintReveal {
  label: string; // e.g. "Year"
  value: string; // e.g. "2013"
}

export interface GuessResponse {
  /** null when the attempt was a skip */
  feedback: GuessFeedback | null;
  /** Server-counted attempt number consumed by this guess. */
  attempt: number;
  /** Signed token to send with the next guess for this puzzle/device. */
  playToken: string;
  /** Present only when the game is over (win or out of attempts). */
  answer?: AnswerCard;
  /** Public metadata for the resolved guess, including alias/free-text guesses. */
  guess?: Pick<Song, "id" | "title" | "movie">;
}

export const MAX_ATTEMPTS = 6;

/** A single attempt as stored client-side. */
export interface GuessRecord {
  songId: string | null; // null = skipped
  title: string | null;
  movie: string | null;
  feedback: GuessFeedback | null; // null for skips
}

export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  puzzleId: string;
  puzzleNumber: number;
  date: string;
  maxAttempts?: number;
  guesses: GuessRecord[];
  status: GameStatus;
  hints: HintReveal[];
  playToken?: string;
  serverAttempts?: number;
  answer?: AnswerCard;
}

export interface PlayerStats {
  played: number;
  won: number;
  currentStreak: number;
  maxStreak: number;
  /** wins by attempt count, index 0 = won on 1st attempt */
  distribution: number[];
  lastWinDate?: string;
  lastPlayedDate?: string;
}
