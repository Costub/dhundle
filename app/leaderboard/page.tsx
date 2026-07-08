import Link from "next/link";
import Leaderboard from "@/components/Leaderboard";
import SignInGate from "@/components/SignInGate";
import { ArrowLeftIcon } from "@/components/icons";
import { currentSupabaseUser } from "@/lib/adminAuth";
import { EPOCH_DATE, todayIST } from "@/lib/day";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leaderboard — Dhoondle",
  description: "Daily and all-time Dhoondle standings.",
};

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const today = todayIST();
  const validDate =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= EPOCH_DATE && date <= today && date !== today
      ? date
      : undefined;
  const nextPath = validDate ? `/leaderboard?date=${encodeURIComponent(validDate)}` : "/leaderboard";
  const user = await currentSupabaseUser();

  if (!user) {
    return (
      <SignInGate
        eyebrow="Account required"
        title="Sign in for the leaderboard"
        message="Leaderboard standings are tied to your Google account so your scores follow you across devices."
        nextPath={nextPath}
      />
    );
  }

  return (
    <main className="phone-shell">
      <Link
        href="/"
        className="btn-quiet mb-4 rounded-full px-3 py-2 text-xs"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Today&apos;s puzzle
      </Link>
      <section className="stage-panel relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-rose-glow/18 blur-3xl" />
        <p className="tiny-label relative">Standings</p>
        <h1 className="relative mt-1 font-display text-3xl text-ink">Leaderboard</h1>
        <p className="relative mt-2 text-sm leading-relaxed text-muted">
          Ranked by wins, then fewest guesses and hints.
        </p>
      </section>
      <Leaderboard initialDate={validDate} />
    </main>
  );
}
