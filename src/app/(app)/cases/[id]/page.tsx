import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, FileUp, ListPlus, Sparkles, Clock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can, DOC_STATUSES_FOR } from "@/lib/permissions";
import { getCaseDetail } from "@/lib/queries/cases";
import { getFirmUsers, jurisdictionMap } from "@/lib/queries/common";
import { ActionForm, FormDialog } from "@/components/forms";
import { EventFields, TaskFields } from "@/components/fields";
import { TaskCheck } from "@/components/task-row";
import { Avatar, CardHeader, DocIcon, Empty, Field, Pill, docStatusTone, eventTone, priorityTone } from "@/components/ui";
import { createEvent, createTask, logTime, setCaseTeam, updateCase } from "@/app/actions/practice";
import { ago, CASE_STATUS_LABEL, DOC_STATUS_LABEL, fileExt, fmtDate, fmtTime, PRIORITY_LABEL, relDay } from "@/lib/utils";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const [d, J, people] = await Promise.all([getCaseDetail(user, id), jurisdictionMap(), getFirmUsers(user.firmId)]);
  if (!d) notFound();
  const { c, client } = d;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/cases" className="link text-[13.5px]">Cases</Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="h1">{c.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-muted">
              <span className="font-mono text-[13px]">{c.caseNumber}</span>
              <span className="tag">{J[c.jurisdiction]?.short}</span>
              <Pill tone={priorityTone(c.priority)}>{PRIORITY_LABEL[c.priority]}</Pill>
              <Pill tone={c.status === "active" ? "good" : "neutral"}>{CASE_STATUS_LABEL[c.status]}</Pill>
              <span>{c.practiceArea} · {c.stage}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link href={`/assistant?case=${c.id}`} className="btn btn-primary"><Sparkles size={17} />Ask about this case</Link>
            <Link href={`/documents?case=${c.id}#upload`} className="btn btn-secondary"><FileUp size={17} />Upload</Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="flex flex-col gap-4">
          <section className="card">
            <CardHeader title="Overview" />
            <dl className="grid gap-x-6 gap-y-4 border-t border-line px-5 py-4 sm:grid-cols-2">
              {[
                ["Client", <Link key="c" href={`/clients/${client.id}`} className="link">{client.name}</Link>],
                ["Court / forum", c.court ?? "—"],
                ["Opposing party", c.opposingParty ?? "—"],
                ["Opposing counsel", c.opposingCounsel ?? "—"],
                ["Opened", fmtDate(c.openedAt, "d MMM yyyy")],
                ["Jurisdiction", J[c.jurisdiction]?.name],
              ].map(([k, v]) => (
                <div key={String(k)}><dt className="text-[12.5px] font-semibold text-muted">{k}</dt><dd className="mt-1">{v}</dd></div>
              ))}
            </dl>
            {c.description && <p className="border-t border-line px-5 py-4 leading-relaxed">{c.description}</p>}
          </section>

          <section className="card overflow-hidden">
            <CardHeader title="Upcoming">
              <FormDialog label="Add event" title="Add event" icon={<CalendarPlus size={16} />} buttonClass="btn btn-secondary btn-sm" action={createEvent} submitLabel="Add event">
                <EventFields caseId={c.id} />
              </FormDialog>
            </CardHeader>
            {d.events.map((e) => (
              <div key={e.id} className="flex items-start gap-3.5 border-t border-[#eef0f3] px-5 py-3.5">
                <Pill tone={eventTone(e.type)} className="mt-0.5 capitalize">{e.type}</Pill>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{e.title}</div>
                  <div className="text-[13px] text-muted">{[e.location, e.judge].filter(Boolean).join(" · ")}</div>
                  {e.notes && <div className="mt-1 text-[13px]">{e.notes}</div>}
                </div>
                <div className="whitespace-nowrap text-right text-[13px]"><div className="font-bold">{relDay(e.startsAt)}</div><div className="text-muted">{e.allDay ? "All day" : fmtTime(e.startsAt)}</div></div>
              </div>
            ))}
            {d.events.length === 0 && <Empty title="Nothing scheduled" />}
          </section>

          <section className="card overflow-hidden">
            <CardHeader title={`Open tasks (${d.tasks.length})`}>
              <FormDialog label="Add task" title="Add task" icon={<ListPlus size={16} />} buttonClass="btn btn-secondary btn-sm" action={createTask} submitLabel="Add task">
                <TaskFields caseId={c.id} people={people} />
              </FormDialog>
            </CardHeader>
            {d.tasks.map(({ t, assignee }) => (
              <div key={t.id} className="flex items-center gap-3.5 border-t border-[#eef0f3] px-5 py-3">
                <TaskCheck id={t.id} done={false} title={t.title} />
                <div className="min-w-0 flex-1"><div className="font-medium">{t.title}</div><div className="text-[13px] text-muted">{assignee ?? "Unassigned"}</div></div>
                <Pill tone={priorityTone(t.priority)}>{PRIORITY_LABEL[t.priority]}</Pill>
                <span className={`w-24 text-right text-[13px] font-semibold ${t.dueAt && t.dueAt < new Date() ? "text-bad" : ""}`}>{t.dueAt ? relDay(t.dueAt) : "No date"}</span>
              </div>
            ))}
            {d.tasks.length === 0 && <Empty title="No open tasks" />}
          </section>

          <section className="card overflow-hidden">
            <CardHeader title={`Documents (${d.documents.length})`} href={`/documents?case=${c.id}`} linkLabel="Open in documents" />
            {d.documents.map((doc) => (
              <Link key={doc.id} href={`/documents/${doc.id}`} className="flex items-center gap-3.5 border-t border-[#eef0f3] px-5 py-3 hover:bg-sunken">
                <DocIcon ext={fileExt(doc.title, doc.mimeType)} />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{doc.title}</span><span className="block text-[13px] text-muted">{doc.kind} · v{doc.version} · {ago(doc.updatedAt)}</span></span>
                <Pill tone={docStatusTone(doc.status)}>{DOC_STATUS_LABEL[doc.status]}</Pill>
              </Link>
            ))}
            {d.documents.length === 0 && <Empty title="No documents on this matter yet" />}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="card">
            <CardHeader title="Matter status" />
            <div className="border-t border-line px-5 py-4">
              <ActionForm action={updateCase.bind(null, c.id)} submitLabel="Save" resetOnSuccess={false} successText="Saved.">
                <Field label="Stage"><input className="input" name="stage" defaultValue={c.stage} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Priority"><select className="input" name="priority" defaultValue={c.priority}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field>
                  {can(user, "matters.status")
                    ? <Field label="Status"><select className="input" name="status" defaultValue={c.status}><option value="active">Active</option><option value="on_hold">On hold</option><option value="closed">Closed</option></select></Field>
                    : <Field label="Status"><input type="hidden" name="status" value={c.status} /><span className="input flex items-center bg-sunken">{CASE_STATUS_LABEL[c.status]}</span></Field>}
                </div>
                <Field label="Court / forum"><input className="input" name="court" defaultValue={c.court ?? ""} /></Field>
                <input type="hidden" name="description" value={c.description ?? ""} />
              </ActionForm>
            </div>
          </section>

          <section className="card">
            <CardHeader title="Team" />
            <ul className="border-t border-line">
              {d.team.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Avatar name={t.name} color={t.color} size={32} />
                  <span className="flex-1"><span className="block font-semibold">{t.name}</span><span className="block text-[12.5px] text-muted">{t.title}</span></span>
                  {t.role === "lead" && <Pill tone="hearing">Lead</Pill>}
                </li>
              ))}
            </ul>
            {can(user, "matters.team") && <details className="border-t border-line px-5 py-3">
              <summary className="link cursor-pointer text-[13.5px]">Change team</summary>
              <form action={setCaseTeam.bind(null, c.id)} className="mt-3 flex flex-col gap-2">
                {people.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-[14px]">
                    <input type="checkbox" name="team" value={p.id} defaultChecked={d.team.some((t) => t.id === p.id)} className="h-4 w-4 accent-[#2b44d6]" />
                    {p.name}
                    <input type="radio" name="lead" value={p.id} defaultChecked={d.team.find((t) => t.role === "lead")?.id === p.id} className="ml-auto" aria-label={`${p.name} is lead`} />
                  </label>
                ))}
                <p className="text-[12px] text-muted">Radio button marks the lead. Only staffed people (and admins) can open this matter.</p>
                <button className="btn btn-secondary btn-sm self-start">Save team</button>
              </form>
            </details>}
          </section>

          <section className="card">
            <CardHeader title="Log time" />
            <div className="border-t border-line px-5 py-4">
              <ActionForm action={logTime} submitLabel="Log time" successText="Time logged.">
                <input type="hidden" name="caseId" value={c.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date"><input className="input" type="date" name="date" defaultValue={today} required /></Field>
                  <Field label="Hours"><input className="input" type="number" name="hours" step="0.1" min="0.1" max="24" required /></Field>
                </div>
                <Field label="Description"><input className="input" name="description" placeholder="What you worked on" /></Field>
                <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="billable" defaultChecked className="h-4 w-4 accent-[#2b44d6]" />Billable</label>
              </ActionForm>
            </div>
          </section>

          <section className="card overflow-hidden">
            <CardHeader title="Activity" />
            {d.activity.map(({ a, who }) => (
              <div key={a.id} className="flex gap-3 border-t border-[#eef0f3] px-5 py-3">
                <Clock size={15} className="mt-1 shrink-0 text-subtle" />
                <div className="text-[13.5px]"><div>{a.description}</div><div className="text-[12px] text-muted">{who ?? "System"} · {ago(a.createdAt)}</div></div>
              </div>
            ))}
            {d.activity.length === 0 && <Empty title="No activity yet" />}
          </section>
        </div>
      </div>
    </>
  );
}
