/**
 * Demo seed. Every date is relative to "now", so the workspace always looks current.
 * Run: npm run db:seed   (idempotent — wipes the demo firm's data and recreates it)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { addDays, addHours, setHours, setMinutes, startOfDay, subDays, startOfWeek, addWeeks } from "date-fns";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import * as s from "../src/db/schema";
import * as D from "./seed-documents";

const now = new Date();
const at = (days: number, h: number, m = 0) => setMinutes(setHours(startOfDay(addDays(now, days)), h), m);
const day = (days: number) => addDays(now, days).toISOString().slice(0, 10);

// Deterministic PRNG so every seed produces the same demo.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

async function main() {
  console.log("Seeding LawAI demo…");

  // ── Reference data ────────────────────────────────────────────────
  await db
    .insert(s.jurisdictions)
    .values([
      { code: "US-FED", name: "United States · Federal", short: "US·FED", country: "US", timezone: "America/New_York" },
      { code: "US-NY", name: "New York", short: "US·NY", country: "US", timezone: "America/New_York" },
      { code: "US-CA", name: "California", short: "US·CA", country: "US", timezone: "America/Los_Angeles" },
      { code: "UK-EW", name: "England & Wales", short: "UK·E&W", country: "UK", timezone: "Europe/London" },
      { code: "IN", name: "India", short: "IN", country: "IN", timezone: "Asia/Kolkata" },
      { code: "IN-MH", name: "Maharashtra, India", short: "IN·MH", country: "IN", timezone: "Asia/Kolkata" },
      { code: "SG", name: "Singapore", short: "SG", country: "SG", timezone: "Asia/Singapore" },
      { code: "EU", name: "European Union", short: "EU", country: "EU", timezone: "Europe/Brussels" },
    ])
    .onConflictDoNothing();

  // Wipe previous demo firm (cascades to everything firm-scoped).
  await db.delete(s.firms).where(eq(s.firms.slug, "smith-malik"));
  await db.delete(s.legalSources);
  await db.delete(s.deadlineRules);

  const [firm] = await db
    .insert(s.firms)
    .values({ name: "Smith & Malik LLP", slug: "smith-malik", jurisdictions: ["US-NY", "US-CA", "US-FED", "UK-EW", "IN-MH", "SG", "EU"] })
    .returning();
  const firmId = firm!.id;

  // ── People ────────────────────────────────────────────────────────
  const hash = await bcrypt.hash("demo1234", 10);
  const people = await db
    .insert(s.users)
    .values([
      { firmId, name: "John Smith", email: "john@demo.law", passwordHash: hash, role: "admin", title: "Senior Attorney", color: "#2A3858", weeklyTargetHours: 32 },
      { firmId, name: "Aisha Malik", email: "aisha@demo.law", passwordHash: hash, role: "attorney", title: "Associate", color: "#146B42", weeklyTargetHours: 35 },
      { firmId, name: "Priya Menon", email: "priya@demo.law", passwordHash: hash, role: "attorney", title: "Associate", color: "#9A3A06", weeklyTargetHours: 35 },
      { firmId, name: "Daniel Lee", email: "daniel@demo.law", passwordHash: hash, role: "attorney", title: "Associate", color: "#5B3FA6", weeklyTargetHours: 30 },
      { firmId, name: "Sam Ortiz", email: "sam@demo.law", passwordHash: hash, role: "paralegal", title: "Paralegal", color: "#0F6B6B", weeklyTargetHours: 20 },
    ])
    .returning();
  const [john, aisha, priya, daniel, sam] = people as [s.User, s.User, s.User, s.User, s.User];

  // ── Clients ───────────────────────────────────────────────────────
  const clientRows = await db
    .insert(s.clients)
    .values([
      { firmId, name: "Robert Smith", type: "individual", location: "New York, US", email: "robert.smith@example.com", phone: "[PHONE]", primaryContact: "Robert Smith", contactTitle: "CEO, Smith Manufacturing LLC", billing: "Hourly · monthly invoice", clientSince: day(-420), conflictCheckedAt: day(-420) },
      { firmId, name: "Mehta Industries", type: "company", location: "Pune, India", email: "legal@mehta.example.com", phone: "[PHONE]", primaryContact: "Vikram Mehta", contactTitle: "Director", billing: "Fixed fee per stage", clientSince: day(-700), conflictCheckedAt: day(-700) },
      { firmId, name: "Harlow & Finch Ltd", type: "company", location: "London, UK", email: "sarah.finch@example.com", phone: "[PHONE]", primaryContact: "Sarah Finch", contactTitle: "Managing Director", billing: "Hourly · monthly invoice", clientSince: day(-560), conflictCheckedAt: day(-560) },
      { firmId, name: "Williams family", type: "estate", location: "Bristol, UK", email: "clare.williams@example.com", phone: "[PHONE]", primaryContact: "Clare Williams", contactTitle: "Executor", billing: "Fixed fee", clientSince: day(-90), conflictCheckedAt: day(-90) },
      { firmId, name: "Tan Logistics Pte Ltd", type: "company", location: "Singapore", email: "hr@tanlogistics.example.com", phone: "[PHONE]", primaryContact: "Mei Tan", contactTitle: "Head of People", billing: "Retainer", clientSince: day(-300), conflictCheckedAt: day(-300) },
      { firmId, name: "Elena Rossi", type: "individual", location: "Brooklyn, US", email: "elena.rossi@example.com", phone: "[PHONE]", primaryContact: "Elena Rossi", billing: "Contingency", clientSince: day(-150), conflictCheckedAt: day(-150) },
      { firmId, name: "Brown family", type: "trust", location: "San Diego, US", email: "thomas.brown@example.com", phone: "[PHONE]", primaryContact: "Thomas Brown", contactTitle: "Settlor", billing: "Fixed fee", clientSince: day(-60), conflictCheckedAt: day(-60) },
      { firmId, name: "Northwind Health", type: "company", location: "Dublin, Ireland", email: "ip@northwind.example.com", phone: "[PHONE]", primaryContact: "Aoife Byrne", contactTitle: "General Counsel", billing: "Hourly", clientSince: day(-20), conflictCheckedAt: day(-20) },
    ])
    .returning();
  const C = Object.fromEntries(clientRows.map((c) => [c.name, c.id])) as Record<string, string>;

  // ── Matters ───────────────────────────────────────────────────────
  const caseRows = await db
    .insert(s.cases)
    .values([
      { firmId, clientId: C["Robert Smith"]!, title: "Smith v. Johnson Corp", caseNumber: "CV-2026-0418", practiceArea: "Litigation", jurisdiction: "US-NY", court: "Supreme Court of the State of New York, County of New York (Commercial Division)", stage: "Discovery", priority: "high", opposingParty: "Johnson Corp", opposingCounsel: "Hart & Reyes LLP (Daniel Hart)", description: "Breach of the Master Supply Agreement: defective components delivered March–June 2026; claim for replacement costs and lost profits.", openedAt: day(-160) },
      { firmId, clientId: C["Mehta Industries"]!, title: "Mehta Industries v. Arcon Infra", caseNumber: "ARB-2026-0112", practiceArea: "Arbitration", jurisdiction: "IN-MH", court: "Arbitral tribunal (seat: Mumbai)", stage: "Hearings", priority: "high", opposingParty: "Arcon Infra Ltd", opposingCounsel: "Desai Kapoor & Co. (Neha Desai)", description: "Unpaid invoices of INR 18.6 crore under a steel supply contract for a metro viaduct project.", openedAt: day(-240) },
      { firmId, clientId: C["Williams family"]!, title: "Estate of Williams", caseNumber: "PR-2026-0207", practiceArea: "Probate & estates", jurisdiction: "UK-EW", court: "Probate Registry", stage: "Grant of probate", priority: "medium", description: "Administration of the estate of Margaret Williams and update of her draft will.", openedAt: day(-80) },
      { firmId, clientId: C["Harlow & Finch Ltd"]!, title: "Harlow & Finch v. Quayside Ltd", caseNumber: "CL-2026-0331", practiceArea: "Litigation", jurisdiction: "UK-EW", court: "High Court, Business and Property Courts (TCC)", stage: "Pre-action", priority: "medium", opposingParty: "Quayside Ltd", opposingCounsel: "Brook & Hale LLP", description: "Defence of a £104,000 liquidated damages claim for late completion of fit-out works.", openedAt: day(-30) },
      { firmId, clientId: C["Elena Rossi"]!, title: "Rossi v. Meridian Rentals", caseNumber: "CV-2026-0377", practiceArea: "Litigation", jurisdiction: "US-NY", court: "Civil Court of the City of New York, Kings County", stage: "Settlement", priority: "medium", opposingParty: "Meridian Rentals LLC", description: "Tenant claim for return of security deposit and repair costs.", openedAt: day(-140) },
      { firmId, clientId: C["Tan Logistics Pte Ltd"]!, title: "Tan Logistics · restructuring", caseNumber: "ADV-2026-0290", practiceArea: "Employment", jurisdiction: "SG", stage: "Advisory", priority: "medium", description: "Advice on a workforce restructuring affecting two depots.", openedAt: day(-45) },
      { firmId, clientId: C["Brown family"]!, title: "Brown Family Trust", caseNumber: "EP-2026-0154", practiceArea: "Probate & estates", jurisdiction: "US-CA", stage: "Drafting", priority: "low", description: "Revocable living trust and pour-over wills.", openedAt: day(-55) },
      { firmId, clientId: C["Northwind Health"]!, title: "Northwind Health · trademarks", caseNumber: "IP-2026-0098", practiceArea: "Intellectual property", jurisdiction: "EU", stage: "Filing", priority: "low", description: "EU trade mark filings for three product brands.", openedAt: day(-18) },
      { firmId, clientId: C["Harlow & Finch Ltd"]!, title: "Harlow & Finch · lease review", caseNumber: "CL-2026-0402", practiceArea: "Corporate", jurisdiction: "UK-EW", stage: "Intake", priority: "low", status: "on_hold", description: "Review of a new commercial lease. On hold pending signed engagement letter.", openedAt: day(-6) },
      { firmId, clientId: C["Robert Smith"]!, title: "Smith Manufacturing · distributor agreement", caseNumber: "CO-2026-0144", practiceArea: "Corporate", jurisdiction: "US-NY", stage: "Closed", priority: "low", status: "closed", openedAt: day(-150), closedAt: day(-82) },
      { firmId, clientId: C["Elena Rossi"]!, title: "Rossi · lease renewal", caseNumber: "CO-2026-0201", practiceArea: "Corporate", jurisdiction: "US-NY", stage: "Closed", priority: "low", status: "closed", openedAt: day(-95), closedAt: day(-40) },
    ])
    .returning();
  const K = Object.fromEntries(caseRows.map((c) => [c.caseNumber, c.id])) as Record<string, string>;

  const staff: [string, s.User, string][] = [
    ["CV-2026-0418", john, "lead"], ["CV-2026-0418", aisha, "member"], ["CV-2026-0418", sam, "member"],
    ["ARB-2026-0112", priya, "lead"], ["ARB-2026-0112", john, "member"],
    ["PR-2026-0207", aisha, "lead"],
    ["CL-2026-0331", aisha, "lead"], ["CL-2026-0331", daniel, "member"],
    ["CV-2026-0377", john, "lead"], ["CV-2026-0377", sam, "member"],
    ["ADV-2026-0290", daniel, "lead"],
    ["EP-2026-0154", john, "lead"], ["EP-2026-0154", priya, "member"],
    ["IP-2026-0098", daniel, "lead"],
    ["CL-2026-0402", daniel, "lead"],
    ["CO-2026-0144", john, "lead"], ["CO-2026-0201", john, "lead"],
  ];
  await db.insert(s.caseMembers).values(staff.map(([n, u, role]) => ({ caseId: K[n]!, userId: u.id, role })));

  // ── Calendar ──────────────────────────────────────────────────────
  await db.insert(s.events).values([
    { firmId, caseId: null, title: "Firm review meeting", type: "internal", startsAt: at(0, 16), location: "Conference room A", createdBy: john.id },
    { firmId, caseId: K["CV-2026-0418"]!, title: "Client meeting · Robert Smith", type: "meeting", startsAt: at(1, 10), location: "Video call", createdBy: john.id },
    { firmId, caseId: K["CV-2026-0418"]!, title: "Motion to compel: filing deadline", type: "deadline", startsAt: at(1, 17), allDay: false, createdBy: john.id },
    { firmId, caseId: K["CV-2026-0377"]!, title: "Settlement conference", type: "hearing", startsAt: at(7, 11), location: "Kings County Civil Court, Part 41", judge: "[JUDGE NAME]", createdBy: john.id },
    { firmId, caseId: K["CV-2026-0418"]!, title: "Hearing on motion to compel", type: "hearing", startsAt: at(6, 9, 30), location: "60 Centre Street, New York · Part 53, Courtroom 228", judge: "Hon. [JUDGE NAME]", notes: "Bring hearing bundle (2 exhibits still missing: RS-5, RS-6).", createdBy: john.id },
    { firmId, caseId: K["PR-2026-0207"]!, title: "Probate application due", type: "deadline", startsAt: at(8, 17), createdBy: aisha.id },
    { firmId, caseId: K["ADV-2026-0290"]!, title: "Client call · Tan Logistics", type: "meeting", startsAt: at(5, 16), location: "Video call (SGT 16:00)", createdBy: daniel.id },
    { firmId, caseId: K["ARB-2026-0112"]!, title: "Arbitral hearing · day 1", type: "hearing", startsAt: at(11, 10, 30), location: "MCIA, Mumbai", judge: "Presiding arbitrator: [NAME]", notes: "Times are IST.", createdBy: priya.id },
    { firmId, caseId: K["EP-2026-0154"]!, title: "Trust deed signing", type: "meeting", startsAt: at(13, 14), location: "Office", createdBy: john.id },
    { firmId, caseId: K["CL-2026-0331"]!, title: "Pre-action response due", type: "deadline", startsAt: at(14, 17), createdBy: aisha.id },
    { firmId, caseId: K["IP-2026-0098"]!, title: "EUIPO filing deadline", type: "deadline", startsAt: at(19, 17), createdBy: daniel.id },
    { firmId, caseId: K["CV-2026-0377"]!, title: "Answer due (counterclaim)", type: "deadline", startsAt: at(20, 17), createdBy: john.id },
    { firmId, caseId: K["CV-2026-0418"]!, title: "Discovery cut-off", type: "deadline", startsAt: at(25, 17), createdBy: john.id },
    { firmId, caseId: null, title: "Partner meeting", type: "internal", startsAt: at(28, 9), createdBy: john.id },
    { firmId, caseId: K["CV-2026-0418"]!, title: "Preliminary conference", type: "hearing", startsAt: at(-21, 10), location: "60 Centre Street, Part 53", judge: "Hon. [JUDGE NAME]", notes: "Court set the discovery schedule; cut-off in ~7 weeks.", createdBy: john.id },
    { firmId, caseId: K["ARB-2026-0112"]!, title: "Procedural hearing", type: "hearing", startsAt: at(-16, 11), location: "Virtual", createdBy: priya.id },
    // Prior-period deadlines so the dashboard delta has something to compare against.
    ...Array.from({ length: 4 }, (_, i) => ({ firmId, caseId: K["CV-2026-0418"]!, title: `Document production tranche ${i + 1}`, type: "deadline" as const, startsAt: at(-3 - i * 3, 17), createdBy: john.id })),
    ...Array.from({ length: 3 }, (_, i) => ({ firmId, caseId: K["CL-2026-0331"]!, title: `Client document request ${i + 1}`, type: "deadline" as const, startsAt: at(-2 - i * 4, 12), createdBy: aisha.id })),
  ]);

  // ── Tasks ─────────────────────────────────────────────────────────
  await db.insert(s.tasks).values([
    { firmId, caseId: K["CL-2026-0402"]!, title: "Send engagement letter", assigneeId: daniel.id, dueAt: at(-2, 17), priority: "high", createdBy: john.id },
    { firmId, caseId: K["CV-2026-0418"]!, title: "Prepare witness list", assigneeId: john.id, dueAt: at(0, 18), priority: "high", createdBy: john.id },
    { firmId, caseId: null, title: "Approve invoice batch", assigneeId: john.id, dueAt: at(0, 17), priority: "medium", createdBy: john.id },
    { firmId, caseId: K["CV-2026-0418"]!, title: "File motion to compel", assigneeId: john.id, dueAt: at(1, 17), priority: "high", createdBy: john.id, createdAt: subDays(now, 2) },
    { firmId, caseId: K["CV-2026-0418"]!, title: "Obtain exhibits RS-5 and RS-6 for hearing bundle", assigneeId: sam.id, dueAt: at(4, 12), priority: "high", createdBy: john.id, createdAt: subDays(now, 1) },
    { firmId, caseId: K["PR-2026-0207"]!, title: "Mark up draft will v2", assigneeId: aisha.id, dueAt: at(4, 11), priority: "medium", createdBy: aisha.id },
    { firmId, caseId: K["ADV-2026-0290"]!, title: "Prepare call notes on retrenchment process", assigneeId: daniel.id, dueAt: at(5, 12), priority: "medium", createdBy: daniel.id },
    { firmId, caseId: K["CV-2026-0418"]!, title: "Finalise hearing bundle", assigneeId: aisha.id, dueAt: at(5, 15), priority: "high", createdBy: john.id },
    { firmId, caseId: K["CV-2026-0377"]!, title: "Draft settlement terms", assigneeId: john.id, dueAt: at(6, 12), priority: "medium", createdBy: john.id },
    { firmId, caseId: K["ARB-2026-0112"]!, title: "Witness preparation · Vikram Mehta", assigneeId: priya.id, dueAt: at(9, 10), priority: "high", createdBy: priya.id },
    { firmId, caseId: K["CL-2026-0331"]!, title: "Draft pre-action response", assigneeId: aisha.id, dueAt: at(10, 17), priority: "medium", createdBy: aisha.id },
    { firmId, caseId: K["EP-2026-0154"]!, title: "Name successor trustee with clients", assigneeId: priya.id, dueAt: at(9, 12), priority: "low", createdBy: john.id },
    { firmId, caseId: K["IP-2026-0098"]!, title: "Clearance search for third brand", assigneeId: daniel.id, dueAt: at(12, 12), priority: "low", createdBy: daniel.id },
    { firmId, caseId: K["CV-2026-0418"]!, title: "Serve first request for production", assigneeId: aisha.id, dueAt: at(-30, 17), status: "done", completedAt: at(-31, 15), priority: "medium", createdBy: john.id },
    { firmId, caseId: K["PR-2026-0207"]!, title: "Collect death certificate copies", assigneeId: aisha.id, dueAt: at(-20, 12), status: "done", completedAt: at(-22, 12), priority: "medium", createdBy: aisha.id },
  ]);

  // ── Time entries: ~26 weeks of billable/non-billable time ────────
  const entries: (typeof s.timeEntries.$inferInsert)[] = [];
  const billableCases = [K["CV-2026-0418"]!, K["ARB-2026-0112"]!, K["PR-2026-0207"]!, K["CL-2026-0331"]!, K["CV-2026-0377"]!, K["ADV-2026-0290"]!, K["EP-2026-0154"]!];
  const startW = startOfWeek(addWeeks(now, -26), { weekStartsOn: 1 });
  for (const u of people) {
    const base = u.weeklyTargetHours / 5;
    for (let d = 0; d < 26 * 7; d++) {
      const date = addDays(startW, d);
      if (date > now || date.getDay() === 0 || date.getDay() === 6) continue;
      const billable = Math.max(0, base * (0.75 + rand() * 0.45));
      entries.push({ firmId, userId: u.id, caseId: billableCases[Math.floor(rand() * billableCases.length)]!, workDate: date.toISOString().slice(0, 10), hours: billable.toFixed(2), billable: true, description: "Matter work" });
      entries.push({ firmId, userId: u.id, caseId: null, workDate: date.toISOString().slice(0, 10), hours: (0.8 + rand() * 1.2).toFixed(2), billable: false, description: "Admin / BD" });
    }
  }
  for (let i = 0; i < entries.length; i += 500) await db.insert(s.timeEntries).values(entries.slice(i, i + 500));

  // ── Playbook ──────────────────────────────────────────────────────
  const rules = await db
    .insert(s.playbookRules)
    .values([
      { firmId, playbook: "Supply agreements (customer side)", documentKind: "Contract", title: "Liability cap", rule: "Supplier's aggregate liability cap must be at least 12 months' fees, with carve-outs for fraud, wilful misconduct, confidentiality and data protection.", severity: "high" },
      { firmId, playbook: "Supply agreements (customer side)", documentKind: "Contract", title: "Renewal notice", rule: "Non-renewal notice period must be no longer than 60 days.", severity: "high" },
      { firmId, playbook: "Supply agreements (customer side)", documentKind: "Contract", title: "Forum selection", rule: "Every agreement must name the courts (or arbitral seat) with exclusive jurisdiction, matching the governing law.", severity: "medium" },
      { firmId, playbook: "Supply agreements (customer side)", documentKind: "Contract", title: "Confidentiality survival", rule: "Confidentiality obligations must survive termination for at least 3 years (trade secrets indefinitely).", severity: "low" },
      { firmId, playbook: "Supply agreements (customer side)", documentKind: "Contract", title: "Warranty remedies", rule: "Exclusive remedy clauses must not prevent recovery of cover costs for replacement goods.", severity: "medium" },
    ])
    .returning();
  const R = Object.fromEntries(rules.map((r) => [r.title, r.id])) as Record<string, string>;

  // ── Documents ─────────────────────────────────────────────────────
  const docs = await db
    .insert(s.documents)
    .values([
      { firmId, caseId: K["CV-2026-0418"]!, title: "Johnson Corp_MSA_v4.docx", kind: "Contract", status: "in_review", content: D.MSA, uploadedBy: aisha.id, sizeBytes: D.MSA.length, version: 4, updatedAt: subDays(now, 0) },
      { firmId, caseId: K["CV-2026-0418"]!, title: "Witness statement – R. Smith.pdf", kind: "Evidence", status: "final", content: D.WITNESS, uploadedBy: john.id, sizeBytes: D.WITNESS.length, pageCount: 3, updatedAt: subDays(now, 1) },
      { firmId, caseId: K["CV-2026-0418"]!, title: "Motion to compel – draft.docx", kind: "Pleading", status: "draft", content: D.MOTION, uploadedBy: john.id, sizeBytes: D.MOTION.length, updatedAt: subDays(now, 1) },
      { firmId, caseId: K["PR-2026-0207"]!, title: "Williams – draft will v2.docx", kind: "Will", status: "draft", content: D.WILL, uploadedBy: aisha.id, sizeBytes: D.WILL.length, version: 2, updatedAt: subDays(now, 2) },
      { firmId, caseId: K["ARB-2026-0112"]!, title: "Statement of claim – Mehta.pdf", kind: "Pleading", status: "filed", content: D.MEHTA_CLAIM, uploadedBy: priya.id, sizeBytes: D.MEHTA_CLAIM.length, updatedAt: subDays(now, 4) },
      { firmId, caseId: K["CL-2026-0331"]!, title: "Quayside letter of claim.pdf", kind: "Correspondence", status: "final", content: D.QUAYSIDE_LETTER, uploadedBy: aisha.id, sizeBytes: D.QUAYSIDE_LETTER.length, updatedAt: subDays(now, 7) },
      { firmId, caseId: K["EP-2026-0154"]!, title: "Brown trust deed – v3.docx", kind: "Trust deed", status: "in_review", content: D.TRUST_DEED, uploadedBy: priya.id, sizeBytes: D.TRUST_DEED.length, version: 3, updatedAt: subDays(now, 9) },
      { firmId, caseId: K["ADV-2026-0290"]!, title: "Employee handbook (SG).pdf", kind: "Policy", status: "signed", content: D.HANDBOOK, uploadedBy: daniel.id, sizeBytes: D.HANDBOOK.length, updatedAt: subDays(now, 13) },
    ])
    .returning();
  const msa = docs[0]!;

  await db.insert(s.documentIssues).values([
    { documentId: msa.id, firmId, severity: "high", clauseRef: "cl. 14.2", title: "Liability cap below playbook", explanation: "A cap of 3 months' fees leaves the client under-protected for a supply failure of this size. The playbook requires at least 12 months' fees.", originalText: "the fees paid by Customer in the three (3) months preceding", suggestedText: "the fees paid by Customer in the twelve (12) months preceding", playbookRuleId: R["Liability cap"] },
    { documentId: msa.id, firmId, severity: "high", clauseRef: "cl. 9.2", title: "Renewal notice period too long", explanation: "180 days' notice makes the exit window easy to miss. The playbook standard is 60 days.", originalText: "at least one hundred eighty (180) days before", suggestedText: "at least sixty (60) days before", playbookRuleId: R["Renewal notice"] },
    { documentId: msa.id, firmId, severity: "medium", clauseRef: "cl. 21", title: "No forum selection clause", explanation: "The agreement chooses New York law but not which courts hear disputes.", originalText: null, suggestedText: "21.2 The state and federal courts located in New York County, New York have exclusive jurisdiction over any dispute arising out of this Agreement.", playbookRuleId: R["Forum selection"] },
    { documentId: msa.id, firmId, severity: "low", clauseRef: "cl. 16.2", title: "Confidentiality survives only 2 years", explanation: "Playbook requires at least 3 years after termination.", originalText: "survive termination for two (2) years", suggestedText: "survive termination for three (3) years", playbookRuleId: R["Confidentiality survival"] },
  ]);
  await db.insert(s.documentVersions).values({ documentId: msa.id, version: 4, content: D.MSA, note: "Received from Johnson Corp", createdBy: aisha.id });

  // ── Legal research library (summaries written for this demo) ─────
  const sources: (typeof s.legalSources.$inferInsert)[] = [
    { title: "Hadley v Baxendale", citation: "(1854) 9 Exch 341", court: "Court of Exchequer", jurisdiction: "UK-EW", sourceType: "case", year: 1854, topics: ["damages", "remoteness", "contract"], summary: "Founding statement of the remoteness rule for contract damages: recoverable loss is loss arising naturally from the breach, or loss both parties could reasonably have contemplated when contracting.", content: "A mill's operations stopped because a broken crankshaft was delivered late by the carrier. The mill owners claimed lost profits. The court held the lost profits were not recoverable because the carrier had not been told that the mill could not operate without the shaft. Damages are limited to (1) loss arising naturally, in the usual course of things, from the breach, and (2) loss that may reasonably be supposed to have been in the contemplation of both parties, at the time they made the contract, as the probable result of the breach." },
    { title: "Victoria Laundry (Windsor) Ltd v Newman Industries Ltd", citation: "[1949] 2 KB 528", court: "Court of Appeal", jurisdiction: "UK-EW", sourceType: "case", year: 1949, topics: ["damages", "remoteness", "lost profits"], summary: "Restates remoteness in terms of what was reasonably foreseeable as liable to result from the breach, given the knowledge the defendant actually had or is taken to have had.", content: "A boiler for a laundry business was delivered months late. The laundry recovered the ordinary profits it would have made, which the sellers must have known would be lost, but not the exceptionally lucrative dyeing contracts the sellers knew nothing about. The case emphasises that recoverability depends on the knowledge possessed by the parties at the time of contracting." },
    { title: "Transfield Shipping Inc v Mercator Shipping Inc (The Achilleas)", citation: "[2008] UKHL 48", court: "House of Lords", jurisdiction: "UK-EW", sourceType: "case", year: 2008, topics: ["damages", "remoteness", "assumption of responsibility"], summary: "Adds an assumption-of-responsibility inquiry: in some cases the question is whether the defendant should be taken to have accepted responsibility for the type of loss claimed.", content: "Charterers returned a vessel nine days late. The owners lost a lucrative follow-on fixture because the market had fallen. The House of Lords limited damages to the difference between the market rate and the charter rate for the overrun period. Their Lordships reasoned that, according to market understanding, a charterer does not assume responsibility for the loss of a subsequent fixture." },
    { title: "Kenford Co. v. County of Erie", citation: "67 N.Y.2d 257 (1986)", court: "New York Court of Appeals", jurisdiction: "US-NY", sourceType: "case", year: 1986, topics: ["damages", "lost profits", "contemplation"], summary: "In New York, lost profits for breach of contract are recoverable only if they were within the contemplation of the parties when the contract was made and can be proved with reasonable certainty.", content: "A developer sued a county over a failed domed stadium project and sought lost profits from a projected 20-year operation. The Court of Appeals held the claimed profits too speculative and not shown to have been within the parties' contemplation at the time of contracting, so they were not recoverable." },
    { title: "Indian Contract Act, 1872 — Section 73", citation: "Indian Contract Act, 1872, s. 73", court: "Statute", jurisdiction: "IN", sourceType: "statute", year: 1872, topics: ["damages", "compensation", "remoteness"], summary: "A party suffering a breach is entitled to compensation for loss that arose naturally in the usual course of things, or that the parties knew when contracting was likely to result; remote and indirect loss is excluded.", content: "Section 73 sets out compensation for loss or damage caused by breach of contract. It mirrors the two limbs of Hadley v Baxendale: loss which naturally arose in the usual course of things from the breach, or which the parties knew, when they made the contract, to be likely to result from the breach. Compensation is not given for any remote and indirect loss or damage sustained by reason of the breach." },
    { title: "Robertson Quay Investment Pte Ltd v Steen Consultants Pte Ltd", citation: "[2008] 2 SLR(R) 623", court: "Court of Appeal", jurisdiction: "SG", sourceType: "case", year: 2008, topics: ["damages", "remoteness"], summary: "Singapore Court of Appeal confirms that the two-limb Hadley v Baxendale approach governs remoteness of damage in contract in Singapore.", content: "In a claim against consultants arising from a construction project, the Court of Appeal reviewed the English authorities on remoteness and affirmed that Singapore law applies the two-limb test from Hadley v Baxendale, as explained in later cases, when deciding whether contractual loss is too remote." },
    { title: "N.Y. U.C.C. § 2-725 — Statute of limitations in contracts for sale", citation: "N.Y. U.C.C. § 2-725", court: "Statute", jurisdiction: "US-NY", sourceType: "statute", topics: ["limitation", "sale of goods"], summary: "An action for breach of a contract for the sale of goods must generally be brought within four years after the cause of action accrues, usually on tender of delivery.", content: "Under section 2-725 of New York's Uniform Commercial Code, an action for breach of any contract for sale must be commenced within four years after the cause of action has accrued. A breach of warranty generally occurs when tender of delivery is made. For mixed goods-and-services contracts, New York courts ask whether the predominant purpose is the sale of goods." },
    { title: "N.Y. C.P.L.R. § 213(2) — Six-year limitation for contract actions", citation: "N.Y. C.P.L.R. § 213(2)", court: "Statute", jurisdiction: "US-NY", sourceType: "statute", topics: ["limitation", "contract"], summary: "Actions upon a contractual obligation or liability, other than those governed by a more specific rule, must be commenced within six years.", content: "CPLR 213(2) sets a six-year limitation period for actions upon a contractual obligation or liability, express or implied, except as provided in section 2-725 of the Uniform Commercial Code and certain other provisions." },
    { title: "N.Y. C.P.L.R. § 320(a) — Time to appear and answer", citation: "N.Y. C.P.L.R. § 320(a)", court: "Statute", jurisdiction: "US-NY", sourceType: "statute", topics: ["procedure", "answer", "deadline"], summary: "A defendant must appear within 20 days after personal delivery of the summons within New York, or within 30 days after service is complete in other cases.", content: "CPLR 320(a) governs the time to appear. Where the summons is personally delivered to the defendant within the state, the appearance is due within twenty days. Where service is made by other methods, the appearance is due within thirty days after service is complete." },
    { title: "Federal Rule of Civil Procedure 12(a) — Time to serve a responsive pleading", citation: "Fed. R. Civ. P. 12(a)", court: "Federal rule", jurisdiction: "US-FED", sourceType: "regulation", topics: ["procedure", "answer", "deadline"], summary: "A defendant must serve an answer within 21 days after being served, or within 60 days after a waiver request was sent if service was timely waived.", content: "Rule 12(a)(1)(A) requires a defendant to serve an answer within 21 days after being served with the summons and complaint, or, if it has timely waived service under Rule 4(d), within 60 days after the request for a waiver was sent." },
    { title: "Civil Procedure Rules, Part 15.4 — Period for filing a defence", citation: "CPR 15.4", court: "Civil Procedure Rules", jurisdiction: "UK-EW", sourceType: "regulation", topics: ["procedure", "defence", "deadline"], summary: "A defence is due 14 days after service of the particulars of claim, or 28 days after service if the defendant has filed an acknowledgment of service.", content: "Under CPR 15.4(1), the general period for filing a defence is 14 days after service of the particulars of claim, or, where the defendant files an acknowledgment of service under Part 10, 28 days after service of the particulars of claim." },
    { title: "Code of Civil Procedure, 1908 — Order VIII Rule 1", citation: "CPC, Order VIII, Rule 1", court: "Statute", jurisdiction: "IN", sourceType: "statute", topics: ["procedure", "written statement", "deadline"], summary: "A defendant must file a written statement within 30 days of service of summons; the court may extend this up to 90 days for recorded reasons (commercial suits have a strict outer limit of 120 days).", content: "Order VIII Rule 1 requires the defendant to present a written statement of defence within thirty days from the date of service of summons. The court may allow a later date, for reasons recorded in writing, but not later than ninety days from service. For commercial disputes, the amended provision sets an outer limit of one hundred and twenty days." },
    { title: "Arbitration and Conciliation Act, 1996 — Section 34", citation: "Arbitration and Conciliation Act, 1996, s. 34", court: "Statute", jurisdiction: "IN", sourceType: "statute", topics: ["arbitration", "setting aside", "deadline"], summary: "An application to set aside an arbitral award must be made within three months of receiving the award, extendable by up to 30 days for sufficient cause, on limited grounds.", content: "Section 34 provides the exclusive route to challenge a domestic arbitral award in India. Under section 34(3) the application must be made within three months from the date the applicant received the award; the court may entertain it within a further thirty days if satisfied there was sufficient cause, but not thereafter." },
  ];
  await db.insert(s.legalSources).values(sources);

  await db.insert(s.deadlineRules).values([
    { ruleSet: "New York · CPLR", jurisdiction: "US-NY", trigger: "Summons personally delivered within New York", resultLabel: "Appearance / answer due", amount: 20, unit: "days", citation: "CPLR 320(a)" },
    { ruleSet: "New York · CPLR", jurisdiction: "US-NY", trigger: "Summons served by any other method (service complete)", resultLabel: "Appearance / answer due", amount: 30, unit: "days", citation: "CPLR 320(a)" },
    { ruleSet: "US Federal · FRCP", jurisdiction: "US-FED", trigger: "Summons and complaint served", resultLabel: "Answer due", amount: 21, unit: "days", citation: "Fed. R. Civ. P. 12(a)(1)(A)(i)" },
    { ruleSet: "US Federal · FRCP", jurisdiction: "US-FED", trigger: "Waiver of service requested (timely waived)", resultLabel: "Answer due", amount: 60, unit: "days", citation: "Fed. R. Civ. P. 12(a)(1)(A)(ii)" },
    { ruleSet: "US Federal · FRAP", jurisdiction: "US-FED", trigger: "Entry of civil judgment or order", resultLabel: "Notice of appeal due", amount: 30, unit: "days", citation: "Fed. R. App. P. 4(a)(1)(A)", notes: "60 days where the United States or its officer/agency is a party." },
    { ruleSet: "England & Wales · CPR", jurisdiction: "UK-EW", trigger: "Particulars of claim served (no acknowledgment of service)", resultLabel: "Defence due", amount: 14, unit: "days", citation: "CPR 15.4(1)(a)" },
    { ruleSet: "England & Wales · CPR", jurisdiction: "UK-EW", trigger: "Particulars of claim served (acknowledgment of service filed)", resultLabel: "Defence due", amount: 28, unit: "days", citation: "CPR 15.4(1)(b)" },
    { ruleSet: "India · CPC", jurisdiction: "IN", trigger: "Summons served", resultLabel: "Written statement due", amount: 30, unit: "days", citation: "CPC Order VIII Rule 1", notes: "Court may extend to 90 days; commercial suits have a 120-day outer limit." },
    { ruleSet: "India · Arbitration Act", jurisdiction: "IN", trigger: "Arbitral award received", resultLabel: "Section 34 application due", amount: 3, unit: "months", rollForward: false, citation: "Arbitration and Conciliation Act 1996, s. 34(3)", notes: "Court may allow a further 30 days for sufficient cause." },
  ]);

  // ── Activity, notifications, AI usage, sample conversation ───────
  await db.insert(s.activities).values([
    { firmId, userId: aisha.id, caseId: K["CL-2026-0331"]!, clientId: C["Harlow & Finch Ltd"]!, action: "email", description: "Emailed Sarah Finch the draft pre-action response outline", createdAt: subDays(now, 3) },
    { firmId, userId: aisha.id, caseId: K["CL-2026-0331"]!, clientId: C["Harlow & Finch Ltd"]!, action: "upload", description: "Uploaded Quayside letter of claim.pdf", createdAt: subDays(now, 7) },
    { firmId, userId: daniel.id, caseId: K["CL-2026-0402"]!, clientId: C["Harlow & Finch Ltd"]!, action: "call", description: "Call with Sarah Finch on lease review scope (25 min)", createdAt: subDays(now, 10) },
    { firmId, userId: john.id, caseId: K["CV-2026-0418"]!, clientId: C["Robert Smith"]!, action: "call", description: "Call with Robert Smith about missing exhibits RS-5 and RS-6", createdAt: subDays(now, 1) },
    { firmId, userId: aisha.id, caseId: K["CV-2026-0418"]!, clientId: C["Robert Smith"]!, action: "upload", description: "Uploaded Johnson Corp_MSA_v4.docx", createdAt: subHours(0) },
    { firmId, userId: priya.id, caseId: K["ARB-2026-0112"]!, clientId: C["Mehta Industries"]!, action: "filing", description: "Filed statement of claim with the tribunal", createdAt: subDays(now, 4) },
    { firmId, userId: john.id, caseId: K["CV-2026-0377"]!, clientId: C["Elena Rossi"]!, action: "note", description: "Opposing counsel open to settlement at 70% of deposit plus repair costs", createdAt: subDays(now, 5) },
  ]);
  await db.insert(s.notifications).values([
    { userId: john.id, title: "Hearing in 6 days", body: "Smith v. Johnson Corp · hearing on motion to compel", href: `/cases/${K["CV-2026-0418"]}` },
    { userId: john.id, title: "Review finished: Johnson Corp_MSA_v4.docx", body: "4 findings, 2 high risk", href: `/documents/${msa.id}` },
    { userId: john.id, title: "Overdue: Send engagement letter", body: "Harlow & Finch · lease review", href: "/tasks" },
  ]);
  const usage: (typeof s.aiUsage.$inferInsert)[] = [];
  const feats = ["chat", "chat", "chat", "chat", "review", "draft", "draft", "research", "research"];
  for (let i = 0; i < 420; i++) {
    usage.push({ firmId, userId: people[Math.floor(rand() * people.length)]!.id, feature: feats[Math.floor(rand() * feats.length)]!, model: "claude-sonnet-5-5", inputTokens: 2000 + Math.floor(rand() * 8000), outputTokens: 300 + Math.floor(rand() * 900), createdAt: subDays(now, Math.floor(rand() * 120)) });
  }
  await db.insert(s.aiUsage).values(usage);

  const [conv] = await db.insert(s.conversations).values({ firmId, userId: john.id, title: "When is my next hearing?" }).returning();
  await db.insert(s.messages).values([
    { conversationId: conv!.id, role: "user", content: "When is my next hearing?", createdAt: subHours(1) },
    {
      conversationId: conv!.id,
      role: "assistant",
      createdAt: subHours(1),
      content: `Your next hearing is **${fmt(at(6, 9, 30))} at 9:30 AM**: the hearing on the motion to compel in **Smith v. Johnson Corp** [S1].\n\n- **Where:** 60 Centre Street, New York · Part 53, Courtroom 228\n- **Before:** Hon. [JUDGE NAME]\n- **Watch out:** exhibits RS-5 and RS-6 are still missing from the hearing bundle, and Sam's task to obtain them is due ${fmt(at(4, 12))} [S2].\n\nAfter that, you have a settlement conference in **Rossi v. Meridian Rentals** on ${fmt(at(7, 11))} at 11:00 AM [S3].`,
      sources: [
        { ref: "S1", kind: "event", title: "Hearing on motion to compel", subtitle: "Smith v. Johnson Corp", href: `/cases/${K["CV-2026-0418"]}` },
        { ref: "S2", kind: "task", title: "Obtain exhibits RS-5 and RS-6 for hearing bundle", subtitle: "Smith v. Johnson Corp", href: "/tasks" },
        { ref: "S3", kind: "event", title: "Settlement conference", subtitle: "Rossi v. Meridian Rentals", href: `/cases/${K["CV-2026-0377"]}` },
      ],
      toolCalls: [{ name: "get_schedule", input: { types: ["hearing"] } }],
    },
  ]);

  // RAG indexing (embeddings, chunking) happens in the Python AI service: `npm run ai:index` (db:seed runs it).
  console.log(`Seeded ${docs.length} documents (pending ingestion).`);

  console.log("\nDone. Sign in at /login with:");
  console.log("  john@demo.law / demo1234   (admin — sees every matter)");
  console.log("  aisha@demo.law / demo1234  (associate — only her matters)");
  console.log("  sam@demo.law / demo1234    (paralegal — 2 matters; try asking about Mehta to see access control)");
  process.exit(0);
}

function subHours(h: number) {
  return addHours(now, -h);
}
function fmt(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


