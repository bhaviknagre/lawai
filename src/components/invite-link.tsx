"use client";
import { useActionState, useRef, useState } from "react";
import { Copy } from "lucide-react";
import type { LinkState } from "@/lib/accounts";
import { cn } from "@/lib/utils";

type Link = NonNullable<NonNullable<LinkState>["link"]>;

/** A one-time link to pass on. Only its hash is stored, so this is the only time it's visible. */
export function LinkCard({ link }: { link: Link }) {
  const [copied, setCopied] = useState(false);
  const expires = new Date(link.expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const invite = link.kind === "invite";
  const message = invite
    ? `Hi ${link.name.split(" ")[0]},\n\nYou've been invited to LawAI. Open this link to choose your password and sign in (it works once, until ${expires}):\n${link.url}\n\nSign in afterwards with ${link.email}.`
    : `Hi ${link.name.split(" ")[0]},\n\nUse this link to choose a new LawAI password (it works once, until ${expires}):\n${link.url}`;
  return (
    <div role="status" className="rounded-lg border border-line bg-good-soft px-3.5 py-3 text-[13.5px]">
      <p className="font-semibold text-good">{invite ? `Invite ready for ${link.name}` : `Reset link ready for ${link.name}`}</p>
      {link.emailed
        ? <p className="mt-1 text-good">Emailed to {link.email}. You don&apos;t need to do anything else.</p>
        : <p className="mt-1 text-bad">Not emailed{link.emailNote ? ` (${link.emailNote})` : ""}. Copy the message below and send it yourself.</p>}
      <p className="mt-1.5 break-all font-mono text-[12.5px]">{link.url}</p>
      <p className="mt-1.5 text-muted">
        Works once, until {expires}. {link.emailed ? "Backup copy, in case the email doesn't arrive:" : "Copy it now: it won't be shown again."} {invite ? "They choose their own password; nobody else ever sees it." : "Their old password has stopped working."}
      </p>
      <button type="button" className="btn btn-secondary mt-2.5" onClick={() => navigator.clipboard.writeText(message).then(() => setCopied(true))}>
        <Copy size={15} /> {copied ? "Copied" : "Copy message with link"}
      </button>
    </div>
  );
}

/** Form for an action that creates an account and hands back its invite link. */
export function InviteForm({ action, children, submitLabel, className }: {
  action: (state: LinkState, form: FormData) => Promise<LinkState>; children: React.ReactNode; submitLabel: string; className?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState(async (prev: LinkState, form: FormData) => {
    const next = await action(prev, form);
    if (next?.ok) ref.current?.reset();
    return next;
  }, null);
  return (
    <form ref={ref} action={run} className={cn("flex flex-col gap-4", className)}>
      {children}
      {state?.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13.5px] text-bad">{state.error}</p>}
      {state?.link && <LinkCard link={state.link} />}
      <div><button className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : submitLabel}</button></div>
    </form>
  );
}

/** Button that issues a fresh link for an existing person (resend invite, reset password). */
export function LinkButton({ action, label, confirmText, icon }: {
  action: (state: LinkState) => Promise<LinkState>; label: string; confirmText: string; icon?: React.ReactNode;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <div className="flex flex-col gap-2">
      <form action={run} onSubmit={(e) => { if (!confirm(confirmText)) e.preventDefault(); }}>
        <button className="btn btn-secondary" disabled={pending}>{icon}{pending ? "Working…" : label}</button>
      </form>
      {state?.error && <p role="alert" className="text-[13px] text-bad">{state.error}</p>}
      {state?.link && <LinkCard link={state.link} />}
    </div>
  );
}
