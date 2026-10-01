"use client";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="label">
        Work email
        <input className="input" name="email" type="email" autoComplete="email" required defaultValue="john@demo.law" />
      </label>
      <label className="label">
        Password
        <input className="input" name="password" type="password" autoComplete="current-password" required defaultValue="demo1234" />
      </label>
      {state?.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13.5px] text-bad">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
