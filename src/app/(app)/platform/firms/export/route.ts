import { format } from "date-fns";
import { requirePlatformAdmin } from "@/lib/auth";
import { FIRM_FILTERS, getFirmStats } from "@/lib/platform-stats";
import { PLANS } from "@/lib/subscriptions";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** GET /platform/firms/export[?status=…] — the Firms report as CSV for spreadsheets and invoicing. */
export async function GET(req: Request) {
  await requirePlatformAdmin();
  const status = new URL(req.url).searchParams.get("status");
  const filter = FIRM_FILTERS.find((f) => f.id === status) ?? FIRM_FILTERS[0]!;
  const rows = (await getFirmStats()).filter(filter.match);
  const header = ["Firm", "Slug", "Status", "Plan", "Monthly fee", "Term ends", "Renewal", "Seats used", "Seat limit", "Admins", "Associates", "Paralegals", "Pending invites", "Clients", "Open cases", "Total cases", "Documents", "AI actions (30d)", "AI tokens (30d)", "Last active", "Customer since"];
  const lines = rows.map((f) => [
    f.name, f.slug, f.suspendedAt ? "Suspended" : "Active", PLANS[f.plan].label, f.monthlyFee, f.subscriptionEndsAt, f.renewal.label, f.seatsUsed, f.seatLimit,
    f.team.admins, f.team.associates, f.team.paralegals, f.pendingInvites, f.clients, f.openCases, f.totalCases, f.documents, f.aiActions30d, f.aiTokens30d, f.lastActiveAt, f.createdAt,
  ]);
  const csv = [header, ...lines].map((r) => r.map(cell).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lawai-firms-${filter.id}-${format(new Date(), "yyyy-MM-dd")}.csv"`,
    },
  });
}
