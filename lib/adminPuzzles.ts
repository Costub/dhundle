import { supabasePost } from "./supabase";

export interface AdminStemInput {
  position: number;
  instrument: string;
  storagePath: string;
}

export interface AdminPuzzleInput {
  songId: string;
  date: string;
  officialLink?: string;
  stems: AdminStemInput[];
}

export function validatePuzzle(input: AdminPuzzleInput): void {
  if (!input.songId.trim()) throw new Error("Song id is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Date must be YYYY-MM-DD");
  if (input.stems.length < 4 || input.stems.length > 6) {
    throw new Error("Provide 4 to 6 stems");
  }
  const positions = new Set(input.stems.map((stem) => stem.position));
  if (positions.size !== input.stems.length) throw new Error("Stem positions must be unique");
  for (const stem of input.stems) {
    if (stem.position < 1 || stem.position > 6) throw new Error("Stem positions must be 1-6");
    if (!stem.instrument.trim() || !stem.storagePath.trim()) {
      throw new Error("Every stem needs an instrument label and storage path");
    }
  }
}

export async function schedulePuzzle(input: AdminPuzzleInput): Promise<string> {
  validatePuzzle(input);
  const puzzleRows = await supabasePost<{ id: string }[]>(
    "puzzles?on_conflict=puzzle_date",
    {
      song_id: input.songId.trim(),
      puzzle_date: input.date,
      status: "scheduled",
      official_link: input.officialLink?.trim() || null,
    }
  );
  const puzzleId = puzzleRows?.[0]?.id;
  if (!puzzleId) throw new Error("Supabase is not configured");
  await supabasePost(
    "stems?on_conflict=puzzle_id,position",
    input.stems.map((stem) => ({
      puzzle_id: puzzleId,
      position: stem.position,
      instrument_label: stem.instrument.trim(),
      storage_path: stem.storagePath.trim(),
    }))
  );
  return puzzleId;
}
