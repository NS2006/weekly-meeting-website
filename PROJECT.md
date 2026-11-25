# PROJECT.md

Go-live review dossier for this tool. Reviewers and approvers read this file before the tool is released to others. Complete it via the `project-documenter` skill before pushing to GitHub or going live. Fields marked **(owner input)** must come from the project owner; never invent them. Keep this file updated when facts change: a material change to risk level, data used, or access scope may trigger re-review.

> **Draft (2026-11-20).** Partly built (mock sign-in, Users page, teams, meeting schedules; see `CONTEXT.md`); this describes the design in `PRD & RFC Weekly Meeting Notes.md`. Sections marked **TODO (owner input)** are still empty on purpose.

## Problem Being Solved

<!-- What problem this tool solves and for whom. One short paragraph. -->

Team members keep their progress notes for recurring team meetings in personal Word files. Before each meeting someone collects the files and opens them one by one; formats differ and a project's history is scattered. Weekly Meeting Notes is an internal website where each person writes notes per project in a Word-like editor, and each meeting of a team shows every note its members linked to it on one page.

## Project Owner

<!-- (owner input) The GitHub username of the person responsible for the tool — one login, no leading @, no URL.
Must be an existing GitHub account and a member of the gdncomm-ops organization. Not a team name, not an email.
/vibe-check asks "is the project owner you (<your-github-login>)?" and records the answer here. -->

**TODO (owner input).**

## Support Contact

<!-- (owner input) A single email address contacted when issues occur.
No public webmail (gmail, yahoo, hotmail, outlook, ...) and no shared lab/group account (alpha.lab01@..., sandbox@...)
— those leave nobody accountable. A personal company mailbox is preferred; a role/queue mailbox (ops-helpdesk@...)
is accepted with a warning. -->

**TODO (owner input).** A personal company mailbox; a shared lab account is not accepted.

## Vibe Start

<!-- ISO date (YYYY-MM-DD) the vibe-coding of this project started — used to measure
project-start → staging/production duration. Stamped once by /start-vibe (today's date) for
a new project, or by /adopt-vibe (the first git commit date) for an existing one. Left blank
here; if it stays blank, /vibe-check falls back to the earliest git commit date. Do not
overwrite an existing value. -->

## Stack Exceptions

<!-- Deviations from the allowed stack (`allowedStack` in plugins/golive-gate/data/build-contract.json).
Every row needs approval from a tech architect (Tech Architecture Group). Legacy projects (Vibe Start
before 2026-10-07) may keep their existing stack without a row, but MAJOR IMPROVEMENTS always need an
approved row, even for legacy projects and even on the allowed stack: new module/service/workspace,
DB migrations or schema changes, new frontend app, runtime/framework/ORM/DB swap, major framework
upgrade. The `stack-allowed` check parses the header columns by name; keep them exactly. -->

The rows below are **requested, not approved**. Confirm with the Tech Architecture Group which of them are needed. The stack follows the company tech-radar plugin (owner decision 2026-11-20), which differs from the go-live gate's `allowedStack` (Bun, Elysia, Drizzle, Svelte + `@blibli/rnd-svelte`, `bun test`); the first four rows cover that difference.

| Scope | Deviation | Approved by | Date | Link (ADR/ticket) |
|-------|-----------|-------------|------|-------------------|
| Backend | Node.js 22 + Express 4 instead of Bun + Elysia (tech-radar default) | PENDING | | |
| Backend | Prisma Migrate (migrations) + node-postgres (queries) instead of Drizzle (tech-radar default) | PENDING | | |
| Frontend | React 19 + Vite 6 with BLUE3 React components instead of Svelte + `@blibli/rnd-svelte` (tech-radar default) | PENDING | | |
| Tests | Jest 29 + ts-jest (backend) and Vitest 4 (frontend) instead of `bun test` | PENDING | | |
| Backend | Zod 4.6.7 instead of the radar's 3.x: every 3.x release has GHSA-mrhx-c7xc-m3w5 (memory exhaustion) | PENDING | | |
| Frontend | Vitest 4.1.12 instead of the radar's 3.x: every 3.x release has GHSA-82fw-gwwq-j7x9 (file read via mocker) | PENDING | | |
| Tests | Test-only transitive licenses not on the allowed list: caniuse-lite (CC-BY-4.0), graceful-fs 4.2.12 (BlueOak-1.0.0), type-fest (MIT OR CC0-1.0), via Jest; none ships in production | PENDING | | |
| Frontend | Tiptap 3.33.0 rich-text editor (`@tiptap/react`, `pm`, `starter-kit`, `extension-table`, `-image`, `-text-align`, `-text-style`, `extensions`; MIT, ProseMirror underneath; open-source extensions only) — not on the tech radar. In use since 2026-11-20 by owner decision, approval pending | PENDING | | |
| Frontend | docx 9.15.3 for "Save as Word" (builds the .docx in the browser, loaded only when used; MIT, with fflate 0.8.3 and nanoid 6.0.2, MIT; OSV and license checked 2026-11-24, no advisories) — not on the tech radar. In use since 2026-11-24 by owner decision, approval pending | PENDING | | |
| Frontend | pdfkit 0.21.0 for "Save as PDF" (builds the PDF in the browser, in a worker, loaded only when used; MIT, with fontkit 3.0.0, linebreak 2.0.0, png-js 3.0.0, @noble/ciphers and @noble/hashes 2.4.0 and their MIT dependencies; OSV and license checked 2026-11-24, no advisories) — not on the tech radar. In use since 2026-11-24 by owner decision, approval pending. pdfmake was not used: its browser bundle includes sax under BlueOak-1.0.0, outside the allowed license list | PENDING | | |
| Frontend | i18next 27.1.1 and react-i18next 18.0.1 (with html-parse-stringify 4.0.1) for English / Bahasa Indonesia (owner decision 2026-11-24; MIT; OSV and license checked 2026-11-24, no advisories; versions at least two weeks old, newer ones were days old) — not on the tech radar. In use since 2026-11-24 by owner decision, approval pending. The language choice is kept in the browser (localStorage), nothing on the server | PENDING | | |
| Backend | Initial PostgreSQL schema and migrations (Prisma Migrate) — confirm whether a new project needs a row | PENDING | | |

## Label

<!-- (owner input) GCP labels for cost and budget management. Provide all three below.
- Company: exactly one of gdn, gdpu, gdpa, gdv, gdr, gtn, gan, gdnus, gdni, rise, gem (owning sister company).
- Division: exactly one of operations, finance, marketing, commercial.
- Department: free text — the owning department name (non-empty), recorded in lowercase.
Asked during /start-vibe; /vibe-check will not pass while Company or Division is empty/invalid or Department is empty. -->

- Company:
- Division:
- Department:

## Design Overview

<!-- Simple design overview: main components, data flow, key integrations. Detail lives in docs/ARCHITECTURE.md; the full design-review document (diagrams, transaction flows, database schema, external connections, financial-risk analysis) lives in docs/DESIGN.md. Keep this reviewer-readable. -->

- **Frontend:** React 19 + TypeScript single-page app with a Tiptap rich-text editor (bold, italic, underline, headings, lists, tables, images, links, alignment, text color); each note is its own page and saves itself.
- **Backend:** Node.js 22 + TypeScript + Express API behind Apps Gateway; one process also runs an hourly job that generates meeting dates 4 weeks ahead and closes past meetings.
- **Database:** PostgreSQL 15. Notes are stored as editor JSON (`notes.content`, JSONB) plus extracted plain text for search; never as HTML.
- **Images:** a private Google Cloud Storage bucket in staging and production (`STORAGE_DRIVER=gcs`, `GCS_BUCKET`; credentials from the platform's workload identity, never in configuration); a local folder in development. The database holds only an attachment row; the note refers to it by id, and every image read goes through the backend's access check (no public or signed URLs). **TODO (owner/SRE input):** bucket name, region, owner, lifecycle and backups.
- **Data flow:** browser → Apps Gateway → API → PostgreSQL / GCS bucket. No external services, no LLM, no data leaves the company platform.
- **Money:** none. The tool handles no payments and no financial decisions.

Full design (flows, access rules, schema, API): `PRD & RFC Weekly Meeting Notes.md`. ERD: `Database Design/Weekly Meeting ERD.png`.

## Risk Level

<!-- (owner input, confirm) Low / Medium / High per the Non-Tech Change Management playbook.
Low: small personal tool, no sensitive data.
Medium: used by a team, connects to company systems, uses internal company data, automates regular work, or affects team decisions.
High: accessible outside the company or internet-facing, handles payments or money, uses sensitive personal or company data, or supports critical business processes.
An individual customer or seller's name, direct email, or phone is PII even alone. A legal-entity name or generic company channel is business data; a named partner representative remains identifiable unless GRC/Information Security documents an exception. Daily purchase/sales order items and values are internal operational data even in a database; money-moving or money-determining workflows are assessed separately. An internal access-control email alone and position coordinates alone do not automatically make a tool High.
A tool is not automatically Low just because it is small. When in doubt, consult Information Security. -->

**Proposed: Medium — TODO (owner confirm).** Used by teams, connects to a company system (Apps Gateway), holds internal company data (work progress notes) and staff work emails and names. Not internet-facing, no money, no sensitive personal data by design.

## Access Status

<!-- Internal-only or external access. State which and why. -->

**Internal-only.** The website is reached only through Apps Gateway with a company account; the backend accepts traffic only from the gateway. Users are staff; there is no external or anonymous access.

## Data Used

<!-- Classification: Public / Internal / Confidential. List the actual datasets and source systems. -->

**Classification: Internal.**

| Dataset | Source | Contains | Kept |
| --- | --- | --- | --- |
| `users`, `user_roles` | Apps Gateway identity on first sign-in | Work email, name, status (active/inactive), website role (user/admin), first and latest sign-in time, when an admin last deactivated them (to tell who waits for access) | Until deleted; users are deactivated, not deleted |
| `teams`, `team_members` | Created by any active user (who becomes leader); members added by the leader | Team name and description, members (with who added them and when), team role (leader/member), how the team splits its year (quarters by default, and the month it starts), when the team was deleted | Until deleted; a deleted team is kept 30 days for restore, then removed by an hourly job |
| `projects`, `notes`, `note_sections` | Typed by each user | Project name and description; note title and content (editor JSON) and its plain text. Each note belongs to its writer; `note_sections` is a copy of the parts of a note tagged with one of the writer's projects (shown on that project's page), rebuilt on every save | Until the owner deletes them (deleting a project keeps the notes; their sections become untagged) |
| `attachments` + GCS bucket (local folder in development) | Uploaded by each user | Images pasted into notes (stored as PNG, JPEG, GIF or WebP; at most 5 MB each, 100 per note). The browser shrinks pictures of up to 25 MB (GIFs up to 100 MB) before upload, and re-encoding drops their metadata, such as the place a photo was taken | Until the note is deleted (the files go with it) |
| `meeting_series`, `meetings`, `note_meetings`, `meeting_speakers` | Entered by team leaders; generated hourly, 4 weeks ahead | Schedule names and days, meeting dates (and the original date of a moved meeting), optional meeting titles such as a cancel reason, which note is in which meeting and in what order, and each meeting's speaking order (who presents first) | Until deleted; a schedule is deleted with its meetings only while none holds notes |

No other source system is read. Testing uses synthetic data only. Local development, on the owner's machine only, may load the team's own Q4 2026 weekly updates (Internal: work progress, colleagues' names and work emails as 12 local sign-in accounts, and SharePoint links; owner decision 2026-11-23, to mimic real use) from a gitignored folder: never committed, never in tests or fixtures, never deployed (the seed refuses `NODE_ENV=production`). **TODO (owner/GRC input):** confirm this exception to "synthetic data only in development"; retention period for notes and images after a user is deactivated or a project is archived; whether staff email and name need encryption at rest.

## Data That Must Not Be Entered

<!-- e.g. KTP/NIK, NPWP, individual customer/seller names, direct emails and phones, home addresses, payroll data, personal financial accounts, passwords, access codes, confidential company information. Use synthetic data in development. Daily purchase/sales order items and values are internal operational data, not sensitive financial data merely because of monetary values or database storage. -->

Notes are free text, so this list is shown to users in the editor:

- KTP/NIK, NPWP, passport numbers, or any other government ID.
- Salary, payroll, or personal financial account data.
- Individual customer or seller names, direct emails, phone numbers, or home addresses.
- Passwords, API keys, tokens, access codes, or screenshots that show them.
- Confidential company information beyond internal work progress.

Development uses synthetic data, except the owner-approved local seed of the team's own weekly updates described above.

## Login Method

<!-- Apps Gateway (approved company SSO, default) or Company Google OAuth login (external users without a company account, or fallback while Apps Gateway is not yet configured). No other method is permitted. -->

**Apps Gateway (planned).** The backend takes the user from the gateway's forwarded identity, trusting it only once the gateway-only network boundary is verified. A first sign-in creates the user as **inactive** with the `user` role; a website admin must activate them.

**Today (local testing only, since 2026-11-20): mock sign-in, not an approved method.** The login page asks for an email and a name and **no password**: nothing is checked against any identity provider, so it is not access control. It stands in for Apps Gateway so the `users` table fills the way it will behind the gateway (first sign-in → inactive, role `user`; `ADMIN_EMAILS` → active admin). The backend registers the mock route only when `NODE_ENV` is not `production`. A development build of the frontend also lists the seed's fourteen fictitious test accounts (`@example.com`) for one-click sign-in; a production build leaves the list out. The session is an 8-hour, HttpOnly, SameSite=Strict cookie (Secure in production) held in backend memory. The mock sign-in must be removed before anyone other than the developer uses the website.

## Access Levels

<!-- Roles and permissions. Least privilege: users get only the access they need; not everyone is an administrator. Required detail for Medium and High risk. -->

Enforced by the backend on every request; the active check reads the database each time, so deactivation takes effect immediately.

| Who | Can do |
| --- | --- |
| Inactive user (every user on first sign-in, and anyone deactivated) | Sign in, see "waiting for activation", sign out. Every other API route answers 403 `account_inactive`. |
| Active user | Create, read, edit, archive (reversible) and delete (typing the name; notes stay) their own projects; create, read, edit and delete their own notes and tag parts of them with their own projects (never someone else's: such a tag is removed on save); link their own notes to meetings of teams they belong to; read the meeting pages of their teams. Nobody else can open their projects. |
| Any active user | Create a team (becomes its only leader). Search active people by name or email to add them (name and email only, at least 2 characters, 20 results). |
| Team member | See the team and its members; leave the team. Read the notes (and their images) that their owners shared on the team's meetings, on each meeting's board, read-only; only while the note is linked there. Outsiders get 404 for a team, its meetings and those notes. |
| Team leader (exactly one per team) | Everything a member can, plus: edit the team, add and remove members, hand leadership to another active member (they lead, the old leader becomes a member; confirmation asked), delete the team by typing its name (archived 30 days, restorable by its leader, then deleted for good), set up, change, stop and delete meeting schedules, and title, move, cancel and reopen single meetings (until their day has passed). Cannot leave without handing over first. |
| Website admin | Users page (since 2026-11-20): list every user (name, work email, status, role, latest and first sign-in; search and filters), activate or deactivate them, grant or remove admin. Only while acting in the Admin role (403 `admin_only`). Never their own account (403 `cannot_change_self`) and never an `ADMIN_EMAILS` account (409 `admin_from_config`). Deactivating and admin changes ask for confirmation. Two admins removing each other at once cannot both succeed (both rows locked, actor re-checked). No team powers, except that deactivating a team leader passes each of their teams to its longest-standing active member. While acting as Admin they see only Home and Users; team pages and the people search are refused (403 `user_role_only`) until they switch back to the User role. Not a content role: no access to other people's notes. |

The first admins come from `ADMIN_EMAILS` (backend configuration, Vault in production): those emails become active admins on every sign-in and cannot be changed from the Users page. Every access change is logged with user ids only.

## Access Approval Process

<!-- (owner input) Who approves access requests and how. -->

**TODO (owner input).** Proposed: a person signs in through Apps Gateway and appears as inactive; their team leader asks a website admin, who activates them on the Users page. Admin rights are granted only by an existing admin or through `ADMIN_EMAILS`.

## Go-Live Steps

<!-- Deployment route and the approvals required for this risk level. Low: owner check. Medium: independent review — the reviewer must be neither the Project Owner nor the Support Contact above. High: the same independent review plus Architecture, SRE, and Information Security approval. -->

For Medium risk:

1. Stack exceptions above approved by the Tech Architecture Group.
2. Mock sign-in removed; Apps Gateway configured and the gateway-only network boundary verified.
3. Dependency scan (OSV and license) and security review of the code pass.
4. Independent review by someone who is neither the Project Owner nor the Support Contact; record it under Review Evidence.
5. Deploy to staging; pilot with one team; then production.

## Review Evidence

<!-- (owner input) Who reviewed, when, and the sign-off record (approval email, review notes). Required before go-live for Medium and High risk. -->

**TODO (owner input).** Not reviewed yet.

## Security Notes

<!-- Key security measures and known gaps. Cross-reference docs/SECURITY.md rather than duplicating it. -->

- Inactive by default; active status and roles read from the database on every request.
- Ownership and team-membership checks on every project, note, meeting and attachment route; someone else's note answers 404.
- Every id is a random UUID (`gen_random_uuid()`), so addresses cannot be guessed or counted; this adds to, and never replaces, the access checks above. Ids that are not UUIDs answer 400.
- Note content is stored as editor JSON, validated on the server against the editor schema; never stored or rendered as raw HTML (stored-XSS protection).
- Uploads: PNG, JPEG, GIF and WebP only, checked by file signature (the browser-sent type is ignored); SVG refused; 5 MB limit (the browser shrinks larger pictures first, but the server does not rely on it), read only after sign-in and the id are checked; storage keys are generated by the server and validated against a fixed pattern (no path tricks); files never overwritten; served only through the backend's access check with `nosniff`.
- Note content: the server copies the editor JSON node by node against a fixed schema (`backend/src/modules/notes/content.ts`); links are http, https or mailto only; image sources are our own attachment URLs only; colors `#rrggbb` only; project sections only at the top level, tagged with the writer's own projects. Read-only views (a project's updates) render the JSON as React elements, re-checking links, images and colors. The frontend uses no `dangerouslySetInnerHTML` and no inline `<style>` tags for the editor.
- Optimistic locking on notes (409 on conflicting saves); request bodies validated with Zod; parameterized SQL only.
- Logs carry ids and codes only, never note content, names or emails.
- Saving notes as PDF or Word (owner decision 2026-11-24): a team member can save the notes of a team's quarter (all of them, or the meetings and people they pick) to their own device, as a PDF or a .docx, both built in the browser and downloaded (owner decision 2026-11-24: the PDF no longer goes through the print window). The file holds what that member can already read on screen (internal work notes, colleagues' names, pictures); nothing is sent anywhere else. Saved files are outside the tool's control once downloaded: they should be kept as Internal documents (TODO owner/GRC: confirm this is acceptable and whether a notice is needed).
- **Known gaps:** gateway header format not yet confirmed; the GCS bucket is not created yet (images work with a local folder only); retention not decided; an image copied between notes still belongs to the first note (FR-13 clean-up must account for it). A `docs/SECURITY.md` will be written during implementation.

## Hosting Location

<!-- The approved company platform where the tool runs. Personal or public platforms require formal approval. -->

**TODO (owner input).** An approved company platform (GCP, per the labels above), behind Apps Gateway.

## Recovery Procedures

<!-- Application rollback/restore steps where known. The backup pipeline or method is SRE-owned; record its status or "SRE follow-up" and a tracking reference if available. Missing backup details alone do not block go-live. -->

Application rollback: redeploy the previous image; database migrations are forward-only and each release must work with the previous schema for one version. Database and GCS bucket backups (object versioning or a backup policy): **SRE follow-up.**
