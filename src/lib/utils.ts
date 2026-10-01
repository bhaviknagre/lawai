import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, differenceInCalendarDays } from "date-fns";

export const cn = (...v: ClassValue[]) => clsx(v);

export function fmtDate(d: Date | string | null | undefined, pattern = "EEE d MMM") {
  if (!d) return "—";
  return format(new Date(d), pattern);
}

export function fmtTime(d: Date | string) {
  return format(new Date(d), "h:mm a");
}

/** "Today", "Tomorrow", "Fri 2 Oct" */
export function relDay(d: Date | string) {
  const x = new Date(d);
  if (isToday(x)) return "Today";
  if (isTomorrow(x)) return "Tomorrow";
  if (isYesterday(x)) return "Yesterday";
  return format(x, "EEE d MMM");
}

export function ago(d: Date | string) {
  return `${formatDistanceToNowStrict(new Date(d))} ago`;
}

export function daysUntil(d: Date | string) {
  return differenceInCalendarDays(new Date(d), new Date());
}

export function fileExt(title: string, mime: string) {
  const m = title.match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1]!.toUpperCase();
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("word")) return "DOCX";
  return "TXT";
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;
export const DOC_STATUS_LABEL = {
  draft: "Draft",
  in_review: "In review",
  final: "Final",
  signed: "Signed",
  filed: "Filed",
} as const;
export const CLIENT_TYPE_LABEL = { company: "Company", individual: "Individual", trust: "Trust", estate: "Estate" } as const;
export const CASE_STATUS_LABEL = { active: "Active", on_hold: "On hold", closed: "Closed" } as const;
