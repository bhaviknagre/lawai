import Link from "next/link";
import { addMonths, eachDayOfInterval, format, isSameDay, isSameMonth, isToday, parse, subMonths } from "date-fns";
import { CalendarPlus, ChevronLeft, ChevronRight, ListPlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCalendar, getDeadlineRules, getTaskList } from "@/lib/queries/tasks";
import { caseOptions } from "@/lib/queries/cases";
import { getFirmUsers } from "@/lib/queries/common";
import { FormDialog } from "@/components/forms";
import { EventFields, TaskFields } from "@/components/fields";
import { TaskCheck } from "@/components/task-row";
import { Empty, PageHeader, Pill, priorityTone } from "@/components/ui";
import { createEvent, createTask } from "@/app/actions/practice";
import { cn, fmtTime, PRIORITY_LABEL, relDay } from "@/lib/utils";
import { DeadlineCalculator } from "./calculator";

export const metadata = { title: "Tasks & deadlines" };
const DOT = { hearing: "bg-hearing", deadline: "bg-bad", meeting: "bg-good", internal: "bg-subtle", task: "bg-mid" } as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ month?: string; mine?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const mine = sp.mine === "1";
  const month = sp.month ? parse(sp.month, "yyyy-MM", new Date()) : new Date();
  const [cal, list, rules, cases, people] = await Promise.all([getCalendar(user, month, mine), getTaskList(user, mine), getDeadlineRules(), caseOptions(user), getFirmUsers(user.firmId)]);
  const days = eachDayOfInterval({ start: cal.from, end: cal.to });
  const items = [
    ...cal.events.map(({ e, caseTitle }) => ({ id: e.id, at: e.startsAt, title: e.title, kind: e.type, sub: caseTitle, href: e.caseId ? `/cases/${e.caseId}` : "/tasks" })),
    ...cal.tasks.map(({ t, caseTitle }) => ({ id: t.id, at: t.dueAt!, title: t.title, kind: "task" as const, sub: caseTitle, href: t.caseId ? `/cases/${t.caseId}` : "/tasks" })),
  ];
  const m = (d: Date) => format(d, "yyyy-MM");
  const groups = [
    { title: "Overdue", rows: list.overdue, bad: true },
    { title: "Today", rows: list.today },
    { title: "Next 7 days", rows: list.week },
    { title: "Later", rows: list.later },
  ];
  return (
    <>
      <PageHeader title="Tasks & deadlines">
        <div role="group" className="flex rounded-[10px] bg-chip p-1">
          <Link href={`/tasks?month=${m(month)}`} className={cn("flex h-9 items-center rounded-[7px] px-3 text-[13.5px] font-semibold", !mine ? "bg-white shadow-sm" : "text-muted")}>Everyone</Link>
          <Link href={`/tasks?month=${m(month)}&mine=1`} className={cn("flex h-9 items-center rounded-[7px] px-3 text-[13.5px] font-semibold", mine ? "bg-white shadow-sm" : "text-muted")}>Mine</Link>
        </div>
        <FormDialog label="Add event" title="Add event" icon={<CalendarPlus size={17} />} action={createEvent} submitLabel="Add event"><EventFields cases={cases} /></FormDialog>
        <FormDialog label="Add task" title="Add task" icon={<ListPlus size={17} />} buttonClass="btn btn-primary" action={createTask} submitLabel="Add task"><TaskFields cases={cases} people={people} /></FormDialog>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="h2">{format(month, "MMMM yyyy")}</h2>
            <div className="flex gap-1.5">
              <Link aria-label="Previous month" href={`/tasks?month=${m(subMonths(month, 1))}${mine ? "&mine=1" : ""}`} className="btn btn-secondary btn-sm w-9 px-0"><ChevronLeft size={16} /></Link>
              <Link href={`/tasks${mine ? "?mine=1" : ""}`} className="btn btn-secondary btn-sm">Today</Link>
              <Link aria-label="Next month" href={`/tasks?month=${m(addMonths(month, 1))}${mine ? "&mine=1" : ""}`} className="btn btn-secondary btn-sm w-9 px-0"><ChevronRight size={16} /></Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[720px] grid-cols-7 border-t border-line">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="th border-b border-line bg-sunken px-2 py-2">{d}</div>)}
              {days.map((d) => {
                const its = items.filter((i) => isSameDay(i.at, d));
                return (
                  <div key={d.toISOString()} className={cn("min-h-[108px] border-b border-r border-[#eef0f3] p-1.5", !isSameMonth(d, month) && "bg-sunken/70")}>
                    <div className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[12.5px] font-semibold", isToday(d) ? "bg-accent text-white" : isSameMonth(d, month) ? "" : "text-subtle")}>{format(d, "d")}</div>
                    <div className="flex flex-col gap-0.5">
                      {its.slice(0, 3).map((i) => (
                        <Link key={i.id} href={i.href} title={`${i.title}${i.sub ? ` · ${i.sub}` : ""}`} className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11.5px] hover:bg-chip">
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[i.kind])} />
                          <span className="truncate">{i.kind !== "task" && fmtTime(i.at).replace(":00", "")} {i.title}</span>
                        </Link>
                      ))}
                      {its.length > 3 && <span className="px-1 text-[11px] text-muted">+{its.length - 3} more</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 px-5 py-3 text-[12.5px] text-muted">
            {Object.entries(DOT).map(([k, c]) => <span key={k} className="flex items-center gap-1.5 capitalize"><span className={cn("h-2 w-2 rounded-full", c)} />{k}</span>)}
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section className="card overflow-hidden">
            <div className="px-5 py-4"><h2 className="h2">Open tasks</h2></div>
            {groups.map((g) => g.rows.length > 0 && (
              <div key={g.title}>
                <div className={cn("border-t border-line bg-sunken px-5 py-2 text-[12.5px] font-semibold", g.bad ? "text-bad" : "text-muted")}>{g.title} · {g.rows.length}</div>
                {g.rows.map(({ t, caseTitle, assignee }) => (
                  <div key={t.id} className="flex items-start gap-3 border-t border-[#eef0f3] px-5 py-3">
                    <span className="mt-0.5"><TaskCheck id={t.id} done={false} title={t.title} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium leading-snug">{t.title}</div>
                      <div className="text-[12.5px] text-muted">{caseTitle ?? "Firm"} · {assignee ?? "Unassigned"}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Pill tone={priorityTone(t.priority)}>{PRIORITY_LABEL[t.priority]}</Pill>
                      <span className={cn("text-[12px] font-semibold", g.bad && "text-bad")}>{t.dueAt ? relDay(t.dueAt) : "No date"}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {groups.every((g) => g.rows.length === 0) && <Empty title="No open tasks" />}
          </section>
          <DeadlineCalculator rules={rules} />
        </div>
      </div>
    </>
  );
}
