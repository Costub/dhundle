import Link from "next/link";
import ArchiveList from "@/components/ArchiveList";
import SignInGate from "@/components/SignInGate";
import { ArrowLeftIcon } from "@/components/icons";
import { currentSupabaseUser } from "@/lib/adminAuth";
import { todayIST } from "@/lib/day";
import { getPuzzleForDate, listPlayableDates, type PlayableDate } from "@/lib/puzzles";
import { listResultsForUser } from "@/lib/results";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Past Challenges - Dhoondle",
  description: "Replay any previous Dhoondle puzzle.",
};

async function archiveResultsForUser(userId: string, dates: PlayableDate[]) {
  const [rows, puzzleMeta] = await Promise.all([
    listResultsForUser(userId),
    Promise.all(
      dates.map(async ({ date }) => {
        try {
          const puzzle = await getPuzzleForDate(date);
          return {
            date,
            puzzleId: puzzle.id,
            maxAttempts: Math.max(1, Math.min(6, puzzle.stems.length)),
          };
        } catch {
          return null;
        }
      })
    ),
  ]);
  const byPuzzle = new Map(rows.map((row) => [row.puzzleId, row]));
  return Object.fromEntries(
    puzzleMeta.flatMap((meta) => {
      if (!meta) return [];
      const row = byPuzzle.get(meta.puzzleId);
      if (!row) return [];
      return [
        [
          meta.date,
          {
            status: row.status,
            attempts: row.attempts,
            maxAttempts: meta.maxAttempts,
          },
        ],
      ];
    })
  );
}

export default async function ArchivePage() {
  const user = await currentSupabaseUser();
  if (!user) {
    return (
      <SignInGate
        eyebrow="Account required"
        title="Sign in for past challenges"
        message="Past challenge progress is saved to your Google account so replay history follows you across devices."
        nextPath="/archive"
      />
    );
  }

  const today = todayIST();
  // Today's puzzle is the daily; the archive starts at yesterday.
  const dates = (await listPlayableDates(today)).filter((d) => d.date !== today);
  const accountResults = await archiveResultsForUser(user.id, dates);

  return (
    <main className="phone-shell">
      <Link href="/" className="btn-quiet mb-4 rounded-full px-3 py-2 text-xs">
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Today&apos;s puzzle
      </Link>
      <section className="stage-panel relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-gold/20 blur-3xl" />
        <p className="tiny-label relative">Archive</p>
        <h1 className="relative mt-1 font-display text-3xl text-ink">Past challenges</h1>
        <p className="relative mt-2 text-sm leading-relaxed text-muted">
          Replay any day you missed. Archive games do not affect your daily streak.
        </p>
      </section>
      <ArchiveList dates={dates} accountResults={accountResults} />
    </main>
  );
}
