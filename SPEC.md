# Product specification — lawai

> Status: draft. A coding agent must not implement product code until this specification is approved through Genesis.
> Objective (Confirmed by the product owner 2026-10-19, DECISION-2bff3c26): LawAI is a matter-centric legal AI workspace for small and mid-size law firms, India first, whose answers and citations are verifiable.

## Problem

Small and mid-size law firms cannot afford enterprise legal AI (competitor landscape and pricing in Genesis record KNOWLEDGE-0ab68aaf and docs/usp-ideas.html), and general AI tools produce citations a lawyer cannot trust without rechecking. LawAI already provides a matter-centric workspace (see docs/features.html and docs/ARCHITECTURE.md): matters with staffing-based access, documents with retrieval, review against playbook rules, research, drafting, calendar, tasks and time entries. This specification describes the twenty-one features that make it trustworthy and India-ready (and ready for other countries), and the rules that bind all of them. Features 1 to 10 were approved first; Features 11 to 16 were added on 2026-10-19 at the product owner's request (Hearing reminders, DECISION-bd89e06d) and after a gap check against Indian and global competitors (DECISION-27fee276); Features 17 to 21 were added on 2026-10-19 after a check of docs/usp-ideas.html and a sell-ability review (Notice and court-paper templates, Firm precedent bank, Client intake link, Fee notes and GST invoices, Version compare and counterparty redline; the decision record is listed under Build order), together with small additions to Features 1, 4, 5, 7 and 10. Features 11 to 21 await the owner's re-approval. Desired outcome: a lawyer can rely on, check and defend every AI-assisted output, and the firm stays in control of everything that leaves it.

## Users

- Platform operator: runs the LawAI service across firms, onboards firms and manages platform-level data such as Jurisdiction Packs (existing: src/app/api/platform, scripts/create-platform-admin.ts).
- Firm admin: creates the firm's attorneys, associates and paralegals, and manages staffing, playbooks, privacy reports and all approvals for one firm; the firm admin is the approver wherever this specification previously said partner. There is no separate Partner role (DECISION-8cad9c43; existing role admin).
- Attorney: works on staffed matters, reviews and approves AI output (existing role attorney).
- Paralegal: prepares documents, tasks and deadlines on staffed matters (existing role paralegal).
- Prospective client: a person the firm has already spoken to, who opens a private intake link and fills one form (Feature 19); has no account, login or access to anything else.
- End-client: new, read-only portal user who sees only firm-admin-approved updates for their own matters (Feature 9); may also receive firm-admin-approved hearing reminders and updates by email or WhatsApp (Features 11 and 16), and invoices a person at the firm chooses to send (Feature 20).

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
- FR-93: An Unverified label states its reason, decided by code: "Not in library" when the cited authority is not among the firm's accessible sources, so the check could not run, and "Quote differs" when the authority is found but the quoted text is not verbatim in it. A third state never replaces Verified or Unverified; both reasons are Unverified (docs/usp-ideas.html idea 1, KNOWLEDGE-51575b5e).
- FR-94: In chat, research and draft answers, each sentence the model writes that states a fact carries a source tag linking to a retrieved passage the user can access, or is shown as "No source". The tag shows that a source was retrieved and linked; it is not the Verified label and does not claim the passage supports the sentence (RULE-8).

Non-functional requirements

- NFR-1: Verification of a typical draft (up to 50 citations) completes in under 10 seconds excluding model time.
- NFR-2: Certificate generation and label checks read only data inside the requesting user's firm and accessible matters.

Acceptance criteria

- AC-1: Given a draft containing one citation present in legal_sources and one invented citation, the first is labelled Verified and the second Unverified, in a test with no model call deciding the label.
- AC-2: Given a quote altered by one word from the source text, the citation is Unverified; given an exact quote, Verified (extends the verbatim `original_text in doc['content']` check in ai/lawai_ai/review.py).
- AC-3: The exported certificate lists every citation of the document with the label shown in the UI, and shows stale after the document text changes.
- AC-55: A citation to an authority absent from the library shows Unverified with the reason "Not in library"; a citation to a present authority with a one-word-altered quote shows Unverified with the reason "Quote differs".
- AC-56: In a test answer with one sentence that has a retrieved source and one that has none, the first shows a source link and the second shows "No source"; neither is labelled Verified.

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
- FR-95: A staffed user can have the brief emailed to themselves and to the other staffed attendees of the hearing; the email carries a link to the brief and the hearing details only, never document text, and goes only to users staffed on the matter (docs/usp-ideas.html idea 4). This is an internal message and does not change the non-goal on sending outside the firm.

Non-functional requirements

- NFR-7: Brief generation for a matter with 200 documents completes in under 60 seconds.
- NFR-8: The brief uses only data the requesting user can access.

Acceptance criteria

- AC-10: For a matter with a hearing tomorrow, a brief exists containing the hearing, at least the open tasks and deadlines that the database holds, each with a source link.
- AC-11: A non-staffed user receives not-found for the brief.
- AC-12: Each sentence of model-written content in the brief maps to at least one source reference or is omitted.
- AC-57: A brief emailed from a matter reaches only users staffed on it, contains a link and no document text, and a non-staffed address is refused.

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
- FR-96: Each AI answer shows the asking user a "what this answer used" panel listing the matters and documents it retrieved from, taken from the FR-21 log, and a firm admin can open the same panel for any answer in the firm; the panel contains identifiers and titles, not document text (docs/usp-ideas.html idea 5).

Non-functional requirements

- NFR-9: The access log is append-only for application roles and tamper-evident (hash chained).
- NFR-10: Logging adds under 50 ms to a retrieval call and stores identifiers and hashes, not document text.

Acceptance criteria

- AC-13: After a staffed user asks the AI a question on a matter, the receipt lists that call and the retrieved documents; an unstaffed user's attempted access appears as denied.
- AC-14: Attempting to update or delete a log row via the application database role fails.
- AC-15: The receipt for a matter contains no document text, only identifiers and titles.
- AC-58: For an answer drawn from two documents of one matter, the panel lists those two documents and nothing else; the admin sees the same list; a user cannot open the panel of another user's answer.

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
- FR-97: Store a detected language tag (English, Hindi or mixed) on each document and each chunk, show it in the document viewer, and allow it as a search filter; the tag can be corrected by a user (docs/usp-ideas.html idea 7).

Non-functional requirements

- NFR-13: OCR runs asynchronously and does not block upload; failures set ingest_status to failed with a reason.
- NFR-14: OCR and translation of a 100-page scanned document completes within a configurable time budget (target under 15 minutes) without exceeding a per-firm cost cap.

Acceptance criteria

- AC-19: A scanned sample PDF that currently fails with 'No text layer' is ingested and searchable.
- AC-20: On a labelled set of 30 bilingual query/passage pairs, the right passage is in the top 5 results for at least 80 percent of queries (threshold to be confirmed after the model trial).
- AC-21: A translated summary shows the machine-translation label; a quote check against a translated string never returns Verified.
- AC-59: A bilingual sample document shows a mixed tag and its Hindi chunks carry the Hindi tag; filtering by Hindi returns only Hindi chunks.

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
- FR-98: The user can mark documents as annexures of a draft in an order, and the export includes an annexure index (label, title, page range) matching the rendered pages (docs/usp-ideas.html idea 10).

Non-functional requirements

- NFR-19: Export of a 100-page draft completes in under 30 seconds.
- NFR-20: Page numbers in the table match the rendered output.

Acceptance criteria

- AC-28: Exporting a draft with 5 Verified and 1 Unverified citation yields a Table of Authorities with 5 entries, and the Unverified citation appears only in the warning.
- AC-29: For a sample draft, every page number in the Table of Authorities matches the page on which the citation actually appears in the PDF.
- AC-30: An unstaffed user cannot export the draft.
- AC-60: A draft with three marked annexures exports with an annexure index whose labels, order and page ranges match the PDF.

Non-goals for this feature

- Does not e-file with any court or guarantee compliance with a court's local rules.
- Does not include case law not verified by Feature 1.

### Feature 11: Hearing reminders

An automatic reminder, sent the day before each hearing (and, if the user chooses, again that morning), that tells the person exactly where to be and when: the matter, date, time, court, bench or courtroom number, address with a map link, the judge if known, what to bring, and who from the firm is attending. It goes to the matter's staffed attorney and paralegal, and optionally to the client. A client copy is sent only after the firm admin approves it. Channels are in-app (the bell), email, and WhatsApp or SMS, because in India most people act on a WhatsApp message and not on an email. If the hearing is moved the reminder is sent again with the change marked; if it is adjourned or cancelled, a cancellation is sent. Users: attorneys and paralegals (receive), firm admins (approve client copies, set firm defaults), clients (receive the approved copy). Why it matters: a missed or mis-timed appearance is the most expensive mistake in litigation practice, India's National Judicial Data Grid lists unavailability of counsel as the top cause of delay in district-court cases (KNOWLEDGE-77db087b), and a reminder is cheap to build and is the kind of feature people use every day.

Relationship to Feature 4 (Hearing-day brief): the reminder is the alert and the brief is the prep pack. They are separate features. The reminder is complete without the brief. When Feature 4 exists and a brief has been generated for the hearing, the reminder carries a link to it (staffed users only; the link is never put in a client copy).

Feasibility in the existing code: Feasible, and cheap. events already holds starts_at, ends_at, location, judge and type hearing, and cases.court (src/db/schema.ts); case_members gives the recipients; notifications and the bell exist (src/app/(app)/layout.tsx, markNotificationsRead in src/app/actions/misc.ts); sendEmail in src/lib/email.ts already sends through Resend and takes an idempotency key; clients.phone exists; jurisdictions.timezone exists and the seed has IN as Asia/Kolkata (scripts/seed.ts). Gaps found in the code: notifications has no firm_id, type or channel; users has no phone number; events has no bench or courtroom, address, attendee list, what-to-bring list or updated_at (needed to detect a reschedule); no delivery log; no notification preferences; nothing sends WhatsApp or SMS; the only scheduler is one daily cron at 03:00 UTC (vercel.json), which cannot send "the evening before in local time", so the plan needs an hourly cron on a plan that allows it (the proposed stack is Vercel Pro, which allows once-per-minute schedules, see docs/TECH_STACK.md and KNOWLEDGE-803278e6). The reminder text is assembled from database fields only; no language model is involved in composing it. WhatsApp and SMS need outside approvals with unknown lead time, so the first release may ship in-app and email first (ASSUMPTION-b89d9a49); start the provider paperwork at the beginning of the build.

Functional requirements

- FR-53: For every event of type hearing, schedule a reminder for the evening before the hearing (default 18:00 in the matter's time zone) and, if the user enabled it, a second same-morning reminder (default 07:30). Times are computed in the time zone of the matter's jurisdiction (jurisdictions.timezone, India: Asia/Kolkata), falling back to a firm default, and the hearing time is shown in that zone with the zone name.
- FR-54: A reminder shows the matter name and number, date, start time, court, bench or courtroom number, street address with a map link built from the address, the judge if known, a what-to-bring checklist, and the firm members attending. Fields that are not known are omitted, never guessed.
- FR-55: Staff recipients are the matter's lead and members from case_members who are attorneys or paralegals, plus anyone named as an attendee on the hearing. No other user receives a reminder for the matter.
- FR-56: A client copy is created as a draft and is sent only after a firm admin approves it. The approval is recorded with user and time (FR-51). A reschedule or cancellation invalidates the earlier approval; the new client message needs a fresh approval, and if it is not approved by its send time it is not sent and the staff are told it was held back. The client message contains only the fields the firm admin has approved for client use (matter title, date, time, court, address, courtroom) and never internal notes, tasks, the brief or other clients.
- FR-57: Deliver on the channels each recipient has enabled: in-app (the notifications bell), email, and WhatsApp or SMS. A user can switch each channel off for themselves; a client can opt out of any channel and a client message is never sent on a channel they opted out of.
- FR-58: When a hearing's date, time, court, courtroom, address or attendees change, send a new reminder that shows what changed against the previous one. When a hearing is deleted, or is marked adjourned, send a cancellation, and stop any reminder not yet sent. Marking a hearing adjourned and entering the next date is a user action (or a confirmed proposal from Feature 12); this feature never changes the calendar by itself.
- FR-59: Record every delivery attempt per reminder, recipient and channel with a status (scheduled, sent, delivered, failed, skipped because the user opted out, held back awaiting approval), the provider message id, the failure reason and the time. Staff can see the delivery status of a hearing's reminders.
- FR-60: If a delivery fails, retry with backoff and, if it still fails, fall back to the next enabled channel and notify the matter lead in-app. A reminder is sent at most once per recipient, channel and version of the hearing (idempotency key).
- FR-61: Hearings created or changed less than the lead time before the hearing (for example a hearing added at 9pm for the next morning) send the first reminder immediately.
- FR-62: Before sending on WhatsApp or SMS, the recipient's number must be recorded and, for the client, the firm must hold the client's consent for that channel; without it the channel is skipped and recorded as skipped.

Non-functional requirements

- NFR-22: The scheduler runs at least hourly. A reminder is sent within 15 minutes of its scheduled time, and the system sends nothing twice when the scheduler runs twice.
- NFR-23: Reminders carry only the fields listed in FR-54 and never document text. Messages are written to a delivery log without the message body for WhatsApp and SMS; the body is rebuilt from the hearing record when needed.
- NFR-24: Every new table carries firm_id and every query is filtered by the recipient's firm and accessible matters (FR-52). Provider API keys come from environment variables only (NFR-21).

Acceptance criteria

- AC-32: Given a hearing at 10:30 on a date in Asia/Kolkata, the attorney and paralegal staffed on the matter each receive an in-app notification and an email at 18:00 the evening before that shows the matter, time, court, courtroom, address with a map link, judge, what to bring and attendees; a user not staffed on the matter receives nothing.
- AC-33: A client copy for the same hearing is not sent while it is a draft; it is sent after the firm admin approves it; editing the hearing time afterwards holds the client copy back until approved again.
- AC-34: Moving the hearing from 10:30 to 14:00 after the first reminder was sent produces a second reminder showing the old and new times; marking it adjourned produces a cancellation and no further reminder.
- AC-35: A user who switched off email receives no email for a hearing but still receives the in-app notification; the delivery log shows the email as skipped and the in-app one as delivered.
- AC-36: A simulated provider failure on WhatsApp is retried, then the same reminder is sent by the next enabled channel, and the log shows each attempt; running the scheduler twice produces one reminder per recipient and channel.

Non-goals for this feature

- Does not create, move or cancel hearings itself, and does not read dates from the court's website (Feature 12 proposes those; a human confirms).
- Does not send anything to a client without firm-admin approval, and does not send marketing messages.
- Does not include a client-facing chat, and does not remind about tasks or deadlines in the first release (hearings only).
- Does not guarantee that a message is read; delivery status shows what the provider reported.

### Feature 12: Court-date watch

LawAI checks each active matter's next court date and position in the daily cause list, and tells the team when it changes, so nobody finds out at the court gate. The matter is linked once to its court case (for example by CNR number, the 16-character case identifier used on eCourts, or by case number and court). A daily job reads the court's public status and cause list, and when the next date, bench or list position differs from the calendar, LawAI proposes the calendar change with the source shown; a person confirms, and the change then triggers Hearing reminders (Feature 11). Users: attorneys and paralegals (confirm), firm admins (settings). Why it matters: Indian litigators track dates across the eCourts portal, the High Court cause list sites and a paper diary; the official routes need a captcha per lookup and there is no public programming interface (KNOWLEDGE-d41f2d01), so a daily, matter-linked, staffed and reviewed feed is what firms pay for. Other Indian practice tools offer cause-list alerts (KNOWLEDGE-d41f2d01), so this feature is table stakes in India; LawAI's difference is that every change is a reviewed proposal tied to the firm's staffing, deadline rules and reminders, with the source record shown, and not a silent overwrite. In the US, docket monitoring is sold as a headline feature (Clio Docket, KNOWLEDGE-d41f2d01), which shows firms pay for it.

Feasibility in the existing code: Feasible in parts, with one real unknown. Data model: cases has case_number, court and jurisdiction; events and case_members exist; the daily cron route (src/app/api/cron/ingest/route.ts) is the pattern for a job; the Service-to-calendar proposal mechanism (Feature 3) is the model for "propose, then confirm". Unknown: how to read eCourts lawfully and reliably (ASSUMPTION-8c002900). There is no official programming interface found; the portal uses a captcha; the official eCourts Services app lets a user save cases and refresh them, and export and import the saved list as a text file. Lower-risk routes, in order: (1) the user imports or pastes the date from the official app or the court's cause list; (2) read the public cause-list PDFs that courts publish (for example the Delhi High Court posts them as files) and match on case number; (3) automated reading of eCourts pages, only after written confirmation from the e-Committee or NIC that it is permitted, or through an authorised data partner.

Functional requirements

- FR-63: A matter can be linked to a court case record by CNR number, or by court, case type, number and year; the link and its source are stored on the matter.
- FR-64: Once a day, and on demand by a staffed user, read the next hearing date, the stage or purpose, the bench and the listed position for each linked active matter from the configured source, and store each reading with the source, time and the text it was read from.
- FR-65: When a reading differs from the matter's calendar, create a proposal (new hearing, changed date, or marked adjourned) assigned by default to the matter's lead and members; nothing is written to events until a human confirms, and a confirmed change triggers Feature 11 (FR-58).
- FR-66: When the matter appears in a cause list for a date, show its serial number and court, and warn when it is listed on a date with no calendar hearing.
- FR-67: If a source cannot be read (portal down, captcha, layout changed), show the matter as "not checked" with the time of the last good reading and a plain reason; never show an old date as current.
- FR-68: Support a manual source: a staffed user can paste or import the date from the official eCourts app export or the court's cause list, and the system treats it as a reading with that source.
- FR-69: Each source is configured by the platform operator with its legal basis recorded (terms, permission, date), and can be switched off per court without a code change.

Non-functional requirements

- NFR-25: The job is polite to the source: bounded requests per court per day, back-off on errors, an identifying user agent, and no attempt to defeat a captcha unless the source's owner has permitted automation in writing.
- NFR-26: A reading never exposes matter data to the source beyond the case identifier needed to look it up, and proposals respect staffing (NFR-6).

Acceptance criteria

- AC-37: Given a linked matter whose recorded source date changes, a proposal appears with the old date, new date and source text, no event changes until confirmation, and confirming it sends the Feature 11 reschedule reminder.
- AC-38: With the source unavailable, the matter shows "not checked" and the last good date with its timestamp, and no proposal is created.
- AC-39: A matter listed in a sample cause list shows its serial number; a user not staffed on the matter cannot see the proposal or the reading.
- AC-40: Switching a source off for a court stops all lookups to it on the next run, in a test.

Non-goals for this feature

- Does not file, e-file or send anything to a court.
- Does not predict when a matter will be reached or its outcome.
- Does not read courts that have no public source or whose owner has refused automated access; those matters use the manual source.
- Does not replace the lawyer's own check of the cause list on the day.

### Feature 13: Order and adjournment ledger

Every order or proceeding sheet uploaded to a matter becomes one line in a running ledger: date, what happened, who was present, the next date and the direction given, with a one-line plain summary that links to the page and quote it came from. The ledger counts adjournments, shows who sought each one and why when the order says so, and lists the actions each order requires. It sits beside Feature 3 (which reads dates for deadlines) and gives Feature 4 (the brief) its "last order". Users: attorneys and paralegals; firm admins see the counts. Why it matters: Indian files carry long chains of dates, and a partner picking up a file wants "what happened last time and how many times has this been adjourned" in ten seconds; adjournments driven by counsel are the leading documented cause of delay, and some benches now insist on a prescribed adjournment slip, so a firm that keeps its own record is better placed (KNOWLEDGE-77db087b). Others offer order alerts (KNOWLEDGE-d41f2d01); the difference here is the per-line source link, a quote check, and a record that the firm controls and can export.

Feasibility in the existing code: Feasible. The ingestion pipeline (ai/lawai_ai/rag/ingest.py) already classifies and chunks uploads, document_chunks carry page references, and the quote check in review.py (`original_text in doc['content']`) is the pattern to verify each summary quote; documents, events, tasks and activities exist. Scanned orders need Feature 7 first; the first release reads orders with a text layer only. Summary quality on Indian orders is unmeasured (ASSUMPTION-fbb3a1a5).

Functional requirements

- FR-70: On ingestion of a document classified as an order or proceeding sheet, extract the order date, the stage or business, appearance, the next date, any direction or time given, and whether the hearing was adjourned and at whose request if stated, each with the page and the verbatim text it came from.
- FR-71: Store one ledger entry per order with a one-line summary written by the system; every entry links to the source page, and a field whose quote is not found verbatim in the document is left blank and marked "not found".
- FR-72: Show a per-matter timeline of entries with the running count of adjournments and a list of directions with a due date, where the order states one.
- FR-73: A direction with a stated period can be proposed as a task or deadline through the Feature 3 path; nothing is created until a human confirms.
- FR-74: A user can correct any ledger field; the correction is logged to activities with user and time, and the original reading is kept.
- FR-75: The ledger can be exported as a one-page chronology (printable) with source page numbers, for staff use and for Feature 4.

Non-functional requirements

- NFR-27: Ledger extraction runs asynchronously after ingestion and never blocks upload; a failure sets a visible status with a reason (NFR-13 pattern).

Acceptance criteria

- AC-41: Given a sample order that adjourns a hearing to a later date, the ledger shows an entry with the next date, an adjournment count increased by one, and a link to the page; the quoted date appears verbatim on that page.
- AC-42: An extracted field whose quote is not found in the document is not shown as fact; it shows "not found".
- AC-43: A user not staffed on the matter cannot see its ledger, and a correction by a user appears in activities.

Non-goals for this feature

- Does not judge whether an adjournment was justified, or recommend strategy.
- Does not read scanned orders until Feature 7 exists.
- Does not draft or file adjournment slips in the first release.

### Feature 14: Court-fee and stamp-duty calculator

A calculator that works out the court fee payable on a plaint, appeal or application, and the stamp duty on common documents, for the court's or state's rules, showing the formula and the section it applied. The rules live in the Jurisdiction Pack (Feature 2), so a new state is added as data and not as code. The calculator states the figure and its basis; the lawyer confirms it. Users: attorneys and paralegals preparing filings and agreements. Why it matters: court fees and stamp duty vary by state and by type of suit or instrument (KNOWLEDGE-77db087b), and an insufficient fee or an under-stamped document causes objections or delay at filing; firms keep the rate tables in a notebook or in someone's head. A calculator that cites the state Act and shows its working is plain, checkable and does not need a language model to decide the number.

Feasibility in the existing code: Feasible, because it is the same pattern as the deadline engine. deadline_rules and jurisdictions (src/db/schema.ts) and compute_deadline (ai/lawai_ai/agent/deadlines.py, src/lib/deadlines.ts) show how a rule table plus a pure function gives a cited result. The cost is data work: transcribing and lawyer-reviewing each state's schedule (ASSUMPTION-28217fff). Start with the states that match the planned court profiles (Delhi, Maharashtra) and add others as packs. The tool also fits the research and draft agents as a deterministic tool (ai/lawai_ai/agent/tools.py), so the assistant quotes the calculator and never computes a fee from memory.

Functional requirements

- FR-76: Extend the jurisdiction pack format with fee rules: a rule has a kind (court fee or stamp duty), an applicable court or state, an instrument or proceeding type, a slab or fixed table with the valuation basis, a cap if any, the statutory citation, an effective-from date and provenance (FR-10).
- FR-77: Given a state, a proceeding or instrument type and a value, compute the fee or duty by a pure function, and show the rule used, each slab applied, the arithmetic and the citation; no language model decides the number.
- FR-78: Every fee rule is marked reviewed by a qualified lawyer before it can be used; an unreviewed rule is not offered, and a calculation shows the pack version and the rule's effective date.
- FR-79: When a value falls on a date before or after a rule's effective date, use the rule in force on the filing date entered by the user, and warn when the chosen date is outside any loaded rule's validity.
- FR-80: The result can be added to a matter as a note or a task for the paralegal; nothing else is created, and the assistant can call the calculator as a tool and quote its output with the citation.
- FR-81: State clearly in the result that the figure is a calculation to be confirmed against the current notification and the court's registry, and that purchase or payment of stamps (e-stamping) is outside LawAI.

Non-functional requirements

- NFR-28: A calculation returns in under 1 second and is reproducible: the same inputs and the same pack version always give the same result.
- NFR-29: Fee rules are platform-managed and read-only for firms (NFR-4).

Acceptance criteria

- AC-44: For a seeded rule with two slabs, a value that spans both slabs produces the sum of both with each slab's arithmetic shown, and a test fails if the arithmetic differs from a hand-checked value.
- AC-45: A rule without a lawyer-review mark is not offered in the calculator.
- AC-46: A calculation for a state with no loaded rule returns "no rule loaded" and no figure.
- AC-47: Every seeded fee rule has a non-empty citation, effective date and official source URL; a test fails otherwise. A fixture second state loads and computes with no code change.

Non-goals for this feature

- Does not buy stamps, pay fees or file anything, and does not give valuation advice (the user supplies the value).
- Does not cover every Indian state in the first release; states are added as packs.
- Does not interpret disputed questions of valuation or maintainability.

### Feature 15: Conflict check at intake

Before a firm takes on a new client or matter, LawAI searches the firm's own records for the client's name, the opposing parties, their counsel and related names, and shows any earlier matter that touches them, so a conflict is found before work starts. The result is recorded on the client and matter with who checked and when, and a firm admin decides what to do with a hit. Users: attorneys and paralegals running intake; firm admins (decide on hits). Why it matters: acting against a former or current client is a professional-conduct problem under the Bar Council of India's rules, and the current system only stores a date saying a check was done, not what was checked (KNOWLEDGE-77db087b). Global practice tools include conflict checks (Clio, KNOWLEDGE-d41f2d01), but small Indian firms usually rely on memory; a check that handles spelling and name-order variants common in Indian names, and that respects the firm's ethical walls, is an easy, daily-visible safeguard to sell.

Feasibility in the existing code: Feasible. clients.conflict_checked_at, cases.opposing_party and cases.opposing_counsel already hold the names, and the clients and cases pages already search by ilike (src/lib/queries/cases.ts, src/app/(app)/search/page.tsx). Fuzzy matching can use a Postgres extension (pg_trgm) on the same database; no new service. Real design question: a conflict check must see matters the user is not staffed on, which is the exact thing RULE-3 forbids. The design below resolves it without reading any matter content: the check returns only the fact of a hit, the matching name, the role it had and the name of the matter's lead, never documents, notes or tasks, and the admin can see everything as today. This is a deliberate, narrow exception to the within-firm matter filter and needs the owner's approval before it is built (ASSUMPTION-8a1b6888).

Functional requirements

- FR-82: At client creation and matter opening, the user enters the client, related parties, opposing parties and opposing counsel, and runs a conflict check across the firm's clients, matters, opposing parties and opposing counsel.
- FR-83: Matching is tolerant of spelling, case, punctuation, initials and word order, and shows a match strength; exact and close matches are listed first.
- FR-84: A hit shows only: the matched name, the role it appears in (client, opposing party, opposing counsel), the matter's title and status, and the matter's lead; it never shows documents, notes, tasks, AI chats or other content of a matter the user is not staffed on.
- FR-85: Each hit must be resolved by a firm admin as cleared (with a reason), declined, or referred, and the decision is recorded with user and time; a matter with an unresolved hit is flagged and cannot be marked active until resolved.
- FR-86: Record the check on the client and matter: names searched, time, who ran it, the hits and their resolution; this replaces the bare date in clients.conflict_checked_at.
- FR-87: Re-run the check on request and automatically when an opposing party or counsel is added to a matter, and log each run to activities.

Non-functional requirements

- NFR-30: A check across 10,000 names returns in under 2 seconds.
- NFR-31: The check reads names and roles only, and the access it performs on unstaffed matters is itself logged (it appears in the Feature 5 access log when that exists).

Acceptance criteria

- AC-48: Given an earlier matter against a company named "ABC Traders Pvt Ltd", entering "A.B.C. Traders Private Limited" as a new client finds it as a close match.
- AC-49: A paralegal not staffed on the earlier matter sees the hit with the matter title, role and lead, and cannot open the matter, its documents or its notes.
- AC-50: A matter with an unresolved hit cannot be marked active; after a firm admin clears it with a reason, it can.
- AC-51: A user in firm B never sees a hit from firm A, in a cross-firm test.

Non-goals for this feature

- Does not decide whether a conflict exists in law; it surfaces possible matches for a person to decide.
- Does not search other firms or external databases, and does not check conflicts of lawyers' personal interests.
- Does not apply a screening wall by itself; that remains an admin action through staffing.

### Feature 16: Client updates on WhatsApp

Approved client updates and approved hearing reminders can be delivered to the client's WhatsApp number as well as shown in the portal. Only content a firm admin has already approved is ever sent. It is one-way: the firm sends, the client reads. A client who wants to say something replies to the firm's number and a staff member reads and answers it as usual; no AI answers a client. Users: clients (receive), attorneys (author), firm admins (approve). Why it matters: Indian clients live on WhatsApp and many never open an email or a portal; firms already answer "what is the status" on their personal numbers, which scatters records and leaves no approval trail; this is reported by vendor marketing material and is not measured (KNOWLEDGE-d41f2d01). Sending the approved update to the channel the client already uses, through the firm's business number with a logged approval, is the practical way to reach them. Sellable because it answers the daily phone call.

Feasibility in the existing code: Feasible with new work and outside approvals. It reuses Feature 9's approved-update store (to be built) and Feature 11's delivery log, channel preferences and consent fields; clients.phone exists. New: a WhatsApp Business provider account for the firm or for the platform, message templates approved by Meta, an opt-in record per client, and a webhook for delivery status and for the client's opt-out. Approval lead time and per-message cost are unvalidated (ASSUMPTION-3f41aff2). The owner asked for an assistant that answers on WhatsApp; this specification deliberately limits the first release to one-way approved updates, because the existing global non-goal rules out client-facing AI chat.

Functional requirements

- FR-88: A firm admin can enable WhatsApp delivery for a client who has given recorded consent and a number; the consent, number and time are stored, and the client can withdraw by replying STOP, which takes effect immediately.
- FR-89: An approved Feature 9 update, or an approved Feature 11 client reminder, is sent to the client's WhatsApp number using a pre-approved message template containing only approved fields and a link to the portal where one exists; the model cannot add text.
- FR-90: Nothing is sent that has not been approved by a firm admin; retracting an approved update stops any unsent delivery and logs the retraction (FR-44).
- FR-91: Record every message with status, provider id, failure reason and time in the delivery log (FR-59), visible to staff on the matter and to the firm admin.
- FR-92: A client's replies are shown to the matter's staff in an in-app inbox item linked to the client; they are not answered by the system and are not shown to other clients or to unstaffed users.

Non-functional requirements

- NFR-32: A message is sent within 15 minutes of approval (or its scheduled time), at most once per update per client.
- NFR-33: Phone numbers and message content are stored only in firm-scoped tables, redacted in logs, and the provider is listed as a sub-processor in the ethical-wall receipt (FR-23).

Acceptance criteria

- AC-52: A drafted but unapproved update is not sent; after approval it is sent once to a consenting client and the log shows the delivery.
- AC-53: A client who replied STOP receives no further message, and the log shows later updates as skipped.
- AC-54: A reply from a client appears only to staff on that client's matter; a user in another firm or matter sees nothing.

Non-goals for this feature

- Does not answer clients with AI, hold a chat, take payments or send documents in the first release.
- Does not send marketing messages or any message that the firm admin has not approved.
- Does not use the lawyers' personal WhatsApp numbers.

### Feature 17: Notice and court-paper templates

A library of Indian starter templates for the papers a litigation practice produces over and over: a legal notice, a reply to a notice, a Section 138 Negotiable Instruments Act cheque-bounce demand notice, a vakalatnama, and a draft affidavit. The user picks a matter and a template; the parties, court, case number and dates are filled from the matter record, every blank that is not known stays visibly blank, and a limitation clock shows the dates that matter. For a Section 138 notice that means the last day to send the notice (30 days from when the drawee bank's return information is received), the end of the 15-day payment period (counted from receipt of the notice), and the last day to file the complaint (one month from the day that period lapses), each with the section it came from (KNOWLEDGE-48d74715). Statute references in a template are checked against the statute library of the India pack (Feature 2) so a template cannot carry a citation the system cannot find. The lawyer reviews and approves the paper; sending or serving it, and swearing an affidavit, stay with the lawyer outside LawAI. Users: attorneys and paralegals; platform operator (maintains the starter set); firm admins (firm-specific copies). Why it matters: Section 138 notices are a high-volume, deadline-driven staple for small Indian firms, and online services now sell a drafted notice from about Rs 1,499 (KNOWLEDGE-48d74715), so a firm that can produce a correct one in minutes, with the dates counted and checkable, keeps the work it would otherwise lose to those services. It also shows the India pack at work on the first day: a limitation rule, a statute citation and a deadline proposal in one screen.

Feasibility in the existing code: Feasible. The matter, party and court fields exist (cases.court, cases.case_number, cases.opposing_party, clients in src/db/schema.ts); drafting and saving a draft as a document exist (ai/lawai_ai/draft.py, src/app/api/draft/route.ts); the date arithmetic is the pattern of compute_deadline (ai/lawai_ai/agent/deadlines.py, src/lib/deadlines.ts) and needs Feature 2's pack format and holiday table; the proposal-and-confirm path is Feature 3's; the citation check is Feature 1's. New: a template record type in the pack format (template text with named fields, source citations, review mark), a fill step, and a DOCX/PDF render (shared with Feature 10 when it exists; a plain DOCX until then). The legal accuracy of the starter templates and of the Section 138 counting (service date, holidays, condonation) depends on a qualified lawyer's review (ASSUMPTION-6658a5ec). Dates computed here are proposals, not filings.

Functional requirements

- FR-99: Provide a template library with two layers: platform starter templates delivered through the jurisdiction pack (versioned, each with provenance and a qualified-lawyer review mark, FR-10, read-only for firms) and firm templates that a firm admin copies from a starter template or writes, editable only inside that firm. A starter template without a review mark is not offered. The first release ships five: legal notice, reply to notice, Section 138 demand notice, vakalatnama and affidavit draft.
- FR-100: Filling a template for a matter takes values from the matter, client and opposing-party records and from fields the user types; each filled value shows where it came from; a field with no known value stays a visible blank and is never invented or guessed by a model.
- FR-101: For a Section 138 notice the user enters the cheque details and the dates the bank's return information and the notice were received; the system computes the last day to send the notice, the end of the payment period and the last day to file the complaint by a pure function over the pack rules, applying the pack's court holidays where the rule says to, and shows each rule, its citation and any exclusion applied (extends FR-9).
- FR-102: The limitation clock shows each date as open, closing within a configurable number of days, or passed, and warns before a notice is generated when an entered date makes a step already late; the computed dates can be offered as proposed events and tasks through the Feature 3 path, and nothing is written to the calendar or tasks until a person confirms.
- FR-103: Every statute or case citation in the generated paper carries a Feature 1 label; a platform template cannot be published if any of its fixed citations cannot be found in the pack statute library. An optional model-written paragraph (for example the narrative of facts) is inserted only when the user asks, is marked as a draft, and cannot change the fixed template text.
- FR-104: The generated paper is saved as a draft document on the matter with the template id and version; an attorney marks it approved for issue (FR-51), with user and time, before its status can be set to final; export is DOCX and PDF. Generation, edits and approval are logged to activities.
- FR-105: A vakalatnama or affidavit shows an execution checklist taken from the template's reviewed notes (for example the client's signature, any court-specific welfare stamp or fee, and the oath commissioner or notary for an affidavit), so the lawyer sees what must still happen outside LawAI; where the pack holds no reviewed note for the court, the checklist says so and gives no stamp amount.

Non-functional requirements

- NFR-34: Filling a template and computing its dates completes in under 3 seconds excluding the optional model paragraph, and is reproducible: the same inputs and pack version always give the same dates and text.
- NFR-35: Template and computation reads use only data inside the requesting user's firm and the matters they are staffed on; firm templates never cross firms.

Acceptance criteria

- AC-61: Given a Section 138 matter with the return-information date, notice-received date and a court holiday falling on the last day of a period, the three dates match a hand-checked value, the holiday and rule appear in the explanation, and a test fails if the arithmetic differs.
- AC-62: A template filled for a matter with no opposing-party address leaves the address blank and visible; no value in the output lacks a source or a typed origin.
- AC-63: A starter template without a review mark is not offered; a firm template made by firm A is not visible to firm B; a user not staffed on the matter cannot generate a paper for it.

Non-goals for this feature

- Does not advise whether a notice should be sent, whether a cheque case is maintainable, or whether delay can be condoned; the lawyer decides.
- Does not send, post, serve or file anything, does not swear or e-sign an affidavit, and does not buy stamps.
- Does not cover every notice or pleading type, and does not carry state-specific vakalatnama rules beyond what a reviewed pack note records.

### Feature 18: Firm precedent bank

The firm's own best drafts, kept as a searchable, reusable library. An attorney staffed on a matter saves a finished document, or selected clauses, as a precedent; the system lists every place the matter's client, party and counsel names appear so they can be replaced with placeholders; a firm admin approves it; from then on anyone in the firm can find it by plain words and drop its wording into a new draft, with the precedent's name and version shown next to the inserted text. Users: attorneys and paralegals (search and use); attorneys staffed on a matter (submit); firm admins (approve and retire). Why it matters: every firm reuses its old drafts, today by hunting through folders or emailing a senior, and the hunt is where the time and the inconsistency come from; a library built from the firm's own approved wording is what a mid-size firm values most and what no competitor can ship ready-made, because it is built from each firm's own work. Spellbook sells precedent search over a firm's past contracts and Indian rivals report clause libraries (KNOWLEDGE-48d74715; vendor claims); the difference here is that a precedent enters the library only through a named-person approval and a name check, so one client's matter never leaks into another through reuse.

Feasibility in the existing code: Feasible. Retrieval over document chunks with keyword and meaning search exists (ai/lawai_ai/rag/search.py, document_chunks and legal_sources in src/db/schema.ts); document_versions and the drafting mode exist (ai/lawai_ai/draft.py); the approval pattern is the Feature 6 rule queue. New: a precedents table (firm-scoped copy of the text, kind, practice area, jurisdiction, tags, status, approver, review-by date), a deterministic name finder over clients.name, cases.opposing_party and cases.opposing_counsel, and an insertion step with an inline source tag. The central design point is RULE-3: a precedent is a separate, sanitised copy, never a pointer to the original, so staffing on the source matter does not govern it, and the name check plus human approval stand in for that boundary (ASSUMPTION-cbb34f30).

Functional requirements

- FR-106: An attorney staffed on a matter can save a document, or a selection of it, as a precedent; this creates a separate copy owned by the firm with a title, document kind, practice area, jurisdiction, tags and a short note on when to use it. Original documents and their staffing are unchanged.
- FR-107: Before a precedent can be submitted, the system lists every occurrence of the source matter's client, party and counsel names, and of the client's contact details held on record, found by deterministic matching; the submitter must replace each with a placeholder or confirm it as intended, and a precedent with an unresolved occurrence cannot be submitted.
- FR-108: A precedent is visible to the firm only after a firm admin approves it; approval records user and time, edits create new versions, and a precedent can be retired (hidden from search and drafting) and restored. Each precedent carries a review-by date (default 12 months) and the admin sees which are past it.
- FR-109: Search finds approved precedents by words and by meaning, filtered by document kind, practice area and jurisdiction, and shows the matching passage, version and approver. The name or link of the source matter is shown only to users staffed on it.
- FR-110: In drafting, the user can insert a precedent passage; inserted text is the stored text verbatim and carries an inline tag naming the precedent and version. The model may propose adapting defined terms or party names to the matter only as a visible change the user accepts or rejects; it cannot alter the inserted text silently.
- FR-111: Each use of a precedent is recorded (who, matter, precedent version, time), the firm admin can see how often each is used, and an ethical-wall receipt (Feature 5) lists precedent use on a matter.

Non-functional requirements

- NFR-36: Precedent search over 5,000 precedents returns in under 2 seconds.
- NFR-37: Precedents carry firm_id, are never shared across firms or with the platform operator, and are not used to train or fine-tune any model (NFR-11).

Acceptance criteria

- AC-64: A precedent made from a matter whose client is "ABC Traders Pvt Ltd" cannot be submitted while "ABC Traders Pvt Ltd" or the opposing party's name still appears, and can be submitted after each is replaced or confirmed.
- AC-65: An unapproved or retired precedent is not returned by search or offered in drafting; an approved one is returned to a user who is not staffed on the source matter, with no source-matter name or link.
- AC-66: A passage inserted from a precedent matches the stored text character for character and shows the precedent and version; a user in firm B finds no precedent from firm A.

Non-goals for this feature

- Does not collect precedents automatically from past matters; each one is submitted and approved by a person.
- Does not share precedents between firms, sell them, or offer a public clause marketplace.
- Does not say a precedent is good law, current or suitable for the matter; the lawyer decides.
- Does not provide a Word add-in in the first release.

### Feature 19: Client intake link

A private link the firm sends to a person who has already contacted it. The person fills in a short form (who they are, who the other side is, what happened in a few lines, the dates they know, the language they prefer) after reading a consent notice written by the firm. The answers land in an intake inbox, not in the client list. LawAI runs the conflict check (Feature 15) on the names in the form straight away, and a staff member reviews the item, then turns it into a client and matter with the fields pre-filled, or declines it. Users: attorneys and paralegals (send the link, review), firm admins (conflict decisions, form and notice settings), the prospective client (fills the form; has no account and no login). Why it matters: first calls are where small firms lose time and miss details; a form the prospect fills at home gives the firm clean names for the conflict check before any work starts, and it replaces notes taken on a phone call. Global tools sell this (Clio Grow, KNOWLEDGE-48d74715); for a small Indian firm the new part is that the intake feeds a conflict check tolerant of Indian name variants, and the consent notice is recorded for the DPDP Act.

Feasibility in the existing code: Feasible with one new kind of public page. The one-time token pattern exists (user_tokens, src/app/invite/[token], sha256 of the token stored, expiry and used-at); sendEmail exists (src/lib/email.ts); client and matter creation exist (src/app/actions/practice.ts); the conflict check is Feature 15 (build this one after it). New: an intake_links and intake_items pair of tables, a public route that must be exempt from the signed-in session rule in src/proxy.ts and must be rate-limited, and a retention job. The first release has no file upload from the prospect, because an unauthenticated upload needs scanning and abuse controls that are not in the stack. Whether a private link sent to someone who already contacted the firm sits comfortably with Bar Council of India Rule 36 (no advertising or soliciting), and what consent wording the DPDP Act needs, need a lawyer's confirmation (ASSUMPTION-62035a71).

Functional requirements

- FR-112: A staff member creates an intake link for a named prospect: single-use, unguessable, expiring (default 7 days), revocable, stored only as a hash, and carrying no firm data other than the firm's name and the form. Staff can send it by email through the firm's address or copy it; the system never sends it on its own.
- FR-113: The form is built from a fixed set of fields the firm admin switches on or off (name, individual or company, contact details, opposing parties and their counsel if known, a short summary, key dates with a label, preferred language). It shows the firm's consent notice before the fields; the notice text, version and the time of agreement are stored with the submission, and a form cannot be submitted without agreeing.
- FR-114: A submission is stored in an intake inbox as an item with its own firm_id; it does not create a client, matter, task or event. The inbox is visible to firm admins and to the staff member who created the link.
- FR-115: On submission, run the Feature 15 conflict check over the submitted names automatically and attach the result to the item; the admin resolves hits as in FR-85, and an item with an unresolved hit cannot be converted.
- FR-116: Converting an item to a client and matter is a staff action (FR-51): the staff member reviews and edits the pre-filled fields and confirms; declining an item sends nothing to the prospect, and any reply is written by a person.
- FR-117: The public endpoint is rate-limited per address and per link, accepts only the form's fields within fixed size limits, answers an invalid, expired, used and revoked link in the same way, and shows nothing about the firm's clients or other links. The submitted text is treated as untrusted input wherever it is displayed.
- FR-118: Intake items that are not converted are deleted or anonymised after a configurable period (default 90 days) and the deletion is logged to activities; the firm admin can delete an item sooner.

Non-functional requirements

- NFR-38: The public form loads in under 2 seconds at the 95th percentile and works on a phone browser.
- NFR-39: The public route reads and writes only intake_links and intake_items and cannot reach any other table; intake data is firm-scoped, redacted in logs, and the email provider is listed as a sub-processor in the ethical-wall receipt (FR-23).

Acceptance criteria

- AC-67: Submitting a valid link creates one inbox item and zero rows in clients and cases; reusing the link, an expired link and a revoked link all return the same generic message.
- AC-68: A submission naming an opposing party that matches an earlier client's name as a close match shows the conflict hit on the item, and the item cannot be converted until a firm admin resolves it.
- AC-69: A user in another firm, and a staff member who is neither admin nor the link's creator, cannot see the item; an unconverted item is gone after the retention period, in a test with a shortened period.

Non-goals for this feature

- Does not answer the prospect with AI, chat with them, or send them any message on its own.
- Does not provide a public page, directory, lead list or marketing tool, and does not advertise the firm.
- Does not take documents, signatures, engagement letters or payments from the prospect in the first release.
- Does not decide whether the firm takes the matter.

### Feature 20: Fee notes and GST invoices

Turns approved time and agreed fees into an invoice the firm can issue. The user picks a matter and a period; LawAI drafts an invoice from approved time entries plus any fixed fee or expense lines added by hand, works out GST from the firm's and client's tax details (including the reverse-charge case that applies to many legal services supplied to businesses), and shows the working. A firm admin approves and issues it with a sequential number; nothing goes to the client until a person sends it. Receipts are recorded by hand and a statement of account shows fees billed, expenses, receipts and the balance for the matter. Users: firm admins and designated attorneys (approve and issue), attorneys (draft), the firm's accountant (reads an export). Why it matters: the owner reports that billing is manual, time is logged but never becomes a bill, and an invoice built from the matter's own approved time closes the loop that Feature 8 starts; it is also the clearest sign to an investor that the product sits in the firm's money flow, not just its files. Indian billing tools exist and are cheap (myBillBook from about Rs 399 a year, TallyPrime, LawSathi; vendor pages, KNOWLEDGE-48d74715), so the difference has to be the link to approved matter time, a tax rule table that knows how services by advocates are taxed, and the approval trail, and not the invoice form itself.

Feasibility in the existing code: Feasible with new work, and it narrows a stated global non-goal, which needs the owner's approval (ASSUMPTION-194cb371). time_entries holds hours, billable flag, narrative, user and matter (src/db/schema.ts); firms, clients (clients.billing as free text) and users exist; reports compute hours (src/lib/queries/reports.ts); sendEmail exists. Gaps: there are no hourly rates, no invoice, line, receipt or tax tables, no GSTIN fields on firms or clients, and no tax-rule data. The tax rule table follows the Feature 2 and 14 pattern (versioned rules, citation, effective date, provenance, review mark) and must be reviewed by a chartered accountant before it is enabled (ASSUMPTION-194cb371). GST, e-invoicing and Bar Council fee rules are summarised from secondary sources and must be checked against the Acts, notifications and Rules (KNOWLEDGE-48d74715).

Functional requirements

- FR-119: Draft an invoice for a matter and period from time entries that are approved and billable (never from Feature 8 drafts that are still unapproved), priced at a rate set by a firm admin per person or per matter (new setting), plus fixed-fee, per-appearance, retainer and expense lines added by hand. Each line links to its source entries, and the draft shows totals before tax.
- FR-120: Firm and client tax details (GSTIN where registered, state, registered or unregistered, business entity or not) drive tax by a pure function over a versioned, lawyer-and-accountant-reviewed rule table: tax split into CGST and SGST for supplies within the state and IGST across states; the reverse-charge case where the rule says the client pays, shown with the statement and no tax added; and the case where no tax applies. The invoice shows the rule, its citation and its version; an unreviewed rule is not offered; a missing client tax detail blocks issue and says which one is missing.
- FR-121: Offer only these fee types: hourly, fixed, per appearance, retainer and expenses. No fee that depends on the outcome of the case or on a share of the recovery is offered (a Bar Council of India rule bars it, KNOWLEDGE-48d74715).
- FR-122: A firm admin (or an attorney the admin designates) approves and issues the invoice, recording user and time (FR-51). On issue it gets the next number in a gapless sequence per financial year, becomes read-only, and is stored with its rule version; a draft or cancelled draft uses no number. A correction after issue is a credit note linked to the invoice.
- FR-123: Issuing produces a PDF; sending it to the client by email is a separate, logged action by a person using the firm's address; nothing is sent automatically, and a reminder for an unpaid invoice is a task for staff, not a message to the client.
- FR-124: Staff record receipts by hand (date, amount, mode, and whether it is fee money or expense money, per the client-money accounting duty in the Bar Council rules); marking an invoice paid is a person's action. A per-matter statement of account lists fees billed, expenses, receipts and the balance, and is exportable. LawAI never collects, holds or moves money.
- FR-125: Export an invoice register as CSV for the firm's accountant: number, date, client, GSTIN, taxable value, each tax, reverse-charge flag, credit-note links and status.
- FR-126: The firm may set an optional disclosure line printed on invoices (for example, that AI tools assisted drafting); LawAI asserts no legal requirement for it (ASSUMPTION-8ee6ad2f).

Non-functional requirements

- NFR-40: Totals, tax and rounding are computed by deterministic code with a fixed rounding rule; the same inputs and rule version always give the same invoice, and a test compares a set of hand-checked invoices.
- NFR-41: Invoices, lines, receipts and tax details carry firm_id, are visible to firm admins and to attorneys staffed on the matter, are never visible to paralegals unless the admin allows it, and are never part of any client-visible record (RULE-4) until a person sends the PDF.

Acceptance criteria

- AC-70: For a business client of an advocates' firm, the invoice shows no tax added and the reverse-charge statement; for a client that is not a business entity, tax follows the reviewed rule, with CGST and SGST for a client in the same state and IGST for another state, each matching a hand-checked value.
- AC-71: Two issued invoices in one financial year have consecutive numbers; a cancelled draft consumes no number; an issued invoice cannot be edited, and a credit note is the only correction.
- AC-72: Time entries not approved, and drafts from Feature 8 awaiting approval, never appear on a draft invoice; a draft invoice writes no number, no sent email and no client-visible record until a person issues and sends it.
- AC-73: The fee-type list contains no outcome-based option; a user not staffed on the matter, and a user in another firm, cannot see its invoices; the register export matches the issued invoices.

Non-goals for this feature

- Does not collect payments, hold client money, connect to payment gateways or bank accounts, or reconcile bank statements.
- Does not generate e-invoice IRNs, file GST returns, handle TDS, or give tax advice; the firm's accountant remains responsible.
- Does not offer outcome-based fees, and does not set the firm's rates or fees.
- Does not send invoices or reminders on its own.

### Feature 21: Version compare and counterparty redline

Shows exactly what changed between two versions of a document, or between the firm's last version and a draft that comes back from the other side. The comparison is done by code on the stored text, so it never misses a changed word and never invents one. Changes are grouped by clause. Each change that touches one of the firm's playbook rules is flagged with the rule and the exact words. The lawyer accepts or rejects change by change, which produces a new version through the existing version flow, and can export the redline as a PDF. Users: attorneys and paralegals negotiating or amending documents. Why it matters: when the other side returns a draft, the first job is to find what they changed, including the quiet edits; doing that by eye on a 40-page agreement is slow and risky, and Word's compare works on files, not on the firm's matter, versions and rules. Tying the comparison to the playbook is what turns it from a diff into a negotiation tool, and it makes the existing review feature earn its place on every round.

Feasibility in the existing code: Feasible, and small. document_versions keeps the full text of every version and the restore flow exists (src/db/schema.ts, src/app/actions/documents.ts); the playbook check and its verbatim quote test exist (ai/lawai_ai/review.py, playbook_rules, document_issues); an uploaded Word or text file is parsed by ai/lawai_ai/rag/parse.py. New: a word-level text diff (a standard library or short routine, no model), clause grouping by headings and numbering, a merge step for accepted changes, and a PDF render of the redline (shared with Feature 10 when it exists). Clause grouping on real documents is unmeasured (ASSUMPTION-174e44f9); a scanned counterparty draft cannot be compared until Feature 7 exists, and Word tracked-changes export is not promised in the first release.

Functional requirements

- FR-127: A user can compare any two versions of a document they can access, or upload a counterparty draft, which is stored as a new version labelled with its source, and compare it with a chosen earlier version; both versions must belong to matters the user is staffed on.
- FR-128: The difference is computed by code at word level from the stored text, shown as insertions and deletions with the clause heading or number and the page or paragraph; identical text produces no change, and moved text is shown as a deletion and an insertion.
- FR-129: Changes are grouped by clause and counted; the view lets the user filter to changes that touch playbook rules.
- FR-130: For each changed clause, run the playbook check (review.py) on the changed text only and flag any change that breaks or relaxes an active rule, showing the rule and the verbatim quote; a flag whose quote is not found in the changed text is not shown.
- FR-131: A plain-language note per change may be generated on request; it is labelled as an AI draft, links to the changed text, and is omitted if it does not (RULE-8).
- FR-132: The user accepts or rejects each change; accepting a set creates a new version through the existing version flow with the accepted changes applied; the redline can be exported as a PDF showing insertions and deletions, and every run, acceptance and export is logged to activities. Nothing is sent to the other side.

Non-functional requirements

- NFR-42: Comparing two 100-page documents completes in under 10 seconds excluding optional notes and playbook checks.
- NFR-43: Comparison and flags read only documents inside the requesting user's firm and staffed matters; the uploaded counterparty draft is ingested like any upload and obeys the same size and type limits.

Acceptance criteria

- AC-74: Given two versions of a 20-page agreement that differ by one changed word and one deleted sentence, the comparison shows exactly those two changes with their clause references and no others.
- AC-75: A changed payment-terms clause that breaks an active playbook rule is flagged with that rule and a verbatim quote; a change that touches no rule is not flagged.
- AC-76: Accepting two of three changes produces a new version containing exactly those two; a user not staffed on the matter cannot compare its versions.

Non-goals for this feature

- Does not send a redline to the other side, negotiate, or advise which change to accept.
- Does not compare scanned images before Feature 7, and does not promise a Word plug-in or Word tracked-changes export in the first release.
- Does not judge the legal effect of a change; flags show what the firm's own rules say.

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

Features 1 to 10 were ordered by the product owner on 2026-10-19 (DECISION-8949e592). Rationale: trust first, then the local moat, then workflows that reuse those foundations, with the heaviest ML/OCR work last. Features 11 to 16 were added on 2026-10-19 and slotted in without changing the relative order of the original ten (DECISION-bd89e06d, DECISION-27fee276). Features 17 to 21 were added on 2026-10-19 and slotted in the same way (DECISION-27781608); the relative order of Features 1 to 16 is unchanged, and the owner can reorder any of them. Feature numbers and requirement IDs keep their original labels; this is the delivery order.

1. Feature 1: Cite-Proof ledger
2. Feature 11: Hearing reminders. Placed right after the Cite-Proof ledger because it is the cheapest feature in the specification (the hearing data, in-app notifications and email sending already exist, see Feature 11), it is a daily-use hook that gets the product opened every evening, it creates the scheduler, delivery log and channel preferences that Features 12, 16 and 4 reuse, and it does not depend on Feature 2 or 3. WhatsApp and SMS provider approvals have unknown lead time, so start that paperwork at the beginning of the build; the first release can ship in-app and email while approvals are pending.
3. Feature 2: Jurisdiction Packs (India first)
4. Feature 3: Service-to-calendar autopilot
5. Feature 12: Court-date watch (needs Feature 11 for alerts and Feature 3's proposal-and-confirm mechanism)
6. Feature 4: Hearing-day brief
7. Feature 13: Order and adjournment ledger (extends Feature 3's extraction; feeds the "last order" in Feature 4)
8. Feature 17: Notice and court-paper templates. Needs the pack format, statute library and limitation rules from Feature 2, the proposal path from Feature 3 and the labels from Feature 1, so it cannot come earlier; placed after the court-date work so the daily litigation loop (reminders, watch, brief, ledger) lands first, and before the billing work because it is the quickest way to show a litigation firm the India pack doing paid-for work. Start the lawyer review of the starter templates and the Section 138 rules while Feature 2 is being built.
9. Feature 8: AI time capture
10. Feature 20: Fee notes and GST invoices. Placed right after Feature 8 because an invoice is only as good as the approved time under it, and Feature 8 is what makes approved time complete. Needs the owner's approval of the narrowed billing non-goal (ASSUMPTION-194cb371) and an accountant's review of the tax rule table, which should start early because it runs in parallel with the build.
11. Feature 5: Ethical-wall receipts
12. Feature 15: Conflict check at intake (after Feature 5, because it adds a narrow, logged exception to the matter filter that the access log should record)
13. Feature 19: Client intake link. Needs Feature 15 (its names are checked the moment a form arrives) and Feature 5 (its logging), so it follows them directly; it is the first feature with a public page, so it also carries the rate-limiting and input-handling work.
14. Feature 9: Client status portal
15. Feature 16: Client updates on WhatsApp (needs Feature 9's approved updates and Feature 11's channels and delivery log)
16. Feature 10: Courtroom-ready export
17. Feature 21: Version compare and counterparty redline. A small build with no heavy dependency; placed after Feature 10 so it can reuse the PDF and DOCX rendering. If the owner wants a quick win earlier, it can move up without breaking anything.
18. Feature 14: Court-fee and stamp-duty calculator (needs Feature 2's pack format; sits beside filing-time work)
19. Feature 18: Firm precedent bank. Placed with the firm-learning features: it shares the approval-queue pattern with Feature 6, and it is more useful once drafting, Cite-Proof labels and the court export exist, because that is when firms start asking to reuse their best drafts.
20. Feature 6: Firm-memory playbooks
21. Feature 7: Hindi/English documents

## Constraints

- Existing stack: Next.js 16 app, Python AI service, Postgres 16 with pgvector, R2/S3 storage (docs/ARCHITECTURE.md). Next.js here has breaking changes; follow node_modules/next/dist/docs/ (AGENTS.md).
- India first, not India only: legal content, holidays and statutes come from free official government sources whose provenance and licence are recorded, behind a country-pluggable pack format (Feature 2).
- DPDP Act 2023 applies to client personal data; model providers that process content must be disclosed in the ethical-wall receipt.
- This phase is specification only: no product code, plan or tasks until the user approves the specification and plan.
- Messages to people outside the firm (Features 11, 16 and 20) and the intake link email (Feature 19) go through third-party providers (email, WhatsApp Business, SMS); each provider is disclosed as a sub-processor in the ethical-wall receipt and keys come from environment variables only.
- Process rules: see RULE-5, RULE-6, RULE-7.

## Non-goals

- No legal advice, outcome prediction or court filing.
- No certification that cited authority is good law.
- No client-facing AI chat and no payments. Invoicing is limited to draft-and-approve fee invoices and manual receipts (Feature 20, pending the owner's approval, ASSUMPTION-194cb371); LawAI does not collect or hold money, generate e-invoice numbers or file GST returns.
- No model fine-tuning on client data.
- Shipping packs for countries other than India, and languages other than Hindi and English, are out of scope for this release (the pack format itself is in scope).

## Risks

- Inaccurate legal data in a pack or deadline rules: mitigated by provenance, lawyer review before a rule is enabled, and mandatory human confirmation of every deadline.
- Hindi OCR and retrieval quality may be insufficient: mitigated by confidence flags, user correction and a measured acceptance threshold before commitment.
- Over-reliance on Verified labels: mitigated by plain wording that the label means existence and quote match only.
- Portal data leakage: mitigated by a separate read model and approval-state filter (Feature 9).
- Scope: twenty-one features are large; mitigated by the fixed build order below, and by the fact that Features 11 and 13 to 21 reuse existing tables and earlier features.
- Template and Section 138 accuracy (Feature 17): a wrong period or a wrong form could cost a client a case; mitigated by lawyer review before a template or rule is enabled, citations and rule versions on every computed date, and a human approval before a paper is final (ASSUMPTION-6658a5ec).
- GST and fee-rule accuracy (Feature 20): a wrong tax treatment affects the firm's filings; mitigated by accountant review of the rule table, shown working, sequential locked numbering and no outcome-based fee type (ASSUMPTION-194cb371).
- Precedent leakage (Feature 18): a precedent that still carries a client's details would break confidentiality across matters; mitigated by a separate sanitised copy, a deterministic name check, a named approver and use logging (ASSUMPTION-cbb34f30).
- Public intake page (Feature 19): the first unauthenticated write path; mitigated by single-use hashed links, rate limits, fixed fields, no uploads, same response for every bad link and a retention limit; advertising rules and consent wording need a lawyer's check (ASSUMPTION-62035a71).
- Redline quality (Feature 21): clause grouping on real contracts is unmeasured (ASSUMPTION-174e44f9); the word-level difference itself is exact because code computes it.
- Court data access (Feature 12): no official eCourts API was found and automated reading may be refused or break; mitigated by manual import, cause-list files and written permission before automation (ASSUMPTION-8c002900).
- Messaging approvals and cost (Features 11 and 16): WhatsApp template approval, SMS registration and per-message cost are unvalidated (ASSUMPTION-b89d9a49, ASSUMPTION-3f41aff2); mitigated by shipping in-app and email first.
- Wrong or late reminder (Feature 11): a wrong time or place is worse than none; mitigated by building reminders from the hearing record only, showing the time zone, re-sending on change and recording delivery status.
- Conflict check versus matter isolation (Feature 15): needs a narrow exception to INVARIANT-994c5bc5 that the owner has not yet approved (ASSUMPTION-8a1b6888).
- Fee and duty data accuracy (Feature 14): wrong slabs would cause wrong filings; mitigated by lawyer review before use, citations, effective dates and a stated "confirm with the registry" note (ASSUMPTION-28217fff).

## Open questions

Answered on 2026-10-19 (objective, legal data source, approver, build order, court order) are recorded as decisions DECISION-2bff3c26, DECISION-348aa7bb, DECISION-8cad9c43, DECISION-8949e592 and DECISION-4c1e3d08. Still open:

- Which OCR engine and which multilingual embedding model for Hindi legal text?
- Data retention periods for logs and portal content.
- Hearing reminders and WhatsApp updates: is a per-hearing firm-admin approval of the client copy acceptable, or should a standing per-matter approval be allowed (it would still be logged and revocable)?
- Conflict check: does the owner approve the narrow exception to the within-firm matter filter described in Feature 15?
- Court-date watch: which sources are acceptable for each court, and who asks the e-Committee or NIC about permitted access?
- Which states come first for the court-fee and stamp-duty packs (suggested: Delhi and Maharashtra, matching the court profiles)?
- Does the owner approve narrowing the billing non-goal so Feature 20 can issue invoices (ASSUMPTION-194cb371)?
- Who reviews the Feature 17 starter templates and Section 138 rules, and the Feature 20 tax rule table (a lawyer and a chartered accountant), and by when (ASSUMPTION-6658a5ec, ASSUMPTION-194cb371)?
- Feature 19: may a private link be sent to a prospect under the Bar Council advertising rule, and what consent notice wording is required (ASSUMPTION-62035a71)?
- Deferred ideas to revisit: matter-closure checklist with retention archive (once retention periods are set), multi-document review grid, e-signature handoff, judgment summariser (DECISION-27781608).
