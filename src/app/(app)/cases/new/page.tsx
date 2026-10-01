import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { clientOptions } from "@/lib/queries/cases";
import { getFirmUsers, getJurisdictions } from "@/lib/queries/common";
import { ActionForm } from "@/components/forms";
import { createCase } from "@/app/actions/practice";
import { Field, PageHeader } from "@/components/ui";

export const metadata = { title: "New case" };
const AREAS = ["Litigation", "Arbitration", "Corporate", "Employment", "Intellectual property", "Probate & estates", "Real estate", "Regulatory", "Tax"];

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  const user = await requireUser();
  const [clients, jur, people] = await Promise.all([clientOptions(user), getJurisdictions(), getFirmUsers(user.firmId)]);
  return (
    <>
      <PageHeader title="New case" sub="Open a matter. You'll be added as lead; pick the rest of the team below." />
      <div className="card max-w-3xl p-6">
        {clients.length === 0 ? (
          <p>Add a client first. <Link className="link" href="/clients/new">New client</Link></p>
        ) : (
          <ActionForm action={createCase} submitLabel="Create case" resetOnSuccess={false}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Case title"><input className="input" name="title" required placeholder="e.g. Smith v. Johnson Corp" /></Field>
              <Field label="Client">
                <select className="input" name="clientId" defaultValue={client ?? ""} required>
                  <option value="" disabled>Choose…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Practice area">
                <select className="input" name="practiceArea" required>{AREAS.map((a) => <option key={a}>{a}</option>)}</select>
              </Field>
              <Field label="Jurisdiction">
                <select className="input" name="jurisdiction" defaultValue={user.firmJurisdictions[0]}>{jur.map((j) => <option key={j.code} value={j.code}>{j.name}</option>)}</select>
              </Field>
              <Field label="Court or forum"><input className="input" name="court" placeholder="Optional" /></Field>
              <Field label="Case number" hint="Leave blank to generate one"><input className="input" name="caseNumber" /></Field>
              <Field label="Stage"><input className="input" name="stage" defaultValue="Intake" /></Field>
              <Field label="Priority">
                <select className="input" name="priority" defaultValue="medium"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
              </Field>
              <Field label="Opposing party"><input className="input" name="opposingParty" /></Field>
              <Field label="Opposing counsel"><input className="input" name="opposingCounsel" /></Field>
            </div>
            <Field label="Summary"><textarea className="input" name="description" rows={3} placeholder="What the matter is about" /></Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-semibold">Team</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {people.filter((p) => p.id !== user.id).map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="team" value={p.id} className="h-4 w-4 accent-[#2b44d6]" />{p.name} <span className="text-muted">· {p.title}</span></label>
                ))}
              </div>
            </fieldset>
          </ActionForm>
        )}
      </div>
    </>
  );
}
