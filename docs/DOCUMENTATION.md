# LawAI Documentation

LawAI is a matter-centric legal AI workspace for small and mid-size law firms, India first, whose answers and citations are verifiable. It combines matters, clients, documents, a calendar, tasks and time entries with AI features (document Q&A with citations, playbook-based contract review, drafting, legal research and deadline calculation). Access to everything, including every AI tool, follows matter staffing. This document is a set of rules and an explanation of the features: what exists today, what is planned, and the rules that bind both.

> Objective (confirmed by the product owner, 2026-10-19): LawAI is a matter-centric legal AI workspace for small and mid-size law firms, India first, whose answers and citations are verifiable.

Related files: [SPEC.md](../SPEC.md) (requirements, with stable FR/NFR/AC IDs), `docs/ARCHITECTURE.md`, `docs/features.html` and `docs/usp-ideas.html` (the sources of this document).

## Contents

1. [Roles](#roles)
2. [Project rules](#project-rules)
3. [Current features](#current-features)
4. [Known limitations](#known-limitations)
5. [Planned features](#planned-features)
6. [Competitive landscape](#competitive-landscape)
7. [Open questions](#open-questions)
8. [Contributing](#contributing)

## Roles

| Role | Description | Status |
|---|---|---|
| Platform operator | Runs the service across firms: onboards firms (each firm admin then creates its attorneys, associates and paralegals), manages plans, seats, suspension and renewals, and platform-level data. | Existing |
| Firm admin | Manages users, staffing, playbook rules, firm settings and sees every matter in the firm. Is the approver for client portal updates and playbook rules; there is no separate Partner role. | Existing |
| Attorney | Works on staffed matters; can open matters, set status, finalise or delete documents, see reports, and reviews and approves AI output. | Existing |
| Paralegal | Prepares documents, tasks and deadlines on staffed matters; limited to draft/in-review document statuses; cannot see firm reports. | Existing |
| End-client | Read-only portal user who sees only firm-admin-approved updates for their own matters; also receives firm-admin-approved hearing reminders and updates by email or WhatsApp. | Planned (Features 9, 11, 16) |

Matter access equals staffing (`case_members`), except that admins see every matter. This is enforced in `src/lib/access.ts` and `ai/lawai_ai/access.py`.

## Project rules

These rules bind every feature, current and planned. RULE-1 to RULE-5 are product invariants. RULE-8 and RULE-9 are further binding rules from [SPEC.md](../SPEC.md).

| ID | Rule |
|---|---|
| RULE-1 | The AI never presents an unverified citation as verified. A Verified label is set only by deterministic code that finds the authority and, for quotes, the exact text; never by the model. |
| RULE-2 | The AI drafts; a human approves anything that leaves the firm or changes a calendar, task, time entry or bill. |
| RULE-3 | Tenant isolation. No data crosses firms, and within a firm no data crosses matters the user is not staffed on. The filter is applied in the same query as retrieval. |
| RULE-4 | The client portal shows only firm-admin-approved content for the client's own matters. |
| RULE-5 | Secrets are never stored in the repository. Configuration comes from environment variables; `.env` files stay git-ignored. |
| RULE-8 | Every AI-derived statement shown to a user links to its source or is omitted. Machine translations are labelled and never count as verification. |
| RULE-9 | Learned firm rules apply only after approval, and only within the firm that produced them. |

Process rules (commit messages, repository hygiene) are under [Contributing](#contributing).

## Current features

54 features were found in the code. Status values: **Working** (implemented end to end), **Partial** (works with known limits). No feature is currently demo-only. Roles abbreviations: Admin = firm admin, Atty = attorney, Para = paralegal, Op = platform operator.

### Auth and access (5)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Email and password login | Database-backed sessions (hashed token, httpOnly cookie). Suspended firms and deactivated users cannot sign in. | All roles | A lawyer signs in each morning; a firm that stopped paying is locked out. | `/login` | Working |
| Sign out | Sign-out button in the sidebar and in the header on small screens. | All roles | Log out of a shared office computer. | Sidebar / header | Working |
| Invite link and password setup | One-time invite link to set a first password; the same page handles password-reset links. Links are copied manually; no email is sent. | All roles | A new associate sets a password from the link the admin shares. | `/invite/[token]` | Working |
| Matter-level access control | Admins see every matter; attorneys and paralegals only matters they are staffed on. Applied to queries, pages, file downloads, search and every AI tool. | Admin, Atty, Para | A paralegal asking the assistant about a matter they are not on gets nothing back. | `src/lib/access.ts` | Working |
| Role permissions | Three firm roles. Admin and attorney open matters, set staffing and status, finalise or delete documents and see reports. Only admin manages the team, firm settings and playbook. | Admin, Atty, Para | Paralegals prepare drafts but cannot mark a contract final or see firm revenue. | `src/lib/permissions.ts` | Working |

### Dashboard and search (4)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Dashboard | Greeting, KPIs with period deltas, active matters ordered by next event, 14-day agenda, computed insights (open review findings, overdue tasks, failed uploads), recent documents and an Ask LawAI box. Operators are redirected to the platform console. | Admin, Atty, Para | Start the day seeing today's hearings and what needs attention. | `/` | Working |
| Global search | Searches cases, clients and the full text of documents from the header search box. | Admin, Atty, Para | Find every document mentioning a case number or party name. | `/search` | Working |
| Notifications bell | Latest 8 notifications with an unread count and mark-all-read. Which events create notifications was not traced. | Admin, Atty, Para | See that a review finished or a task was assigned. | Header | Working |
| Subscription banner | In-app banner when the firm's term ends within 14 days. | Admin | Reminder to renew before service lapses. | Header | Working |

### AI Assistant (5)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Streaming chat with citations | Streams answers (NDJSON) from an agent loop with tool use. Answers cite sources as [S1], [S2] chips that open the exact clause. Needs an LLM provider key; without it AI features show a configure notice. | Admin, Atty, Para | Ask what an MSA says about liability and click through to the clause. | `/assistant`, `POST /api/chat` | Working |
| Chat / Draft / Research modes | Mode switch: chat over the firm's data, draft clauses/letters/emails grounded in files, or research with jurisdiction citations. | Admin, Atty, Para | Move from a question to drafting a reply email in one place. | `/assistant` | Working |
| Scope to a matter or document | Open the assistant pre-scoped to one case or document (`?doc=`), limiting what it reads. | Admin, Atty, Para | "Ask about this document" from a contract page. | `/assistant?doc=...` | Working |
| Saved conversations and feedback | Conversations are stored and can be deleted; each answer can be rated thumbs up or down. | Admin, Atty, Para | Return to yesterday's research thread; flag a bad answer. | `/assistant` | Working |
| Agent tools (10) | `search_documents`, `get_schedule`, `list_tasks`, `find_cases`, `get_case`, `find_clients`, `get_client`, `get_document_issues`, `search_legal_sources`, `calculate_deadline`. Structured facts (dates, names) come from the database, not vector search. | Admin, Atty, Para | "When is my next hearing?" is answered exactly from the calendar table. | `ai/lawai_ai/agent/tools.py` | Working |

### AI engine, Python service (9)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Document ingestion pipeline | Parses PDF (page-aware) and DOCX/TXT/MD, structure-aware clause chunking, optional contextual notes per chunk, embeddings into pgvector, plus a full-text index. Scanned PDFs are not supported. | System | Uploaded contracts become searchable and citable minutes after upload. | `POST /ingest`, `ai/lawai_ai/rag/` | Working |
| Hybrid retrieval and rerank | Vector search plus Postgres full-text, fused with reciprocal rank fusion, clause-number boost and rerank. Falls back to full-text only when no embedding key is set. | System | Both "clause 9.2" and paraphrased questions work. | `POST /search`, `rag/search.py` | Working |
| Playbook review engine | The AI model flags clauses against the firm's playbook rules; quotes are verified verbatim; findings are stored as issues. | System | Catch an uncapped liability clause automatically. | `POST /review`, `review.py` | Working |
| Drafting engine | Generates text grounded in the matter's documents; usage is logged. | System | Draft a clause or letter from firm context. | `POST /draft`, `draft.py` | Working |
| Research engine | Searches the authorities library and answers citing only retrieved authorities, grouped by jurisdiction; stores the query. The library is a small seeded set, not verified legal data. | System | Compare how two jurisdictions treat a limitation period. | `POST /research`, `research.py` | Partial |
| Deadline rules engine | Computes due dates from a trigger date and per-jurisdiction rules; weekends roll forward. No court-holiday calendar yet. | System | Calculate the date to answer a complaint served today. | `agent/deadlines.py` | Partial |
| Index and ingest CLI | Commands to ingest pending/all documents and embed the legal-sources library. | System | Re-index after adding API keys. | `cli.py`, `npm run ingest:pending` | Working |
| Scheduled ingestion retry | Cron endpoint protected by `CRON_SECRET` retries stuck or failed ingestion. Runs in-process with a cron retry; no job queue. | System | A document that failed to index is picked up automatically. | `GET /api/cron/ingest` | Working |
| Internal AI service API | Token-protected FastAPI endpoints (health, status, chat, search, research, review, draft, ingest). Never called from the browser; user matters are re-derived from the database. | System | Keeps the AI service private. | `ai/lawai_ai/api.py`, `/api/internal/files` | Working |

### Matters (5)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Case list | Filterable, paginated list of matters you can access. | Admin, Atty, Para | Find all open matters for a practice area. | `/cases` | Working |
| Create case | Open a new matter and staff the team (creator becomes lead). | Admin, Atty | Intake of a new litigation matter. | `/cases/new` | Working |
| Case detail | Overview, upcoming events, open tasks, documents, status, team, time logging and activity log. | Admin, Atty, Para | One screen with everything before a hearing. | `/cases/[id]` | Working |
| Edit case and staffing | Update stage, priority, court; attorneys/admins can change status (hold/close), team and lead. Paralegals can edit stage, priority and court only. | Admin, Atty, Para | Reassign a matter when an associate leaves. | `/cases/[id]` | Working |
| Time logging | Log billable hours against a matter. Hours feed reports; no invoicing exists. | Admin, Atty, Para | Record 1.5h of drafting for billing and utilisation. | `/cases/[id]` | Working |

### Clients (2)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Client list and create | List clients and add new ones. | Admin, Atty, Para | Add a new client at intake. | `/clients`, `/clients/new` | Working |
| Client detail | Contact details, accessible matters, logged activity timeline; edit and log activity (calls, notes). Clients are records only; there is no client portal yet. | Admin, Atty, Para | Note a call with a client for the file. | `/clients/[id]` | Working |

### Tasks and calendar (4)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Task list and calendar | Month calendar plus grouped open-task list; complete or reopen tasks. | Admin, Atty, Para | See this week's filings and hearings. | `/tasks` | Working |
| Add task / event | Create tasks (assignee, priority, due date) and calendar events linked to matters; delete events. | Admin, Atty, Para | Schedule a hearing and assign prep tasks. | `/tasks` | Working |
| Court-deadline calculator | Calculates a deadline from a trigger date using database rules with weekend roll-forward (same engine as the AI tool). No court holidays. | Admin, Atty, Para | Work out the response deadline after service. | `/tasks` | Partial |
| Urgent badge | Sidebar badge counts open high-priority or due-within-3-days tasks. | Admin, Atty, Para | At-a-glance workload. | Sidebar | Working |

### Documents (6)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Library and upload | List and upload PDF/DOCX/TXT/MD files; ingestion runs automatically. | Admin, Atty, Para | Upload a signed contract to a matter. | `/documents`, `POST /api/documents/upload` | Working |
| Document viewer | Text view with status, kind, version and size; ask-about-this-document, download, retry failed ingestion. | Admin, Atty, Para | Read a contract and jump to a cited clause. | `/documents/[id]`, `GET /api/documents/[id]/file` | Working |
| Playbook AI review | Run review against the firm's playbook; issues flagged per clause; accept (creates a new version and re-indexes) or dismiss. | Admin, Atty, Para | Redline a vendor contract before the senior attorney sees it. | `/documents/[id]`, `POST /api/documents/[id]/review` | Working |
| Versions and editing | Edit text, save new versions, restore an earlier version, append AI-drafted text. | Admin, Atty, Para | Roll back after a bad edit. | `/documents/[id]` | Working |
| Document status | Draft, in review, final, signed, filed. Paralegals limited to draft/in review. | Admin, Atty, Para | Mark a contract signed. | `/documents/[id]` | Working |
| Delete document | Remove a document. | Admin, Atty | Remove a wrongly uploaded file. | `/documents/[id]` | Working |

### Drafting, research and reports (3)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Drafting and review hub | Lists documents in draft or review and creates new AI-drafted documents. | Admin, Atty, Para | Draft an NDA from a short prompt and save it to a matter. | `/drafting`, `POST /api/draft` | Working |
| Legal research | Hybrid search over a legal-sources library filtered by jurisdiction, with a cited AI summary and recent research history. Seeded sample library only. | Admin, Atty, Para | Quick check of authorities on a point of law. | `/research`, `POST /api/research` | Partial |
| Reports | Quarter / last quarter / YTD: billable hours per week, open matters by practice area, utilisation vs weekly target, LawAI usage and hours saved. Hours saved uses admin-set assumptions, not measured time. | Admin, Atty | A firm admin reviews utilisation and ROI of the AI. | `/reports` | Working |

### Settings and firm admin (4)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Profile | Edit name, title, weekly billable target and password. | Admin, Atty, Para | Change your password. | `/settings` | Working |
| Team management | Invite members, resend invite, reset password, change role, deactivate/reactivate. Seat limit is set by the platform operator. | Admin | Onboard a paralegal; revoke access when they leave. | `/settings` | Working |
| Firm settings | Firm name, practice jurisdictions, AI minutes-saved assumptions. | Admin | Set jurisdictions so research is filtered correctly. | `/settings` | Working |
| Playbook rules | Add or delete review rules (title, document type, severity, rule text). Other roles see rules read-only. | Admin | Encode "payment terms must be 30 days or less". | `/settings` | Working |

### Platform operator (7)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Platform overview | Customer firms, seats, revenue, renewals and top AI usage. | Op | See revenue and who is up for renewal. | `/platform` | Working |
| Firms list and CSV export | All firms with plan, renewal date, seats, team, usage; filter and export as CSV. | Op | Export for invoicing. | `/platform/firms`, `/platform/firms/export` | Working |
| Onboard a firm | Create a firm and invite its first admin via a link. | Op | Sign up a new customer. | `/platform/firms/new`, `POST /api/platform/firms` | Working |
| Firm detail and subscription | Seats, team counts, cases, documents, 30-day AI actions and tokens; edit plan (trial/starter/professional/enterprise), seat limit, monthly fee, end date; renew by months. Billing is manual; no payment processor. | Op | Upgrade a trial to a paid plan. | `/platform/firms/[id]` | Working |
| Suspend / restore firm | Stop service with a private reason, or restore. Suspended firms cannot sign in. | Op | Stop service for an unpaid invoice. | `/platform/firms/[id]`, `/api/platform/firms/[id]/suspend`, `/restore` | Working |
| Firm admin invites | Invite additional admins or issue a new invite link. | Op | A customer's admin lost their link. | `/platform/firms/[id]`, `/api/platform/firms/[id]/admins` | Working |
| Renewals | Firms grouped by when the trial or term ends; nothing switches off automatically. | Op | Chase renewals. | `/platform/renewals` | Working |

## Known limitations

- No client login or portal; clients exist only as records.
- Scanned PDFs are not supported (no OCR); ingestion rejects PDFs without a text layer.
- The legal-sources library is a small seeded set and is not verified legal data. Real sources need to be licensed.
- The deadline engine has no court-holiday calendar; only weekends roll forward.
- Invite and reset links are copied manually; no email delivery was found in the code.
- Billing is manual; there is no payment processor, and no invoicing (logged hours feed reports only).
- "Hours saved" in reports uses admin-set assumptions, not measured time.
- Ingestion retries run in-process with a cron endpoint; there is no job queue.
- Which events create notifications was not traced. The only notification written today is the "review finished" one (`src/app/api/documents/[id]/review/route.ts`); the `notifications` table has no firm, type or channel column, users have no phone number, hearings have no courtroom or address field, and the only scheduler is one daily cron at 03:00 UTC, so no hearing reminder can be sent yet (Feature 11).
- AI features need an LLM provider key; retrieval falls back to full-text only without an embedding key.

## Planned features

Sixteen features make LawAI trustworthy and India-ready, and ready for other countries. All are **Planned**; none is built. Features 11 to 16 were added on 2026-10-19 (Hearing reminders at the owner's request; Features 12 to 16 after a gap check against Indian and global competitors, below) and the specification awaits the owner's re-approval. Requirement IDs (FR, NFR, AC) and non-goals for each are in [SPEC.md](../SPEC.md). The table below is in build order. Features 1 to 10 keep the order the product owner decided on 2026-10-19: trust first, then the local moat, then workflows that reuse those foundations, with the heaviest ML/OCR work last. Features 11 to 16 are slotted in without changing that relative order. Hearing reminders come right after the Cite-Proof ledger because they are the cheapest feature (hearing data, notifications and email already exist), a daily-use hook, and they create the scheduler and delivery log that Features 12, 16 and 4 reuse. The # column is the build position; the Feature label in parentheses is the stable number used in SPEC.md.

| # | Feature | What | Who | Why it differentiates | Requirements | Status |
|---|---|---|---|---|---|---|
| 1 | Cite-Proof ledger (Feature 1) | Every claim and citation in an AI answer, draft or review gets a Verified or Unverified label set by deterministic code, with an exportable verification certificate (PDF) that goes stale if the document changes. | Attorneys, paralegals; admins set certificate policy | Others market "grounded" answers but show no per-claim result; one study found 17-33% hallucination even in leading tools. Quote checking already exists in `review.py`. | FR-1 to FR-5 | Planned |
| 2 | Hearing reminders (Feature 11) | An automatic reminder the day before each hearing (optionally again that morning) with matter, date, time, court, courtroom, address and map link, judge, what to bring and who is attending. Goes to the staffed attorney and paralegal, and to the client only after firm-admin approval. In-app, email and WhatsApp/SMS; uses the matter's time zone; re-sent on a reschedule, cancelled on adjournment; delivery status recorded; per-channel opt-out. The reminder is the alert; Feature 4's brief is the prep pack. | Attorneys and paralegals (receive); firm admins (approve client copies); clients (receive approved copy) | A missed or mis-timed appearance is the costliest mistake, and unavailability of counsel is the top delay cause in district courts (NJDG). Cheap on existing events, notifications and email code. | FR-53 to FR-62 | Planned |
| 3 | Jurisdiction Packs, India first (Feature 2) | A pluggable per-country pack of statutes, limitation rules and court holidays from free official government sources. The India pack (first) uses India Code and official court holiday lists, adds Indian limitation and CPC/CrPC deadline rules and an IPC to BNS (also CrPC to BNSS, Evidence Act to BSA) mapping. Every record carries provenance and lawyer review; other countries are added the same way. | Attorneys, paralegals; platform operator maintains packs | Global leaders are US/UK-first; Indian rivals focus on research or contract management, not matter workflow. A defensible local moat that can follow firms into other countries. | FR-6 to FR-10 | Planned |
| 4 | Service-to-calendar autopilot (Feature 3) | On upload of a notice, summons or order, extract dates with source quotes, compute deadlines and propose tasks and events for the staffed team. Nothing is written until a human confirms. | Paralegals, attorneys | Joins document ingestion to the deadline engine and staffing, which only a matter-centric product can do. | FR-11 to FR-15 | Planned |
| 5 | Court-date watch (Feature 12) | Daily check of each linked matter's next date and cause-list position from the court's public sources, with manual import as a fallback. A change becomes a proposal to update the calendar; a person confirms, which triggers Feature 11. | Attorneys and paralegals (confirm); firm admins; platform operator (sources) | Table stakes among Indian practice tools; here every change is a reviewed, source-shown proposal tied to staffing, deadlines and reminders. Data access to eCourts is the main unknown. | FR-63 to FR-69 | Planned |
| 6 | Hearing-day brief (Feature 4) | A one-page, source-linked brief per upcoming hearing: summary, last order, open tasks, deadlines, key documents and cited authorities. | Attorney appearing, paralegals | Competitors answer questions; few push a ready brief proactively. | FR-16 to FR-20 | Planned |
| 7 | Order and adjournment ledger (Feature 13) | Each uploaded order becomes one ledger line: date, what happened, next date, directions, adjournment count, with a one-line summary linked to the source page and a verbatim quote check. | Attorneys and paralegals | Answers 'what happened last time and how many adjournments' in seconds, with sources; feeds the 'last order' in Feature 4. | FR-70 to FR-75 | Planned |
| 8 | AI time capture (Feature 8) | Drafts billable time entries from the day's activity, with evidence, for the lawyer to edit and approve. | Attorneys, paralegals; admins for billing | Billing vendors capture time but not from AI conversations and documents tied to matters. | FR-36 to FR-40 | Planned |
| 9 | Ethical-wall receipts (Feature 5) | Per-matter report of what the AI could and did access, built from an append-only, hash-chained log, with proof that staff outside the matter were excluded and the model providers that processed content. | Firm admins, data protection contact | Access control is rarely demonstrable per answer; supports DPDP Act 2023 questions from clients. | FR-21 to FR-25 | Planned |
| 10 | Conflict check at intake (Feature 15) | Fuzzy search of client, opposing party and counsel names across the firm's records before taking a matter; hits show name, role, matter and lead only; a firm admin resolves each hit. Needs a narrow, logged exception to the within-firm matter filter, pending owner approval. | Attorneys and paralegals; firm admins (resolve) | Replaces a bare date field with a recorded check; handles spelling and name-order variants. Visible daily safeguard that small firms lack. | FR-82 to FR-87 | Planned |
| 11 | Client status portal (Feature 9) | Read-only portal with firm-admin-approved, plain-language updates, the next hearing date and shared documents. Introduces the end-client role. | End-clients (read); attorneys (author), firm admins (approve) | Enterprise tools are lawyer-only; approved updates reduce status calls without exposing the workspace. | FR-41 to FR-45 | Planned |
| 12 | Client updates on WhatsApp (Feature 16) | Approved portal updates and approved hearing reminders delivered to the client's WhatsApp number from the firm's business number. One-way; consent and STOP honoured; replies go to staff, not to AI. | Clients (receive); attorneys (author); firm admins (approve) | Reaches clients where they are, with a logged approval trail instead of personal phones. Narrowed from an AI assistant to respect the no-client-chat non-goal. | FR-88 to FR-92 | Planned |
| 13 | Courtroom-ready export (Feature 10) | Export a draft to DOCX/PDF in court format with an index and a Table of Authorities built only from Verified citations. Per-court format profiles: Supreme Court of India first, then Delhi High Court, then Bombay High Court. | Attorneys finalising filings | Few tools output paginated, cite-checked drafts. Depends on Feature 1. | FR-46 to FR-50 | Planned |
| 14 | Court-fee and stamp-duty calculator (Feature 14) | Computes court fee and stamp duty from a lawyer-reviewed rule table in the Jurisdiction Pack, showing slabs, arithmetic and the statute cited. Deterministic; no model decides the number. | Attorneys and paralegals | Fees and duty differ by state; a cited, checkable calculation replaces notebooks and guesswork. Delhi and Maharashtra suggested first. | FR-76 to FR-81 | Planned |
| 15 | Firm-memory playbooks (Feature 6) | Learns from accepted and dismissed review issues and proposes playbook rules; the firm admin approves each rule before it applies. No model retraining. | Attorneys (feedback), firm admins (approval) | Competitors ship generic playbooks; few learn from the firm's own edits. | FR-26 to FR-30 | Planned |
| 16 | Hindi/English documents (Feature 7) | OCR for scanned pages, cross-language retrieval, and summaries labelled as machine translations. Citations always refer to original-language text. | Everyone handling Indian court papers | Western tools handle Indian languages weakly; Indian tools rarely combine them with firm-private retrieval. Removes the current scanned-PDF limitation. | FR-31 to FR-35 | Planned |

Cross-cutting requirements (FR-51, FR-52, NFR-21, AC-31) enforce human approval, firm and matter filtering, and no committed secrets across all sixteen features. Global non-goals: no legal advice, outcome prediction or court filing; no certification that cited authority is good law; no client-facing AI chat, billing or payments; no model fine-tuning on client data; packs for countries other than India and languages other than Hindi and English are out of scope for this release (the pluggable pack format is in scope).

### Why Features 11 to 16 were added, and what was rejected

Research on 2026-10-19 (Genesis records DECISION-bd89e06d, DECISION-27fee276, KNOWLEDGE-d41f2d01, KNOWLEDGE-77db087b, KNOWLEDGE-803278e6). Vendor claims below are self-reported.

- **Indian practice tools already sell court-date tracking and WhatsApp.** CLAW, Provakil, VakeelSaathi, KanoonKit and India Case Status advertise cause-list or order alerts, hearing reminders or WhatsApp client updates ([LawSathi roundup](https://lawsathi.in/top-10-legal-practice-management-software-in-india-for-2026/), [Capterra listing](https://www.capterra.in/software/1108110/India-Case-Status)). So Features 11 and 12 are table stakes in India; LawAI's difference is staffing-based access, human approval of anything sent outside, reviewed proposals instead of silent calendar changes, and source links. Globally, Clio sells docket monitoring and conflict checks ([Clio](https://www.clio.com/blog/automated-court-monitoring-clio-work/)).
- **eCourts has no official public API that we found.** Lookups need a captcha; the official app lets users save and export cases ([App Store](https://apps.apple.com/in/app/id1260905816)). Data access is therefore an open assumption, with manual import and public cause-list files as fallbacks.
- **Counsel unavailability and adjournments are the documented pain.** NJDG lists unavailability of counsel as the top cause of delay in 66.6 lakh district-court cases as of 14 September 2024 ([Moneylife / Bar and Bench](https://moneylife.in/article/over-66-lakh-cases-delayed-due-to-unavailability-of-lawyers-in-district-courts-38-lakh-due-to-absconding-accused/75153.html)); Delhi High Court benches require a prescribed adjournment slip ([cause list notice](https://delhihighcourt.nic.in/files/2026-06/cause-list/vk_sup-3_for_10.06.26.pdf)).
- **Court fees and stamp duty differ by state** ([Law Commission commentary](https://www.advocatekhoj.com/library/lawreports/reformofjudicial/78.php), [Indian Stamp Bill 2023 summary](https://www.pmfias.com/indian-stamp-bill-2023/)). We found no data on how often errors cause rejection, so this pain point is plausible and not measured.
- **Costs found (third-party, unverified against rate cards):** WhatsApp utility messages about Rs 0.115 each plus provider markup; DLT-registered SMS about Rs 0.10 to 0.18; hourly cron needs the Pro plan ([Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing)).

Rejected or deferred candidates: **matter health score / partner dashboard** (vague value, edges toward outcome prediction, reports already exist); **voice notes to tasks** (phone keyboards already dictate Hindi and English, so little is unique; revisit after Feature 7); **offline court mode** (caching client files on devices conflicts with tenant isolation and revocation and is heavy to build; the printable Feature 4 brief covers the courtroom need); **a WhatsApp AI assistant** (the specification excludes client-facing AI chat, so Feature 16 is one-way approved delivery instead).

## Competitive landscape

Scan as of October 2026. **Pricing figures are third-party estimates** from competitor blogs and comparison sites; vendors do not publish list prices, several sources are vendor-adjacent, and Indian product launch status was not confirmed against official releases.

| Competitor | What it does | Gaps / complaints | Source |
|---|---|---|---|
| Harvey | Enterprise AI for large firms: research, drafting, diligence, workflows. | Estimated $1,000-2,000+/seat/month, 20-25+ seat minimums, extra implementation cost; effectively enterprise-only. | [Bind Legal](https://bindlegal.com/resources/comparisons/harvey-pricing-2026/) |
| Legora | Collaborative workspace, Tabular Review, multi-jurisdiction research (12 jurisdictions). | Estimated ~$3k/user/year, 10-seat floor; both it and Harvey still need human cite-checks. Figures unverified. | [Spellbook](https://www.spellbook.com/briefs/legora-vs-harvey) |
| CoCounsel / Westlaw AI (Thomson Reuters) | Research and drafting on Westlaw and Practical Law content. | Stanford study: Westlaw AI research tool hallucinated on about 1 in 3 queries; Practical Law AI declined or gave ungrounded answers on 60%+. CoCounsel itself not tested. | [Fortune](https://dc.fortune.com/2024/06/04/stanford-hai-legal-ai-copilot-study-rag-llms-future-of-ai) |
| Lexis+ AI (LexisNexis) | Cited research answers on Lexis content. | About 17% hallucination in the same study (best of the group, not zero). | [Fortune](https://dc.fortune.com/2024/06/04/stanford-hai-legal-ai-copilot-study-rag-llms-future-of-ai) |
| Spellbook | Contract drafting and review inside Word. | Reviewers cite hallucinations needing verification; weaker fit beyond Word-based negotiation; pricing by quote. | [Spellbook](https://spellbook.com/learn/luminance-pricing) |
| Luminance | Enterprise contract review, strong in M&A diligence. | Quote-only pricing (estimated ~$43k average deal, unconfirmed); learning curve. | [eesel](https://www.eesel.ai/blog/luminance-ai-review) |
| SpotDraft (India/US) | Contract lifecycle management for in-house teams: AI redlining, e-sign, repository. | In-house focus, not law-firm matter work; no hearings, deadlines or client files. | [Gartner](https://www.gartner.com/reviews/product/spotdraft) |
| Jurisphere (India) | AI drafting, review, research and due diligence for Indian firms. | Young ($2.2M seed); firm-level deals, no self-serve small-firm story seen. | [Global Legal Post](https://www.globallegalpost.com/news/indian-legal-ai-platform-start-up-jurisphere-raises-22m-in-funding-round-1120556859) |
| CaseMine AMICUS (India) | Generative assistant over Indian case law. | Research-centric, not practice management; its 88% accuracy claim is self-reported. | [Bar and Bench](https://www.barandbench.com/news/casemine-launches-ai-powered-legal-assistant-amicus) |
| SCC Online AI Pro / Manupatra (India) | Incumbent Indian databases adding AI layers. | Database-first; launch status and depth not independently confirmed; subscription lock-in to their content. | [SCC Online](https://www.scconline.com/blog/post/2026/01/26/scc-online-ai-pro-republic-day-announcement/) |

Incident context: [Supreme Court on fake AI citations (Bar and Bench)](https://www.barandbench.com/news/litigation/supreme-court-declares-zero-tolerance-to-citing-fake-ai-generated-judgments-asks-bci-to-frame-norms).

Summary: the market is split between US/UK enterprise tools priced out of reach for small firms, Indian research or contract-management products that are not matter workflow, and tools whose citations still need rechecking. LawAI targets the gap with matter-level access control, verifiable citations and India-specific procedure.

## Open questions

Answered by the product owner on 2026-10-19: the objective is confirmed; legal data comes from free official government sources with a country-pluggable pack format; the firm admin is the approver (no Partner role); the build order is fixed (see Planned features); court export profiles go Supreme Court of India, Delhi High Court, Bombay High Court. Still open:

- Which OCR engine and which multilingual embedding model for Hindi legal text?
- Data retention periods for logs and portal content.

## Contributing

- Every git commit message is exactly `lawAI MVP`, with no body and no AI attribution.
- Next.js in this project has breaking changes; follow the guides in `node_modules/next/dist/docs/` (see `AGENTS.md`).
- Never commit secrets (RULE-5).
