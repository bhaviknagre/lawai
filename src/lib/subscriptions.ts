import { addDays, format } from "date-fns";
import { z } from "zod";
import { daysUntil } from "./utils";

/**
 * Plans, terms and renewal status for customer firms. Used by the /platform console, the
 * platform API and the renewal banner firm admins see. Expiry never blocks anyone by itself:
 * the operator decides whether to renew or stop service.
 */
export const PLANS = {
  trial: { label: "Trial", defaultSeats: 5 },
  starter: { label: "Starter", defaultSeats: 10 },
  professional: { label: "Professional", defaultSeats: 50 },
  enterprise: { label: "Enterprise", defaultSeats: null },
} as const;
export type Plan = keyof typeof PLANS;
export const PLAN_IDS = Object.keys(PLANS) as [Plan, ...Plan[]];

export const TRIAL_DAYS = 30;
/** Renewals inside this window show up as reminders. */
export const RENEWAL_WINDOW_DAYS = 30;
/** Firm admins see an in-app banner this close to the end date. */
export const ADMIN_BANNER_DAYS = 14;
/** The internal firm platform operators belong to. Left out of customer analytics. */
export const OPS_SLUG = "lawai-ops";

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

export const subscriptionSchema = z.object({
  plan: z.enum(PLAN_IDS),
  seatLimit: z.preprocess(blankToNull, z.coerce.number().int().min(1, "Seats must be at least 1.").max(100000).nullable()),
  monthlyFee: z.preprocess((v) => blankToNull(v) ?? 0, z.coerce.number().int().min(0, "Fee can't be negative.")),
  endsAt: z.preprocess(blankToNull, z.coerce.date({ error: "Enter a valid end date." }).nullable()),
});
export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

export const defaultSubscription = (): SubscriptionInput => ({ plan: "trial", seatLimit: PLANS.trial.defaultSeats, monthlyFee: 0, endsAt: addDays(new Date(), TRIAL_DAYS) });

export function money(n: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: process.env.BILLING_CURRENCY ?? "USD", maximumFractionDigits: 0 }).format(n);
}

type Tone = "good" | "bad" | "mid" | "neutral";
export type Renewal = { state: "suspended" | "none" | "expired" | "due" | "ok"; days: number | null; tone: Tone; label: string };

/** Where a firm stands on its term, e.g. "Expires in 5 days" or "Expired 3 days ago". */
export function renewal(f: { suspendedAt: Date | null; subscriptionEndsAt: Date | null; plan: Plan }): Renewal {
  if (f.suspendedAt) return { state: "suspended", days: null, tone: "bad", label: "Suspended" };
  if (!f.subscriptionEndsAt) return { state: "none", days: null, tone: "neutral", label: "No end date" };
  const days = daysUntil(f.subscriptionEndsAt);
  const what = f.plan === "trial" ? "Trial" : "Plan";
  if (days < 0) return { state: "expired", days, tone: "bad", label: `${what} expired ${-days} day${days === -1 ? "" : "s"} ago` };
  if (days === 0) return { state: "due", days, tone: "bad", label: `${what} ends today` };
  if (days <= RENEWAL_WINDOW_DAYS) return { state: "due", days, tone: days <= 7 ? "bad" : "mid", label: `${what} ends in ${days} day${days === 1 ? "" : "s"}` };
  return { state: "ok", days, tone: "good", label: `Renews ${format(f.subscriptionEndsAt, "d MMM yyyy")}` };
}

/** Whether a firm counts towards recurring revenue: paid plan, service on, term not lapsed. */
export const isPaying = (f: { plan: Plan; suspendedAt: Date | null; subscriptionEndsAt: Date | null; monthlyFee: number }) =>
  f.plan !== "trial" && !f.suspendedAt && f.monthlyFee > 0 && (!f.subscriptionEndsAt || daysUntil(f.subscriptionEndsAt) >= 0);
