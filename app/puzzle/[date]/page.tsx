import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Game from "@/components/Game";
import SignInGate from "@/components/SignInGate";
import { ArrowLeftIcon } from "@/components/icons";
import { currentSupabaseUser } from "@/lib/adminAuth";
import { EPOCH_DATE, todayIST } from "@/lib/day";

export const dynamic = "force-dynamic";

export default async function ArchivePuzzlePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const today = todayIST();
  if (date === today) redirect("/"); // today's puzzle is the daily, not archive
  if (date > today || date < EPOCH_DATE) notFound();
  const user = await currentSupabaseUser();

  if (!user) {
    return (
      <SignInGate
        eyebrow="Account required"
        title="Sign in for past challenges"
        message="Past challenge results are saved to your Google account so archive progress is not locked to this device."
        nextPath={`/puzzle/${date}`}
      />
    );
  }

  return (
    <main className="phone-shell">
      <Link
        href="/archive"
        className="btn-quiet mb-4 rounded-full px-3 py-2 text-xs"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        All past challenges
      </Link>
      <Game archiveDate={date} />
    </main>
  );
}
