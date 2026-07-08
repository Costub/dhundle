import Link from "next/link";
import { signInPath } from "@/lib/adminAuth";

interface SignInGateProps {
  eyebrow: string;
  title: string;
  message: string;
  nextPath: string;
}

export default function SignInGate({ eyebrow, title, message, nextPath }: SignInGateProps) {
  return (
    <main className="phone-shell">
      <Link href="/" className="tiny-label">
        Dhoondle
      </Link>
      <section className="stage-panel mt-5 overflow-hidden p-6">
        <p className="tiny-label">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl text-ink">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{message}</p>
        <a href={signInPath(nextPath)} className="btn-primary mt-5 w-full">
          Sign in with Google
        </a>
      </section>
    </main>
  );
}
