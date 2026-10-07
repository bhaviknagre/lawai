import Link from "next/link";
import { format } from "date-fns";
import { AlertTriangle, Briefcase, Clock, FileUp, Plus, Send, Sparkles, Users, Gavel, CalendarClock, FileText, CheckSquare } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can, DOC_STATUSES_FOR } from "@/lib/permissions";
import { getDashboard } from "@/lib/queries/dashboard";
import { jurisdictionMap } from "@/lib/queries/common";
import { CardHeader, DocIcon, Empty, Pill, priorityTone, docStatusTone } from "@/components/ui";
import { ago, DOC_STATUS_LABEL, fileExt, fmtTime, PRIORITY_LABEL, relDay } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

const KPI_ICON = { briefcase: Briefcase, clock: Clock, users: Users, alert: AlertTriangle } as const;
const AGENDA_ICON = { hearing: Gavel, deadline: CalendarClock, meeting: Users, internal: CalendarClock, task: CheckSquare } as const;
const AGENDA_TONE = {
  hearing: "bg-hearing-soft text-hearing",
  deadline: "bg-bad-soft text-bad",
  meeting: "bg-good-soft text-good",
  internal: "bg-chip text-chip-text",
  task: "bg-chip text-chip-text",
} as const;

const PROMPTS = ["When is my next hearing?", "What's due this week?", "What does the Johnson Corp agreement say about liability?", "Summarise Smith v. Johnson Corp"];

export default async function Dashboard() {
  const user = await requireUser();
  const [d, J] = await Promise.all([getDashboard(user), jurisdictionMap()]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="font-medium text-muted">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
          <h1 className="h1">{greeting}, {user.name.split(" ")[0]}</h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/documents" className="btn btn-secondary"><FileUp size={18} />Upload document</Link>
          {can(user, "matters.create") && <Link href="/cases/new" className="btn btn-secondary"><Plus size={18} />New case</Link>}
        </div>
      </div>

      <section aria-labelledby="ask-h" className="flex flex-col gap-4 rounded-2xl bg-ink p-6 text-white">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <Sparkles size={22} className="text-accent-ink" aria-hidden />
          <h2 id="ask-h" className="h2 text-[19px] text-white">Ask LawAI</h2>
          <span className="text-[13.5px] text-[#a9b4c8]">Answers from your matters, calendar, documents and research library, with sources</span>
        </div>
        <form action="/assistant" className="flex flex-wrap gap-2.5">
          <label htmlFor="ask" className="sr-only">Ask LawAI a question</label>
          <input id="ask" name="q" required placeholder="e.g. When is my next hearing?" className="h-[52px] min-w-[240px] flex-1 rounded-xl border border-ink-line bg-ink-2 px-4 text-[15px] text-white placeholder:text-ink-muted" />
          <button className="btn btn-primary h-[52px] px-6"><Send size={17} />Ask</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {PROMPTS.map((p) => (
            <Link key={p} href={`/assistant?q=${encodeURIComponent(p)}`} className="inline-flex min-h-9 items-center rounded-full border border-ink-line px-3.5 text-[13.5px] font-medium text-[#dce3ef] hover:bg-ink-2">
              {p}
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Key figures" className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
        {d.kpis.map((k) => {
          const Icon = KPI_ICON[k.icon as keyof typeof KPI_ICON];
          return (
            <Link key={k.label} href={k.href} className="card flex flex-col gap-3.5 p-5 hover:border-line-strong">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-muted">{k.label}</span>
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-chip text-chip-text"><Icon size={18} aria-hidden /></span>
              </div>
              <div className="font-display text-[36px] font-bold leading-none">{k.value}</div>
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Pill tone={k.tone}>{k.delta > 0 ? "↑" : k.delta < 0 ? "↓" : "–"} {Math.abs(k.delta)}</Pill>
                <span className="text-muted">{k.note}</span>
              </div>
            </Link>
          );
        })}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card overflow-hidden">
          <CardHeader title="Active cases" href="/cases" linkLabel="View all cases" />
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="th grid grid-cols-[minmax(200px,2.2fr)_96px_92px_minmax(140px,1.2fr)] gap-3 border-t border-line bg-sunken px-5 py-2.5">
                <span>Case</span><span>Jurisdiction</span><span>Priority</span><span>Next event</span>
              </div>
              {d.recentCases.map(({ c, nextAt }) => (
                <div key={c.id} className="grid grid-cols-[minmax(200px,2.2fr)_96px_92px_minmax(140px,1.2fr)] items-center gap-3 border-t border-[#eef0f3] px-5 py-3.5">
                  <div className="min-w-0">
                    <Link href={`/cases/${c.id}`} className="font-semibold hover:underline">{c.title}</Link>
                    <div className="mt-0.5 text-[13px] text-muted">{c.practiceArea} · {c.stage}</div>
                  </div>
                  <div><span className="tag">{J[c.jurisdiction]?.short ?? c.jurisdiction}</span></div>
                  <div><Pill tone={priorityTone(c.priority)}>{PRIORITY_LABEL[c.priority]}</Pill></div>
                  <div className="text-[14px] font-semibold">{nextAt ? `${relDay(nextAt)} · ${fmtTime(nextAt)}` : <span className="font-normal text-muted">Nothing scheduled</span>}</div>
                </div>
              ))}
              {d.recentCases.length === 0 && <Empty title="No active cases">Create a case to start tracking hearings, tasks and documents.</Empty>}
            </div>
          </div>
        </section>

        <section className="card overflow-hidden">
          <CardHeader title="Next 14 days" href="/tasks" linkLabel="Open calendar" />
          <ul>
            {d.agenda.map((a) => {
              const Icon = AGENDA_ICON[a.kind as keyof typeof AGENDA_ICON];
              const soon = new Date(a.at).getTime() - Date.now() < 2 * 864e5;
              return (
                <li key={a.id}>
                  <Link href={a.href} className="flex items-start gap-3.5 border-t border-[#eef0f3] px-5 py-3.5 hover:bg-sunken">
                    <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] ${AGENDA_TONE[a.kind as keyof typeof AGENDA_TONE]}`}><Icon size={18} aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{a.title}</span>
                      <span className="mt-0.5 block text-[13px] text-muted">{a.matter ?? "Firm"}{a.kind === "task" ? " · task" : ""}</span>
                    </span>
                    <span className="whitespace-nowrap text-right text-[13px]">
                      <span className={`block font-bold ${soon && (a.kind === "deadline" || a.kind === "task") ? "text-bad" : ""}`}>{relDay(a.at)}</span>
                      <span className="block text-muted">{a.allDay ? "All day" : fmtTime(a.at)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {d.agenda.length === 0 && <Empty title="Nothing due in the next two weeks" />}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-2.5"><Sparkles size={18} className="text-accent" aria-hidden /><h2 className="h2">Needs attention</h2></div>
            <span className="text-[12.5px] text-muted">Updated live from your data</span>
          </div>
          {d.insights.map((n, i) => (
            <div key={i} className="flex items-start gap-3.5 border-t border-[#eef0f3] px-5 py-3.5">
              <Pill tone={n.tone}>{n.tag}</Pill>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="leading-snug">{n.text}</p>
                <Link href={n.href} className="link text-[13.5px]">{n.action}</Link>
              </div>
            </div>
          ))}
          {d.insights.length === 0 && <Empty title="Nothing needs attention">No open review findings, overdue tasks or failed uploads.</Empty>}
        </section>

        <section className="card overflow-hidden">
          <CardHeader title="Recent documents" href="/documents" linkLabel="All documents" />
          {d.recentDocs.map(({ d: doc, caseTitle }) => (
            <Link key={doc.id} href={`/documents/${doc.id}`} className="flex items-center gap-3.5 border-t border-[#eef0f3] px-5 py-3 hover:bg-sunken">
              <DocIcon ext={fileExt(doc.title, doc.mimeType)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{doc.title}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{caseTitle ?? "Firm-wide"} · {ago(doc.updatedAt)}</span>
              </span>
              <Pill tone={docStatusTone(doc.status)}>{DOC_STATUS_LABEL[doc.status]}</Pill>
            </Link>
          ))}
          {d.recentDocs.length === 0 && <Empty title="No documents yet" action={<Link href="/documents" className="btn btn-secondary btn-sm"><FileText size={16} />Upload</Link>} />}
        </section>
      </div>
    </>
  );
}
