"use client";
import { useActionState } from "react";

type Action = (state: unknown, form: FormData) => Promise<{ error?: string } | undefined>;

export function InviteForm({ action }: { action: Action }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="flex flex-col gap-4">
      <label className="label">
        Password
        <input className="input" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="label">
        Confirm password
        <input className="input" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      <p className="text-[13px] text-muted">At least 10 characters.</p>
      {state?.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13.5px] text-bad">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Set password and sign in"}</button>
    </form>
  );
}
