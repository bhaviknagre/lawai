# Product specification — lawai

> Status: draft. A coding agent must not implement product code until this specification is approved through Genesis.
> Objective (Confirmed by the product owner 2026-10-19, DECISION-2bff3c26): LawAI is a matter-centric legal AI workspace for small and mid-size law firms, India first, whose answers and citations are verifiable.

## Problem

Small and mid-size law firms cannot afford enterprise legal AI (competitor landscape and pricing in Genesis record KNOWLEDGE-0ab68aaf and docs/usp-ideas.html), and general AI tools produce citations a lawyer cannot trust without rechecking. LawAI already provides a matter-centric workspace (see docs/features.html and docs/ARCHITECTURE.md): matters with staffing-based access, documents with retrieval, review against playbook rules, research, drafting, calendar, tasks and time entries. This specification describes the ten features that make it trustworthy and India-ready (and ready for other countries), and the rules that bind all of them. Desired outcome: a lawyer can rely on, check and defend every AI-assisted output, and the firm stays in control of everything that leaves it.

## Users

- Platform operator: runs the LawAI service across firms, onboards firms and manages platform-level data such as Jurisdiction Packs (existing: src/app/api/platform, scripts/create-platform-admin.ts).
- Firm admin: creates the firm's attorneys, associates and paralegals, and manages staffing, playbooks, privacy reports and all approvals for one firm; the firm admin is the approver wherever this specification previously said partner. There is no separate Partner role (DECISION-8cad9c43; existing role admin).
- Attorney: works on staffed matters, reviews and approves AI output (existing role attorney).
- Paralegal: prepares documents, tasks and deadlines on staffed matters (existing role paralegal).
- End-client: new, read-only portal user who sees only firm-admin-approved updates for their own matters (Feature 9).

Access to a matter equals staffing (case_members) except for admins; this is unchanged (src/lib/access.ts, ai/lawai_ai/access.py).

## Rules (binding)

Each rule is also recorded as a Genesis invariant.

- RULE-1 (INVARIANT-4efd75cc): The AI never presents an unverified citation as verified. A Verified label is set only by deterministic code that finds the authority and, for quotes, the exact text; never by the model.
- RULE-2 (INVARIANT-0e524254): The AI drafts; a human approves anything that leaves the firm or changes a calendar, task, time entry or bill.
- RULE-3 (INVARIANT-994c5bc5): Tenant isolation. No data crosses firms, and within a firm no data crosses matters the user is not staffed on; the filter is applied in the same query as retrieval.
- RULE-4 (INVARIANT-809a4eef): The client portal shows only firm-admin-approved content for the client's own matters.
- RULE-5 (INVARIANT-b8b38090): Secrets are never stored in the repository.
- RULE-6 (INVARIANT-98a9f015): Every git commit message is exactly "lawAI MVP" with no AI attribution.
- RULE-7 (INVARIANT-86d9e894): The .genesis/ directory is never pushed to GitHub.
- RULE-8: Every AI-derived statement shown to a user links to its source or is omitted; machine translations are labelled and never count as verification.
- RULE-9: Learned firm rules apply only after approval, only within the firm that produced them.

## Functional requirements

Feature explanations, requirements, quality requirements, acceptance criteria and non-goals are grouped by feature below. Requirement IDs are global and stable.

### Feature 1: Cite-Proof ledger

Every claim and citation in an AI answer, draft or review carries a visible label, Verified or Unverified, and a lawyer can export a verification certificate for a matter document. Users: attorneys and paralegals (view, export), firm admins (certificate policy). Why it matters: general legal AI tools have been shown to hallucinate citations at meaningful rates (see KNOWLEDGE-0ab68aaf); a label backed by a mechanical check, not by the model's own say-so, is the trust feature small firms can actually rely on.

Feasibility in the existing code: Feasible: review.py already verifies quoted text verbatim; legal_sources (src/db/schema.ts) and the research route (src/app/api/research/route.ts) hold the source corpus. Needs: a citation parser, a label store, a PDF generator.

Functional requirements

- FR-1: A citation is Verified only if a deterministic check finds the cited authority in the firm's accessible sources (legal_sources or the matter's own documents) and, for a quoted passage, the quoted text appears verbatim in that source; otherwise it is Unverified.
- FR-2: Every AI output that contains a citation or a quotation (chat, research, draft, review) shows a per-citation Verified or Unverified label next to it, with the source link when Verified.
- FR-3: The verdict is produced by code, never by the language model; the model may propose citations but cannot set a label.
- FR-4: A user can export a verification certificate (PDF) for a document listing each citation, its label, the matched source, the check method, the timestamp and the document version hash.
- FR-5: Editing a document after certification marks the certificate stale and shows which citations changed.

Non-functional requirements

- NFR-1: Verification of a typical draft (up to 50 citations) completes in under 10 seconds excluding model time.
- NFR-2: Certificate generation and label checks read only data inside the requesting user's firm and accessible matters.

Acceptance criteria

- AC-1: Given a draft containing one citation present in legal_sources and one invented citation, the first is labelled Verified and the second Unverified, in a test with no model call deciding the label.
- AC-2: Given a quote altered by one word from the source text, the citation is Unverified; given an exact quote, Verified (extends the verbatim `original_text in doc['content']` check in ai/lawai_ai/review.py).
- AC-3: The exported certificate lists every citation of the document with the label shown in the UI, and shows stale after the document text changes.

Non-goals for this feature

- Does not certify that a cited authority is good law, current, or supports the proposition; it checks existence and quote fidelity only.
- Does not verify against external live databases in the first release.

### Feature 2: Jurisdiction Packs (India first)

A pluggable per-country pack of statutes, limitation rules and court holidays, built only from free official government sources. India is the first pack (India Code for statutes, official court holiday lists); the India pack also carries India-specific content: limitation periods and CPC/CrPC timing rules as deadline_rules, and an IPC to BNS (also CrPC to BNSS, Evidence Act to BSA) section mapping. Other countries are added later the same way, without code changes to the calculator or retrieval. Users: attorneys and paralegals; platform operator (maintains packs). Why it matters: global competitors center on US/UK law; India-first is the wedge for small and mid-size firms, and a pluggable data layer lets the product follow firms into other countries (DECISION-348aa7bb).

Feasibility in the existing code: Feasible: deadline_rules and jurisdictions tables (src/db/schema.ts), compute_deadline in ai/lawai_ai/agent/deadlines.py and src/lib/deadlines.ts. Gap stated in deadlines.py: court holidays are not applied, so a per-court holidays table is required. Data source is decided: free official government sources; licence and update cadence of each source are still recorded per record (ASSUMPTION-72fd9ed0 resolved for source choice, not for accuracy).

Functional requirements

- FR-6: Define a jurisdiction pack as a versioned, country-keyed bundle of deadline_rules, statute records and court holidays, loadable per firm jurisdiction. Ship the India pack seed: Indian deadline_rules (Limitation Act 1963 schedule periods, CPC appeal and written-statement periods) each with a statutory citation and trigger event. Adding another country requires only new pack data, not code changes.
- FR-7: The India pack includes a statute library of selected Indian bare acts taken from India Code, chunked and searchable by section number and text through the existing retrieval, each record carrying country, act, section, version and source URL.
- FR-8: The India pack provides an IPC to BNS mapping table (old section, new section, change note; also CrPC to BNSS and Evidence Act to BSA) searchable in both directions and shown in research answers when either section is cited. This mapping is India-specific content, not part of the generic pack format.
- FR-9: The deadline calculator must apply the pack's per-court holidays (India: official court holiday lists) and weekend roll-forward, and must show the rule, citation and any exclusion (for example Section 12 Limitation Act time exclusion) it applied.
- FR-10: Every pack record has a provenance field (official source URL, licence, retrieval date, reviewer) and every pack deadline rule is marked as reviewed by a qualified lawyer before it is enabled.

Non-functional requirements

- NFR-3: Pack data is versioned; a firm sees which pack version produced each computed deadline.
- NFR-4: Pack content is read-only for firms and can be updated only by the platform operator.

Acceptance criteria

- AC-4: Computing a limitation deadline for a seed rule on a trigger date adjacent to a listed court holiday yields the next working day and shows the holiday in the explanation.
- AC-5: Searching 'Section 420 IPC' returns the BNS equivalent from the mapping; searching a BNS section returns the IPC predecessor.
- AC-6: Every seeded deadline rule and statute record has a non-empty citation and official source; a test fails otherwise. A test pack for a second (fixture) country loads and computes a deadline with no code change.

Non-goals for this feature

- Does not provide legal advice or guarantee limitation computations; the user confirms every deadline.
- Does not use paid or unofficial legal databases, and does not cover state-specific rules or case-law reporters in the first release.
- Does not ship packs for countries other than India in the first release; only the pluggable format is required.

### Feature 3: Service-to-calendar autopilot

When a served notice or order is uploaded, the system extracts the relevant dates (date of service, hearing dates), computes the deadline using the matter's rules, and proposes tasks and calendar events assigned to the staffed team. Users: paralegals and attorneys, who confirm. Why it matters: missed deadlines are the costliest failure in practice; this turns a document into a reviewed calendar entry in one step.

Feasibility in the existing code: Feasible: ingestion pipeline ai/lawai_ai/rag/ingest.py runs after upload; events, tasks, case_members and deadline_rules exist in src/db/schema.ts; staffing = access in src/lib/access.ts.

Functional requirements

- FR-11: On ingestion of a document classified as a notice, summons or order, extract candidate dates with the page and quoted text each came from.
- FR-12: For each extracted trigger date, select applicable deadline_rules for the matter's jurisdiction and compute proposed due dates with the rule explanation.
- FR-13: Present proposals as drafts (proposed events and tasks) assigned by default to the matter's lead and members from case_members; nothing is written to events or tasks until a human confirms.
- FR-14: Each proposal links to the source passage so the reviewer can check the date against the document.
- FR-15: Rejected or edited proposals are logged to activities with the user and reason.

Non-functional requirements

- NFR-5: Proposal generation runs asynchronously after ingestion and never blocks upload.
- NFR-6: Proposals respect access control: only users staffed on the matter (or admins) see them.

Acceptance criteria

- AC-7: Uploading a sample notice produces proposals but zero rows in events and tasks until a user confirms; confirming creates them with the staffed assignees.
- AC-8: A date the extractor cannot find verbatim in the document is not proposed (quote check).
- AC-9: A user not staffed on the matter cannot see or confirm the proposals.

Non-goals for this feature

- Does not auto-create events, send reminders to outsiders, or file anything without confirmation.
- Does not extract from scanned images until Feature 7 OCR exists.

### Feature 4: Hearing-day brief

An automatically generated one-page brief for each upcoming hearing: matter summary, parties, last order, open tasks, pending deadlines, key documents and cited authorities. Users: the attorney appearing, and paralegals preparing. Why it matters: advocates prepare under time pressure; a verified, source-linked page replaces manual compilation.

Feasibility in the existing code: Feasible: events, tasks, documents, document_chunks and the agent tools in ai/lawai_ai/agent/tools.py already expose the data; draft.py shows the generation pattern.

Functional requirements

- FR-16: For each event of type hearing, generate a brief draft a configurable number of days before (default 1 day) and on demand.
- FR-17: The brief contains matter header, hearing details, last known status, open tasks, upcoming deadlines, recent documents and the top authorities, each statement linked to its source record or document page.
- FR-18: Citations in the brief carry Cite-Proof labels (Feature 1).
- FR-19: The brief is exportable as a single printable page and is visible only to staffed users.
- FR-20: Regenerating after new data shows a changed-since marker rather than silently overwriting.

Non-functional requirements

- NFR-7: Brief generation for a matter with 200 documents completes in under 60 seconds.
- NFR-8: The brief uses only data the requesting user can access.

Acceptance criteria

- AC-10: For a matter with a hearing tomorrow, a brief exists containing the hearing, at least the open tasks and deadlines that the database holds, each with a source link.
- AC-11: A non-staffed user receives not-found for the brief.
- AC-12: Each sentence of model-written content in the brief maps to at least one source reference or is omitted.

Non-goals for this feature

- Does not predict outcomes or recommend strategy.
- Does not email the brief outside the firm.

### Feature 5: Ethical-wall receipts

A per-matter report listing exactly what the AI could and did access: which users, which documents, which AI features and which retrieval queries, plus proof that staff outside the matter were excluded. Users: firm admins and the data protection contact; also usable to answer a client or regulator. Why it matters: under India's Digital Personal Data Protection Act 2023 and professional confidentiality duties, firms must show who and what touched client data.

Feasibility in the existing code: Feasible: ai_usage, activities and access.py (ai/lawai_ai/access.py) give hooks; retrieval in ai/lawai_ai/rag/search.py already filters by accessible matters so the filter result can be logged. A new log table is needed.

Functional requirements

- FR-21: Record, per AI call, the user, matter scope, documents or chunks retrieved, feature and timestamp in an append-only access log.
- FR-22: Provide a per-matter receipt (PDF and on-screen) covering a chosen period: staffed members, documents accessible, AI calls made, documents the AI retrieved, and denied access attempts.
- FR-23: The receipt states the model providers that processed content and the retention applied.
- FR-24: Admins can generate the receipt; it is itself logged in activities.
- FR-25: Receipt contents are generated from stored logs, never from model output.

Non-functional requirements

- NFR-9: The access log is append-only for application roles and tamper-evident (hash chained).
- NFR-10: Logging adds under 50 ms to a retrieval call and stores identifiers and hashes, not document text.

Acceptance criteria

- AC-13: After a staffed user asks the AI a question on a matter, the receipt lists that call and the retrieved documents; an unstaffed user's attempted access appears as denied.
- AC-14: Attempting to update or delete a log row via the application database role fails.
- AC-15: The receipt for a matter contains no document text, only identifiers and titles.

Non-goals for this feature

- Does not by itself make the firm DPDP compliant or replace a legal compliance assessment.
- Does not log outside the AI paths in the first release.

### Feature 6: Firm-memory playbooks

The system learns from the edits lawyers accept or reject in reviews and proposes new or changed playbook rules (playbook_rules); a firm admin approves each rule before it applies. Users: attorneys (feedback), firm admins (approval). Why it matters: firm know-how stays in the firm and improves reviews without any retraining on client data.

Feasibility in the existing code: Feasible: playbook_rules and document_issues (status open/accepted/dismissed) exist in src/db/schema.ts; review.py loads playbook_rules per firm and document kind.

Functional requirements

- FR-26: Capture accepted and dismissed document_issues with the user's edits as signals tied to the playbook rule and document kind.
- FR-27: Periodically or on demand, propose draft rules or edits to existing rules, each with the supporting examples (counts and references) shown to the approver.
- FR-28: A proposed rule has no effect on reviews until the firm admin approves it; approval and rejection are logged.
- FR-29: Proposed rules are scoped to the firm and never shared across firms.
- FR-30: Approved rules can be edited, disabled and rolled back to a prior version.

Non-functional requirements

- NFR-11: Learning uses only the firm's own data and does not modify model weights.
- NFR-12: Proposals need at least a configurable minimum number of supporting examples (default 3).

Acceptance criteria

- AC-16: After 3 consistent rejections of the same suggestion, a proposed rule appears in the approval queue and does not appear in review prompts until approved.
- AC-17: A rule approved in firm A is absent from firm B's review prompt.
- AC-18: Disabling an approved rule removes it from the next review's playbook list.

Non-goals for this feature

- Does not auto-apply rules, fine-tune models, or share learnings across firms.
- Does not infer rules from documents the firm never reviewed.

### Feature 7: Hindi/English documents

Support for Hindi and bilingual documents: OCR of scanned pages, retrieval that finds Hindi text from English questions and the reverse, and translated summaries labelled as machine translations. Users: everyone handling Indian court papers. Why it matters: ai/lawai_ai/rag/parse.py rejects scanned PDFs today, and much Indian litigation material is scanned or in Hindi.

Feasibility in the existing code: Feasible with new work: parse.py has the OCR hook point (its error already references OCR); embeddings.py supports Voyage and OpenAI, whose multilingual quality for Hindi legal text is an open assumption.

Functional requirements

- FR-31: Scanned PDFs and images are OCR'd on upload with per-page text offsets preserved; pages with low OCR confidence are flagged.
- FR-32: Hindi (Devanagari) and English text are both ingested, chunked and embedded with a multilingual embedding model so a query in either language retrieves relevant chunks in both.
- FR-33: A document summary can be requested in English or Hindi, labelled as a machine translation, with the source language shown.
- FR-34: Citations and quotes always refer to the original-language text; a translated passage is never used to mark a citation Verified.
- FR-35: Users can view and correct OCR text; corrections re-trigger indexing.

Non-functional requirements

- NFR-13: OCR runs asynchronously and does not block upload; failures set ingest_status to failed with a reason.
- NFR-14: OCR and translation of a 100-page scanned document completes within a configurable time budget (target under 15 minutes) without exceeding a per-firm cost cap.

Acceptance criteria

- AC-19: A scanned sample PDF that currently fails with 'No text layer' is ingested and searchable.
- AC-20: On a labelled set of 30 bilingual query/passage pairs, the right passage is in the top 5 results for at least 80 percent of queries (threshold to be confirmed after the model trial).
- AC-21: A translated summary shows the machine-translation label; a quote check against a translated string never returns Verified.

Non-goals for this feature

- Does not provide certified translations.
- Does not cover other Indian languages in the first release.

### Feature 8: AI time capture

From the day's activity (documents opened or drafted, AI chats, calendar events, tasks) the system drafts billable time entries into time_entries for the lawyer to edit and approve. Users: attorneys and paralegals; admins for billing. Why it matters: unbilled time is a major leak in small firms, and approval keeps the lawyer accountable for the bill.

Feasibility in the existing code: Feasible: time_entries, activities, events and ai_usage tables exist in src/db/schema.ts; duration accuracy from system events alone is an open question.

Functional requirements

- FR-36: Generate draft time entries per user per day from activities, events, documents touched and AI usage, each with matter, duration estimate, narrative and the evidence list.
- FR-37: Drafts live in a review inbox; only entries the user approves become time_entries, and approved entries can be edited before and after.
- FR-38: Show the evidence behind each draft so the lawyer can verify the duration and narrative.
- FR-39: Only the user's own activity is used; admins cannot generate drafts on behalf of another user.
- FR-40: Rejected drafts are discarded and used to adjust only that user's future suggestions.

Non-functional requirements

- NFR-15: Draft generation for one user-day completes in under 20 seconds.
- NFR-16: No draft is written to time_entries, invoices or any client-visible record without explicit approval.

Acceptance criteria

- AC-22: After a user opens and edits a matter document and holds a calendar meeting, a draft entry appears with evidence; time_entries gains no row until approval.
- AC-23: Approving a draft creates exactly one time_entries row linked to the matter; rejecting creates none.
- AC-24: A user cannot see another user's drafts.

Non-goals for this feature

- Does not generate invoices, set rates or submit bills to clients.
- Does not monitor activity outside LawAI.

### Feature 9: Client status portal

A read-only portal for end-clients showing firm-admin-approved, plain-language status updates on their own matters, next hearing date and documents the firm chooses to share. Users: end-clients (read), attorneys (author), firm admins (approve). Why it matters: clients ask 'what is happening' constantly; approved updates reduce calls and raise trust without exposing the workspace.

Feasibility in the existing code: Feasible with new work: schema has clients and cases and a three-value user role (src/db/schema.ts roleEnum), so a new principal type, approval state and session path are required; proxy.ts and src/lib/auth.ts must route portal sessions.

Functional requirements

- FR-41: Add an end-client role limited to a client portal, authenticated separately from firm users, and bound to one or more clients records.
- FR-42: The AI drafts a plain-language update for a matter; the update becomes visible to the client only after the firm admin approves it, and each update shows its approver and time.
- FR-43: The portal shows only approved updates, the next approved hearing date and documents explicitly shared; it never shows internal notes, tasks, AI chats, other clients or unapproved drafts.
- FR-44: Approved updates can be retracted, which removes them from the portal and logs the action.
- FR-45: Client invitations are issued by the firm and revocable; portal sessions are logged.

Non-functional requirements

- NFR-17: Portal queries run through a separate read model that selects only rows flagged approved and client-visible.
- NFR-18: Portal pages load in under 2 seconds at the 95th percentile for a matter with 100 updates.

Acceptance criteria

- AC-25: A client signed in to the portal cannot read, via UI or API, any record that is not an approved update or shared document for their own matter.
- AC-26: A drafted but unapproved update does not appear in the portal; after approval it does.
- AC-27: Revoking a client invitation ends their access on the next request.

Non-goals for this feature

- Does not provide client chat with the AI, messaging, e-signature or payments in the first release.
- Does not translate updates automatically.

### Feature 10: Courtroom-ready export

Export a draft as a paginated court-format document with numbered pages, an index and a Table of Authorities built only from citations that are Verified. Users: attorneys finalizing filings. Why it matters: the last mile to filing is formatting and checking citations; competitors export text, not a verified table.

Feasibility in the existing code: Feasible with new work: documents and draft route (src/app/api/draft/route.ts) exist; the DOCX/PDF renderer and pagination are new, and depend on Feature 1 labels.

Functional requirements

- FR-46: Export a draft to DOCX and PDF with court-format settings (page size, margins, numbering, line spacing) selectable per court profile. Profiles are delivered in this order: Supreme Court of India first, then Delhi High Court, then Bombay High Court (DECISION-4c1e3d08).
- FR-47: Generate a Table of Authorities from the draft's citations with the page numbers where each appears.
- FR-48: Include in the Table of Authorities only Verified citations; Unverified citations are listed in a separate pre-export warning the user must acknowledge, and are not placed in the table.
- FR-49: The export records the document version hash and links to the verification certificate from Feature 1.
- FR-50: Export is a user-triggered action by a staffed user and is logged in activities.

Non-functional requirements

- NFR-19: Export of a 100-page draft completes in under 30 seconds.
- NFR-20: Page numbers in the table match the rendered output.

Acceptance criteria

- AC-28: Exporting a draft with 5 Verified and 1 Unverified citation yields a Table of Authorities with 5 entries, and the Unverified citation appears only in the warning.
- AC-29: For a sample draft, every page number in the Table of Authorities matches the page on which the citation actually appears in the PDF.
- AC-30: An unstaffed user cannot export the draft.

Non-goals for this feature

- Does not e-file with any court or guarantee compliance with a court's local rules.
- Does not include case law not verified by Feature 1.

### Cross-cutting requirements

- FR-51: Every AI output that leaves the firm or changes a calendar, task, time entry, client-visible record or bill requires an explicit human approval action recorded with user and time (INVARIANT-0e524254).
- FR-52: Every new table and query carries firm_id and is filtered by the user's accessible matters (INVARIANT-994c5bc5).
- NFR-21: No secret or credential is committed to the repository; configuration comes from environment variables and .env files stay git-ignored.
- AC-31: A repository scan finds no API keys or credentials in tracked files, and a cross-firm test shows a user in firm A receives no rows of firm B from any new endpoint.

## Non-functional requirements

All NFR-* items appear inside the feature groups above and in the cross-cutting group.

## Acceptance criteria

All AC-* items appear inside the feature groups above and in the cross-cutting group.

## Build order

Decided by the product owner on 2026-10-19 (DECISION-8949e592). Rationale: trust first, then the local moat, then workflows that reuse those foundations, with the heaviest ML/OCR work last. Feature numbers and requirement IDs keep their original labels; this is the delivery order.

1. Feature 1: Cite-Proof ledger
2. Feature 2: Jurisdiction Packs (India first)
3. Feature 3: Service-to-calendar autopilot
4. Feature 4: Hearing-day brief
5. Feature 8: AI time capture
6. Feature 5: Ethical-wall receipts
7. Feature 9: Client status portal
8. Feature 10: Courtroom-ready export
9. Feature 6: Firm-memory playbooks
10. Feature 7: Hindi/English documents

## Constraints

- Existing stack: Next.js 16 app, Python AI service, Postgres 16 with pgvector, R2/S3 storage (docs/ARCHITECTURE.md). Next.js here has breaking changes; follow node_modules/next/dist/docs/ (AGENTS.md).
- India first, not India only: legal content, holidays and statutes come from free official government sources whose provenance and licence are recorded, behind a country-pluggable pack format (Feature 2).
- DPDP Act 2023 applies to client personal data; model providers that process content must be disclosed in the ethical-wall receipt.
- This phase is specification only: no product code, plan or tasks until the user approves the specification and plan.
- Process rules: see RULE-5, RULE-6, RULE-7.

## Non-goals

- No legal advice, outcome prediction or court filing.
- No certification that cited authority is good law.
- No client-facing AI chat, billing, invoicing or payments.
- No model fine-tuning on client data.
- Shipping packs for countries other than India, and languages other than Hindi and English, are out of scope for this release (the pack format itself is in scope).

## Risks

- Inaccurate legal data in a pack or deadline rules: mitigated by provenance, lawyer review before a rule is enabled, and mandatory human confirmation of every deadline.
- Hindi OCR and retrieval quality may be insufficient: mitigated by confidence flags, user correction and a measured acceptance threshold before commitment.
- Over-reliance on Verified labels: mitigated by plain wording that the label means existence and quote match only.
- Portal data leakage: mitigated by a separate read model and approval-state filter (Feature 9).
- Scope: ten features are large; mitigated by the fixed build order below.

## Open questions

Answered on 2026-10-19 (objective, legal data source, approver, build order, court order) are recorded as decisions DECISION-2bff3c26, DECISION-348aa7bb, DECISION-8cad9c43, DECISION-8949e592 and DECISION-4c1e3d08. Still open:

- Which OCR engine and which multilingual embedding model for Hindi legal text?
- Data retention periods for logs and portal content.
