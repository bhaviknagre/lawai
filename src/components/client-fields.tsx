import type { Client } from "@/db/schema";
import { Field } from "./ui";

export function ClientFields({ c }: { c?: Client }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><input className="input" name="name" required defaultValue={c?.name} /></Field>
        <Field label="Type">
          <select className="input" name="type" defaultValue={c?.type ?? "company"}><option value="company">Company</option><option value="individual">Individual</option><option value="trust">Trust</option><option value="estate">Estate</option></select>
        </Field>
        <Field label="Primary contact"><input className="input" name="primaryContact" defaultValue={c?.primaryContact ?? ""} /></Field>
        <Field label="Contact's role"><input className="input" name="contactTitle" defaultValue={c?.contactTitle ?? ""} /></Field>
        <Field label="Email"><input className="input" type="email" name="email" defaultValue={c?.email ?? ""} /></Field>
        <Field label="Phone"><input className="input" name="phone" defaultValue={c?.phone ?? ""} /></Field>
        <Field label="Location"><input className="input" name="location" defaultValue={c?.location ?? ""} placeholder="City, country" /></Field>
        <Field label="Billing"><input className="input" name="billing" defaultValue={c?.billing ?? ""} placeholder="e.g. Hourly · monthly invoice" /></Field>
      </div>
      <Field label="Notes"><textarea className="input" name="notes" rows={3} defaultValue={c?.notes ?? ""} /></Field>
    </>
  );
}
