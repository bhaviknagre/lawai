import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  numeric,
  vector,
  index,
  uniqueIndex,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";

/** Embedding size. voyage-law-2 = 1024. Change here + EMBEDDING_DIMENSIONS together. */
export const EMBEDDING_DIMS = 1024;

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ─── Enums ──────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("user_role", ["admin", "attorney", "paralegal"]);
export const priorityEnum = pgEnum("priority", ["high", "medium", "low"]);
export const caseStatusEnum = pgEnum("case_status", ["active", "on_hold", "closed"]);
export const clientTypeEnum = pgEnum("client_type", ["company", "individual", "trust", "estate"]);
export const eventTypeEnum = pgEnum("event_type", ["hearing", "deadline", "meeting", "internal"]);
export const taskStatusEnum = pgEnum("task_status", ["open", "done"]);
export const docStatusEnum = pgEnum("doc_status", ["draft", "in_review", "final", "signed", "filed"]);
export const ingestStatusEnum = pgEnum("ingest_status", ["pending", "processing", "ready", "failed"]);
export const severityEnum = pgEnum("severity", ["high", "medium", "low"]);
export const issueStatusEnum = pgEnum("issue_status", ["open", "accepted", "dismissed"]);
export const sourceTypeEnum = pgEnum("source_type", ["case", "statute", "regulation", "commentary"]);
export const msgRoleEnum = pgEnum("message_role", ["user", "assistant"]);

// ─── Tenancy & identity ────────────────────────────────────────────────
export const firms = pgTable("firms", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Jurisdiction codes enabled for this firm (FK-by-convention to jurisdictions.code). */
  jurisdictions: text("jurisdictions").array().notNull().default(sql`'{}'::text[]`),
  /** Minutes saved per AI action, used for the ROI estimate on Reports. */
  aiMinutesSaved: jsonb("ai_minutes_saved")
    .$type<Record<string, number>>()
    .notNull()
    .default({ chat: 6, review: 45, draft: 20, research: 30 }),
  /** Set by a LawAI operator (e.g. unpaid invoice). Nobody in the firm can sign in until it's cleared; data is kept. */
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
  /** Commercial terms, set by a LawAI operator on /platform. See src/lib/subscriptions.ts. */
  plan: text("plan").$type<"trial" | "starter" | "professional" | "enterprise">().notNull().default("trial"),
  /** Most active + invited people the firm pays for. Null = unlimited. */
  seatLimit: integer("seat_limit"),
  /** Monthly fee in whole currency units (BILLING_CURRENCY). */
  monthlyFee: integer("monthly_fee").notNull().default(0),
  /** When the current trial or paid term ends. Null = no end date. Nothing is blocked automatically. */
  subscriptionEndsAt: timestamp("subscription_ends_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("attorney"),
    title: text("title").notNull().default("Attorney"),
    color: text("color").notNull().default("#2A3858"),
    weeklyTargetHours: integer("weekly_target_hours").notNull().default(32),
    /** LawAI operator: can open /platform to onboard firms. Never set through the app. */
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    /** When the person first set their own password. Null = invited, hasn't accepted yet. */
    activatedAt: timestamp("activated_at", { withTimezone: true }).defaultNow(),
    /** Deactivated users can't sign in. Rows are kept because time, tasks and documents reference them. */
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the cookie token — raw tokens are never stored. */
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** One-time links that let a person set their password: invites and admin-issued resets. */
export const userTokens = pgTable(
  "user_tokens",
  {
    /** sha256 of the token in the link — raw tokens are never stored. */
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<"invite" | "reset">().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("user_tokens_user_idx").on(t.userId)],
);

export const jurisdictions = pgTable("jurisdictions", {
  code: text("code").primaryKey(), // e.g. US-NY
  name: text("name").notNull(), // New York
  short: text("short").notNull(), // US·NY
  country: text("country").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
});

// ─── Practice ──────────────────────────────────────────────────────────
export const clients = pgTable(
  "clients",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: clientTypeEnum("type").notNull(),
    location: text("location"),
    email: text("email"),
    phone: text("phone"),
    primaryContact: text("primary_contact"),
    contactTitle: text("contact_title"),
    billing: text("billing"),
    clientSince: date("client_since"),
    conflictCheckedAt: date("conflict_checked_at"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("clients_firm_idx").on(t.firmId)],
);

export const cases = pgTable(
  "cases",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    title: text("title").notNull(),
    caseNumber: text("case_number").notNull(),
    practiceArea: text("practice_area").notNull(),
    jurisdiction: text("jurisdiction").notNull().references(() => jurisdictions.code),
    court: text("court"),
    stage: text("stage").notNull().default("Intake"),
    priority: priorityEnum("priority").notNull().default("medium"),
    status: caseStatusEnum("status").notNull().default("active"),
    opposingParty: text("opposing_party"),
    opposingCounsel: text("opposing_counsel"),
    description: text("description"),
    openedAt: date("opened_at").notNull().defaultNow(),
    closedAt: date("closed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("cases_firm_idx").on(t.firmId, t.status),
    uniqueIndex("cases_number_idx").on(t.firmId, t.caseNumber),
  ],
);

export const caseMembers = pgTable(
  "case_members",
  {
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // lead | member
  },
  (t) => [primaryKey({ columns: [t.caseId, t.userId] })],
);

export const events = pgTable(
  "events",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: eventTypeEnum("type").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    judge: text("judge"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("events_firm_time_idx").on(t.firmId, t.startsAt)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: uuid("assignee_id").references(() => users.id),
    dueAt: timestamp("due_at", { withTimezone: true }),
    priority: priorityEnum("priority").notNull().default("medium"),
    status: taskStatusEnum("status").notNull().default("open"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("tasks_firm_idx").on(t.firmId, t.status, t.dueAt)],
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
    workDate: date("work_date").notNull(),
    hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
    billable: boolean("billable").notNull().default(true),
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [index("time_firm_date_idx").on(t.firmId, t.workDate)],
);

// ─── Documents & RAG ───────────────────────────────────────────────────
export const documents = pgTable(
  "documents",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("Other"),
    mimeType: text("mime_type").notNull().default("text/plain"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    storageKey: text("storage_key"),
    status: docStatusEnum("status").notNull().default("draft"),
    ingestStatus: ingestStatusEnum("ingest_status").notNull().default("pending"),
    ingestError: text("ingest_error"),
    pageCount: integer("page_count"),
    /** Full extracted text. Source of truth for in-app editing + review. */
    content: text("content"),
    /** Character offset where each page starts (PDFs). */
    pageOffsets: jsonb("page_offsets").$type<number[]>(),
    summary: text("summary"),
    version: integer("version").notNull().default(1),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("documents_firm_idx").on(t.firmId, t.updatedAt)],
);

export const documentVersions = pgTable("document_versions", {
  id: id(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: id(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    firmId: uuid("firm_id").notNull(),
    /** Denormalised so permission filters don't need a join. */
    caseId: uuid("case_id"),
    chunkIndex: integer("chunk_index").notNull(),
    heading: text("heading"),
    pageNumber: integer("page_number"),
    content: text("content").notNull(),
    /** Contextual-retrieval note written by the LLM at ingestion. */
    context: text("context"),
    tokenCount: integer("token_count").notNull().default(0),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMS }),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(context,'') || ' ' || coalesce(heading,'') || ' ' || content)`,
    ),
  },
  (t) => [
    index("chunks_doc_idx").on(t.documentId),
    index("chunks_scope_idx").on(t.firmId, t.caseId),
    index("chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("chunks_tsv_idx").using("gin", t.tsv),
  ],
);

export const playbookRules = pgTable("playbook_rules", {
  id: id(),
  firmId: uuid("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
  playbook: text("playbook").notNull(),
  documentKind: text("document_kind").notNull(), // matches documents.kind
  title: text("title").notNull(),
  rule: text("rule").notNull(),
  severity: severityEnum("severity").notNull().default("medium"),
  createdAt: createdAt(),
});

export const documentIssues = pgTable(
  "document_issues",
  {
    id: id(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    firmId: uuid("firm_id").notNull(),
    severity: severityEnum("severity").notNull(),
    clauseRef: text("clause_ref"),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    originalText: text("original_text"),
    suggestedText: text("suggested_text"),
    status: issueStatusEnum("status").notNull().default("open"),
    playbookRuleId: uuid("playbook_rule_id").references(() => playbookRules.id, { onDelete: "set null" }),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("issues_doc_idx").on(t.documentId, t.status)],
);

export const legalSources = pgTable(
  "legal_sources",
  {
    id: id(),
    title: text("title").notNull(),
    citation: text("citation").notNull(),
    court: text("court"),
    jurisdiction: text("jurisdiction").notNull().references(() => jurisdictions.code),
    sourceType: sourceTypeEnum("source_type").notNull(),
    year: integer("year"),
    topics: text("topics").array().notNull().default(sql`'{}'::text[]`),
    summary: text("summary").notNull(),
    content: text("content").notNull(),
    url: text("url"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMS }),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`to_tsvector('english', title || ' ' || citation || ' ' || summary || ' ' || content)`,
    ),
    createdAt: createdAt(),
  },
  (t) => [
    index("sources_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("sources_tsv_idx").using("gin", t.tsv),
  ],
);

export const deadlineRules = pgTable("deadline_rules", {
  id: id(),
  ruleSet: text("rule_set").notNull(), // "New York · CPLR"
  jurisdiction: text("jurisdiction").notNull().references(() => jurisdictions.code),
  trigger: text("trigger").notNull(), // "Summons served by personal delivery"
  resultLabel: text("result_label").notNull(), // "Answer due"
  amount: integer("amount").notNull(),
  unit: text("unit").notNull().default("days"), // days | months
  rollForward: boolean("roll_forward").notNull().default(true),
  citation: text("citation").notNull(),
  notes: text("notes"),
});

// ─── Assistant ─────────────────────────────────────────────────────────
export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("conv_user_idx").on(t.userId, t.updatedAt)],
);

export type MessageSource = {
  ref: string;
  kind: "document" | "case" | "event" | "task" | "client" | "legal" | "rule";
  title: string;
  subtitle?: string;
  href?: string;
  snippet?: string;
};

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: msgRoleEnum("role").notNull(),
    content: text("content").notNull(),
    sources: jsonb("sources").$type<MessageSource[]>().notNull().default([]),
    toolCalls: jsonb("tool_calls").$type<{ name: string; input: unknown }[]>().notNull().default([]),
    feedback: integer("feedback"), // 1 / -1
    createdAt: createdAt(),
  },
  (t) => [index("messages_conv_idx").on(t.conversationId, t.createdAt)],
);

export const researchQueries = pgTable("research_queries", {
  id: id(),
  firmId: uuid("firm_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  jurisdictions: text("jurisdictions").array().notNull().default(sql`'{}'::text[]`),
  answer: text("answer"),
  createdAt: createdAt(),
});

// ─── Ops / compliance ──────────────────────────────────────────────────
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notif_user_idx").on(t.userId, t.readAt)],
);

/** Append-only audit trail: who did what, on which matter. */
export const activities = pgTable(
  "activities",
  {
    id: id(),
    firmId: uuid("firm_id").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    description: text("description").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("activities_firm_idx").on(t.firmId, t.createdAt)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    firmId: uuid("firm_id").notNull(),
    userId: uuid("user_id"),
    feature: text("feature").notNull(), // chat | review | draft | research | ingest
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_firm_idx").on(t.firmId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Case = typeof cases.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Document = typeof documents.$inferSelect;
