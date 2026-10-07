import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { getFirmPeople, getFirmStats } from "@/lib/platform-stats";
import { createFirmAdmin, resendAdminInvite, restoreFirm, suspendFirm, updateSubscription } from "@/app/actions/platform";
import { ActionForm, ConfirmButton } from "@/components/forms";
import { InviteForm, LinkButton } from "@/components/invite-link";
import { PlanPill, RenewButtons, RenewalPill, Seats, Stat, SubscriptionFields } from "@/components/platform";
import { Avatar, Field, PageHeader, Pill } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/accounts";
import { money } from "@/lib/subscriptions";
import { ago, fmtDate } from "@/lib/utils";

export const metadata = { title: "Firm" };

/** One customer firm: subscription, seats, team make-up, usage and account controls. */
export default async function FirmPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const f = (await getFirmStats()).find((x) => x.id === id);
  if (!f) notFound();
  const people = await getFirmPeople(f.id);

  return (
    <>
      <PageHeader
        title={f.name}
        sub={<>{f.slug} · customer since {fmtDate(f.createdAt, "d MMM yyyy")} · {f.lastActiveAt ? `last active ${ago(f.lastActiveAt)}` : "never active"}</>}
      >
        <PlanPill plan={f.plan} />
        <RenewalPill r={f.renewal} />
        <Link href="/platform/firms" className="btn btn-secondary">All firms</Link>
      </PageHeader>

      {f.suspendedAt && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-bad-soft px-5 py-3.5 text-[14px] text-bad">
          <span>Service stopped {fmtDate(f.suspendedAt, "d MMM yyyy, HH:mm")}{f.suspendedReason ? ` · ${f.suspendedReason}` : ""}. Nobody in this firm can sign in.</span>
          <ConfirmButton onConfirm={restoreFirm.bind(null, f.id)} message={`Restore service for ${f.name}? Everyone can sign in again.`} className="btn btn-secondary btn-sm">Restore service</ConfirmButton>
        </div>
      )}

      <section className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
        <Stat label="Seats used" value={<Seats used={f.seatsUsed} limit={f.seatLimit} />} sub={f.pendingInvites ? `${f.pendingInvites} still to accept their invite` : "Active and invited people"} />
        <Stat label="Admins" value={f.team.admins} />
        <Stat label="Associates" value={f.team.associates} />
        <Stat label="Paralegals" value={f.team.paralegals} />
        <Stat label="Clients" value={f.clients} />
        <Stat label="Cases" value={f.openCases} sub={`open · ${f.totalCases} total`} />
        <Stat label="Documents" value={f.documents} />
        <Stat label="AI actions, 30 days" value={f.aiActions30d.toLocaleString()} sub={`${f.aiTokens30d.toLocaleString()} tokens`} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="card overflow-hidden">
          <div className="px-5 py-4">
            <h2 className="h2">People ({people.length})</h2>
            <p className="text-[13px] text-muted">The firm&apos;s admins invite and manage everyone else under Settings → Team.</p>
          </div>
          {people.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-[14px]">
              <Avatar name={p.name} color={p.color} size={32} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{p.name}</div>
                <div className="truncate text-[12.5px] text-muted">{p.email} · {p.title}</div>
              </div>
              <Pill tone={p.role === "admin" ? "hearing" : "neutral"}>{ROLE_LABELS[p.role]}</Pill>
              {p.deactivatedAt ? <Pill tone="bad">Deactivated</Pill> : p.activatedAt ? <Pill tone="good">Active</Pill> : <Pill tone="mid">Invited</Pill>}
              {p.role === "admin" && !p.deactivatedAt && !p.activatedAt && (
                <LinkButton action={resendAdminInvite.bind(null, p.id)} label="New invite link" confirmText={`Create a new invite link for ${p.name}? Their previous link will stop working.`} />
              )}
            </div>
          ))}
          <details className="border-t border-line px-5 py-3">
            <summary className="link cursor-pointer text-[14px]">Add an admin</summary>
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
        </section>

        <div className="flex flex-col gap-4">
          <section className="card p-5">
            <h2 className="h2">Subscription</h2>
            <p className="mb-3 text-[13px] text-muted">
              {f.monthlyFee ? `${money(f.monthlyFee)} a month` : "No fee"} · {f.subscriptionEndsAt ? `ends ${fmtDate(f.subscriptionEndsAt, "d MMM yyyy")}` : "no end date"}
            </p>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-[13.5px]">
              <span className="text-muted">Renew:</span>
              <RenewButtons firmId={f.id} name={f.name} />
            </div>
            <ActionForm action={updateSubscription.bind(null, f.id)} submitLabel="Save subscription" resetOnSuccess={false} successText="Saved.">
              <SubscriptionFields plan={f.plan} seatLimit={f.seatLimit} monthlyFee={f.monthlyFee} endsAt={f.subscriptionEndsAt} />
            </ActionForm>
          </section>

          {!f.suspendedAt && (
            <section className="card p-5">
              <h2 className="h2">Stop service</h2>
              <p className="mb-3 text-[13.5px] text-muted">Everyone at {f.name} is signed out at once and can&apos;t sign in until you restore service. Their data is kept.</p>
              <ActionForm action={suspendFirm.bind(null, f.id)} submitLabel="Stop service now" resetOnSuccess={false}>
                <Field label="Reason (only you see this)"><input className="input" name="reason" placeholder="e.g. Invoice #1042 unpaid" maxLength={200} /></Field>
              </ActionForm>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
