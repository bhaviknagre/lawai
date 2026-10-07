import Link from "next/link";
import { addDays } from "date-fns";
import { requirePlatformAdmin } from "@/lib/auth";
import { getJurisdictions } from "@/lib/queries/common";
import { createFirm } from "@/app/actions/platform";
import { InviteForm } from "@/components/invite-link";
import { SubscriptionFields } from "@/components/platform";
import { Field, PageHeader } from "@/components/ui";
import { PLANS, TRIAL_DAYS } from "@/lib/subscriptions";

export const metadata = { title: "Onboard a firm" };

export default async function NewFirmPage() {
  await requirePlatformAdmin();
  const jur = await getJurisdictions();
  return (
    <>
      <PageHeader title="Onboard a firm" sub="Creates the firm and its first admin together. You get an invite link to send the admin; they choose their own password and then invite associates and paralegals under Settings → Team.">
        <Link href="/platform/firms" className="btn btn-secondary">Back to firms</Link>
      </PageHeader>
      <section className="card max-w-[760px] p-5">
        <InviteForm action={createFirm} submitLabel="Create firm and invite admin">
          <h2 className="h2">Firm</h2>
          <Field label="Firm name"><input className="input" name="firmName" required placeholder="Patel & Associates" /></Field>
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold">Jurisdictions</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {jur.map((j) => <label key={j.code} className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="jurisdictions" value={j.code} className="h-4 w-4 accent-[#2b44d6]" />{j.name}</label>)}
            </div>
          </fieldset>
          <h2 className="h2 mt-2">Subscription</h2>
          <p className="-mt-2 text-[13px] text-muted">Starts as a {TRIAL_DAYS}-day trial unless you change it. You get a reminder before it ends.</p>
          <SubscriptionFields plan="trial" seatLimit={PLANS.trial.defaultSeats} endsAt={addDays(new Date(), TRIAL_DAYS)} />
          <h2 className="h2 mt-2">First admin (senior attorney)</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Full name"><input className="input" name="name" required /></Field>
            <Field label="Work email"><input className="input" name="email" type="email" required /></Field>
            <Field label="Job title"><input className="input" name="title" placeholder="Senior Attorney" /></Field>
          </div>
        </InviteForm>
      </section>
    </>
  );
}
