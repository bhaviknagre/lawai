import { Building2 } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { getJurisdictions } from "@/lib/queries/common";
import { listFirms } from "@/lib/onboarding";
import { createFirm, createFirmAdmin, restoreFirm, suspendFirm } from "@/app/actions/platform";
import { ActionForm, ConfirmButton } from "@/components/forms";
import { InviteForm } from "@/components/invite-link";
import { Field, PageHeader, Pill } from "@/components/ui";
import { cn, fmtDate } from "@/lib/utils";

export const metadata = { title: "Platform" };

/** LawAI operator console: onboard customer firms and their admins. Firm admins then invite their own people in Settings → Team. */
export default async function PlatformPage() {
  await requirePlatformAdmin();
  const [firms, jur] = await Promise.all([listFirms(), getJurisdictions()]);

  return (
    <>
      <PageHeader title="Platform" sub="Onboard law firms and their admins. Each admin then invites associates and paralegals under Settings → Team." />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <section className="card p-5">
          <h2 className="h2 mb-3">Firms ({firms.length})</h2>
          <ul className="flex flex-col">
            {firms.map((f) => (
              <li key={f.id} className={cn("border-t border-line py-3", f.suspendedAt && "bg-bad-soft/40")}>
                <div className="flex flex-wrap items-center gap-2">
                  <Building2 size={16} className="text-subtle" aria-hidden />
                  <span className="font-semibold">{f.name}</span>
                  <span className="text-[13px] text-muted">{f.slug} · since {fmtDate(f.createdAt, "d MMM yyyy")}</span>
                  {f.suspendedAt ? <Pill tone="bad" className="ml-auto">Suspended</Pill> : <Pill tone="good" className="ml-auto">Active</Pill>}
                  <Pill>{f.activeUsers} users</Pill>
                  {f.pendingInvites > 0 && <Pill tone="mid">{f.pendingInvites} invite{f.pendingInvites > 1 ? "s" : ""} pending</Pill>}
                </div>
                <div className="mt-1.5 text-[13.5px] text-muted">
                  Admins:{" "}
                  {f.admins.map((a) => `${a.name} (${a.email})${a.deactivatedAt ? " · deactivated" : !a.activatedAt ? " · invited" : ""}`).join(", ") || "none"}
                </div>
                {f.suspendedAt && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[13.5px] text-bad">
                    <span>Service stopped {fmtDate(f.suspendedAt, "d MMM yyyy, HH:mm")}{f.suspendedReason ? ` · ${f.suspendedReason}` : ""}. Nobody in this firm can sign in.</span>
                    <ConfirmButton onConfirm={restoreFirm.bind(null, f.id)} message={`Restore service for ${f.name}? Everyone can sign in again.`} className="btn btn-secondary btn-sm">Restore service</ConfirmButton>
                  </div>
                )}
                {!f.suspendedAt && !f.slug.startsWith("lawai-ops") && (
                  <details className="mt-1.5">
                    <summary className="link cursor-pointer text-[13.5px] text-bad">Stop service</summary>
                    <div className="mt-3">
                      <ActionForm action={suspendFirm.bind(null, f.id)} submitLabel="Stop service now" resetOnSuccess={false}>
                        <p className="text-[13.5px] text-muted">Everyone at {f.name} is signed out at once and can&apos;t sign in until you restore service. Their data is kept.</p>
                        <Field label="Reason (only you see this)"><input className="input" name="reason" placeholder="e.g. Invoice #1042 unpaid" maxLength={200} /></Field>
                      </ActionForm>
                    </div>
                  </details>
                )}
                <details className="mt-1.5">
                  <summary className="link cursor-pointer text-[13.5px]">Add an admin</summary>
                  <div className="mt-3">
                    <InviteForm action={createFirmAdmin.bind(null, f.id)} submitLabel="Invite admin">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Full name"><input className="input" name="name" required /></Field>
                        <Field label="Work email"><input className="input" name="email" type="email" required /></Field>
                        <Field label="Job title"><input className="input" name="title" placeholder="Senior Attorney" /></Field>
                      </div>
                    </InviteForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="h2">Onboard a new firm</h2>
          <p className="mb-4 text-[13.5px] text-muted">Creates the firm and its first admin together. You get an invite link to send the admin; they choose their own password.</p>
          <InviteForm action={createFirm} submitLabel="Create firm and invite admin">
            <Field label="Firm name"><input className="input" name="firmName" required placeholder="Patel & Associates" /></Field>
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold">Jurisdictions</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {jur.map((j) => <label key={j.code} className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="jurisdictions" value={j.code} className="h-4 w-4 accent-[#2b44d6]" />{j.name}</label>)}
              </div>
            </fieldset>
            <h3 className="font-semibold">First admin (senior attorney)</h3>
            <Field label="Full name"><input className="input" name="name" required /></Field>
            <Field label="Work email"><input className="input" name="email" type="email" required /></Field>
            <Field label="Job title"><input className="input" name="title" placeholder="Senior Attorney" /></Field>
          </InviteForm>
        </section>
      </div>
    </>
  );
}
