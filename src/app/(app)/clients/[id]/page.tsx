import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, Plus, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getClientDetail } from "@/lib/queries/clients";
import { ActionForm } from "@/components/forms";
import { ClientFields } from "@/components/client-fields";
import { Avatar, CardHeader, Empty, Field, Pill, priorityTone } from "@/components/ui";
import { logClientActivity, updateClient } from "@/app/actions/practice";
import { ago, CASE_STATUS_LABEL, CLIENT_TYPE_LABEL, fmtDate, PRIORITY_LABEL } from "@/lib/utils";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const d = await getClientDetail(user, id);
  if (!d) notFound();
  const { client: c } = d;
  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/clients" className="link text-[13.5px]">Clients</Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={c.name} size={56} color="#3A4A66" />
            <div>
              <h1 className="h1">{c.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-muted"><Pill>{CLIENT_TYPE_LABEL[c.type]}</Pill>{c.location}{c.clientSince && <span>· Client since {fmtDate(c.clientSince, "MMM yyyy")}</span>}</div>
            </div>
          </div>
          <div className="flex gap-2.5">
            {d.matters[0] && <Link href={`/assistant?case=${d.matters[0].id}`} className="btn btn-secondary"><Sparkles size={17} />Ask about this client</Link>}
            <Link href={`/cases/new?client=${c.id}`} className="btn btn-primary"><Plus size={18} />New matter</Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="flex flex-col gap-4">
          <section className="card overflow-hidden">
            <CardHeader title={`Matters (${d.matters.length})`} />
            {d.matters.map((m) => (
              <Link key={m.id} href={`/cases/${m.id}`} className="flex items-center gap-3 border-t border-[#eef0f3] px-5 py-3 hover:bg-sunken">
                <span className="min-w-0 flex-1"><span className="block font-semibold">{m.title}</span><span className="block text-[13px] text-muted">{m.caseNumber} · {m.practiceArea} · {m.stage}</span></span>
                <Pill tone={priorityTone(m.priority)}>{PRIORITY_LABEL[m.priority]}</Pill>
                <Pill tone={m.status === "active" ? "good" : "neutral"}>{CASE_STATUS_LABEL[m.status]}</Pill>
              </Link>
            ))}
            {d.matters.length === 0 && <Empty title="No matters you can access" />}
          </section>
          <section className="card overflow-hidden">
            <CardHeader title="Activity" />
            <form action={logClientActivity.bind(null, c.id)} className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
              <select name="action" className="input w-auto" aria-label="Type"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option></select>
              <select name="caseId" className="input w-auto max-w-[200px]" aria-label="Matter"><option value="">No matter</option>{d.matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select>
              <input name="description" className="input min-w-[200px] flex-1" placeholder="What happened?" required aria-label="Description" />
              <button className="btn btn-secondary">Log</button>
            </form>
            {d.activity.map(({ a, who }) => (
              <div key={a.id} className="flex gap-3 border-t border-[#eef0f3] px-5 py-3">
                <Pill className="capitalize">{a.action.replace("_", " ")}</Pill>
                <div className="text-[14px]"><div>{a.description}</div><div className="text-[12px] text-muted">{who ?? "System"} · {ago(a.createdAt)}</div></div>
              </div>
            ))}
            {d.activity.length === 0 && <Empty title="No activity logged" />}
          </section>
        </div>
        <div className="flex flex-col gap-4">
          <section className="card">
            <CardHeader title="Contact" />
            <div className="flex flex-col gap-2 border-t border-line px-5 py-4 text-[14px]">
              <div className="font-semibold">{c.primaryContact ?? "—"}</div>
              {c.contactTitle && <div className="text-muted">{c.contactTitle}</div>}
              {c.email && <a className="link flex items-center gap-2" href={`mailto:${c.email}`}><Mail size={15} />{c.email}</a>}
              {c.phone && <div className="flex items-center gap-2"><Phone size={15} />{c.phone}</div>}
              <div className="mt-2 text-[13px] text-muted">Billing: {c.billing ?? "—"}</div>
              <div className="text-[13px] text-muted">Conflict check: {c.conflictCheckedAt ? fmtDate(c.conflictCheckedAt, "d MMM yyyy") : <span className="font-semibold text-bad">not recorded</span>}</div>
            </div>
          </section>
          <section className="card">
            <details>
              <summary className="cursor-pointer px-5 py-4 font-display text-[17px] font-bold">Edit details</summary>
              <div className="border-t border-line px-5 py-4">
                <ActionForm action={updateClient.bind(null, c.id)} submitLabel="Save changes" resetOnSuccess={false} successText="Saved.">
                  <ClientFields c={c} />
                </ActionForm>
              </div>
            </details>
          </section>
        </div>
      </div>
    </>
  );
}
