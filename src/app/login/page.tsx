import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v18M7 21h10M3 7h18M6 7l-3 7a3 3 0 006 0zM18 7l-3 7a3 3 0 006 0z" /></svg>
          </span>
          <span className="font-display text-[21px] font-extrabold">LawAI</span>
        </div>
        <div className="max-w-lg">
          <p className="font-display text-[40px] font-bold leading-[1.1] tracking-[-0.02em]">Ask your practice anything.</p>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-text">
            Hearings, deadlines, contracts and case law in one workspace, with an assistant that answers from your own matters and cites every source.
          </p>
        </div>
        <p className="text-[13px] text-ink-muted">Demo workspace · all clients and matters are fictional</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="h1">Sign in</h1>
          <p className="mb-6 mt-2 text-muted">Demo accounts: john@, aisha@, sam@demo.law · password demo1234</p>
          <LoginForm next={next} />
        </div>
      </section>
    </main>
  );
}
