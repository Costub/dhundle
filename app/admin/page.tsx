import Link from "next/link";
import AdminDashboard from "@/components/admin/AdminDashboard";
import { isAdmin } from "@/lib/adminAuth";
import { getAllSongs } from "@/lib/catalog";
import { todayIST } from "@/lib/day";
import { listScheduledPuzzles } from "@/lib/puzzles";
import { isSupabaseConfigured } from "@/lib/supabase";

function MissingAccess({ error }: { error?: string }) {
  return (
    <main className="wide-shell max-w-xl">
      <Link href="/" className="tiny-label">
        Dhoondle
      </Link>
      <section className="stage-panel mt-5 p-6">
        <p className="tiny-label">Restricted console</p>
        <h1 className="mt-2 font-display text-3xl text-ink">Admin access</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Sign in with an approved Supabase account, or use the local admin secret
          while setting up production credentials.
        </p>
        {error && (
          <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </section>
      <div className="mt-4 grid gap-3">
        <a
          href="/api/auth/sign-in?provider=google&next=%2Fadmin"
          className="btn-primary"
        >
          Sign in with Google
        </a>
        <form action="/api/admin/unlock" method="post" className="grid gap-2">
          <input
            name="secret"
            type="password"
            placeholder="ADMIN_SECRET"
            className="input-field"
          />
          <button className="btn-quiet py-3">
            Unlock locally
          </button>
        </form>
      </div>
    </main>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  if (!(await isAdmin())) {
    return <MissingAccess error={params.error} />;
  }

  const [songs, puzzles] = await Promise.all([getAllSongs(), listScheduledPuzzles(60)]);

  return (
    <main className="wide-shell">
      <header className="stage-panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <Link href="/" className="tiny-label">
            Dhoondle
          </Link>
          <h1 className="mt-2 font-display text-3xl text-ink">Admin</h1>
        </div>
        <form action="/api/auth/sign-out" method="post">
          <input type="hidden" name="next" value="/admin" />
          <button className="btn-quiet">
            Sign out
          </button>
        </form>
      </header>

      <AdminDashboard
        songs={songs}
        puzzles={puzzles}
        today={todayIST()}
        supabaseReady={isSupabaseConfigured()}
      />
    </main>
  );
}
