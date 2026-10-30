# PartMachine — Production-Ready, Secure and Scalable SaaS

## 1. Your mission

Transform the existing PartMachine project from a frontend-heavy demo into a real, secure, maintainable, production-ready and horizontally scalable B2B industrial manufacturing marketplace SaaS.

**This is an existing project, not a greenfield rewrite.** Preserve valuable existing UI, RTL/Persian design, domain logic and working features wherever possible. Improve the implementation incrementally based on evidence from the actual repository.

The technology stack is:

- Frontend: Next.js 16, React, TypeScript and Tailwind CSS.
- Backend: FastAPI and Python.
- Database: PostgreSQL.
- Cache, rate limiting and background-job infrastructure: Redis.
- Database access and migrations: SQLAlchemy and Alembic.
- API contract: OpenAPI with generated frontend types where practical.

Do not introduce a different primary stack without identifying a concrete technical reason and obtaining my approval.

## 2. Product and business domain

PartMachine is a B2B industrial manufacturing marketplace, similar to a marketplace for industrial parts and custom manufacturing.

Its core workflow is:

1. A buyer/company creates an RFQ (Request for Quotation) and uploads technical drawings, CAD files and specifications.
2. Eligible manufacturers review the RFQ and submit quotations.
3. The buyer compares quotations and selects a winning manufacturer.
4. The parties proceed through order creation, order tracking, contract preparation, acceptance/signature and eventually payment.
5. Quality-control laboratories, purchasing agents and administrators participate according to their permissions.

The main roles are:

- Buyer / employer
- Manufacturer / supplier
- Purchasing agent
- QC laboratory
- Platform administrator

The platform must support multiple independent companies and users securely. This is a genuine multi-tenant SaaS: data and permissions belonging to one company must never leak to another company.

## 3. Mandatory working rules

Before making changes:

- Inspect the repository, Git status, current branch, recent commits, project structure, existing documentation, frontend, backend, database models, API routes, authentication, configuration and available tests.
- Read `ARCHITECTURE.md`, `HANDOFF.md`, `README.md` and other relevant project documentation if present.
- Treat the previous project assessment as a list of reported findings to verify, not as unquestionable truth. Confirm each issue against the current code.
- Separate verified defects, potential risks and unverified assumptions.
- Do not assume that the repository or working tree is clean.
- Never discard, overwrite or reset existing user changes.
- Do not modify unrelated projects, services, ports, processes or files outside this repository.
- Do not run broad process-killing commands such as `taskkill` against all Python processes.
- Do not expose secrets, credentials, production data or private CAD files in logs or reports.

**Approval and change control:**

- Do not commit, push, deploy, run destructive migrations, delete data, or modify production infrastructure without my explicit approval.
- Do not perform paid operations or contact real customers.
- Work in small, reviewable phases.
- Before each phase, explain the scope and risks. After each phase, report the files changed, tests executed, results and remaining risks.
- If a decision involves significant cost, a breaking API change, irreversible data migration or infrastructure commitment, stop and ask me first.
- Never claim a test passed unless it was actually executed and its result was observed.

## 4. Target architecture

Use a **modular monolith** as the initial backend architecture, with clearly separated domain modules and stateless application instances.

Do not introduce microservices or Kubernetes by default. The system should be designed to scale horizontally when actual traffic requires it, without prematurely adding operational complexity.

Organize the backend around clear boundaries such as:

- Identity and authentication
- Organizations and memberships
- Manufacturer profiles and verification
- RFQs and technical documents
- Quotations and quotation comparison
- Supplier selection and award
- Orders and order lifecycle
- Contracts and signature audit records
- Payments and payment attempts
- QC and inspections
- Notifications
- Administration and audit logs

Adapt this structure to the existing codebase rather than creating unnecessary layers or duplicating logic.

The target deployment should be compatible with:

- Next.js frontend instances behind a CDN/load balancer.
- Multiple stateless FastAPI instances.
- PostgreSQL as the source of truth.
- Redis for appropriate caching, distributed rate limiting and background-job coordination.
- S3-compatible object storage such as S3 or MinIO for private technical files.
- Background workers for SMS, notifications, PDF generation and future AI processing.
- Automated database backups and a documented recovery procedure.
- Staging and production environments with separate configuration and credentials.

These components should be introduced only when needed, but the application design must not prevent their adoption.

## 5. Security and correctness requirements

Prioritize these requirements over cosmetic changes.

### Authentication and sessions

- Inspect the existing authentication and token-refresh implementation.
- Design secure browser sessions using HttpOnly, Secure and appropriate SameSite cookies.
- Never expose long-lived refresh tokens to browser JavaScript.
- If cookie-based authentication is used, implement appropriate CSRF protection.
- Implement refresh-token rotation and revocation where applicable.
- Apply login and OTP rate limits, expiration, attempt limits and replay protection.
- Do not store OTP codes or sensitive tokens in plaintext when avoidable.
- Do not log credentials, tokens, OTPs or private document contents.
- Consider the deployment topology and browser requirements before choosing cookie domains and CORS policies.

### Multi-tenant authorization

- Enforce organization membership and role-based permissions on the backend, not merely in the UI.
- Scope all tenant-owned database queries and mutations to the authenticated organization and authorized user.
- Prevent insecure direct object references and cross-tenant data access.
- Enforce RFQ visibility rules, manufacturer eligibility, quotation confidentiality and buyer-only award permissions.
- Never expose competing quotations to unauthorized users.
- Prevent unauthorized access to CAD files and other confidential technical documents.
- Store private documents in private object storage and use short-lived, authorized download URLs.
- Validate permissions again when creating signed URLs or processing background jobs.

### RFQ and quotation integrity

- Reject quotations for expired, closed or otherwise ineligible RFQs.
- Prevent multiple winning manufacturers unless the domain explicitly supports split awards.
- Make award selection atomic and concurrency-safe using appropriate database transactions and constraints.
- Ensure concurrent requests cannot create conflicting awards or duplicate business transitions.
- Use database constraints and unique indexes for critical invariants rather than relying solely on application checks.
- Validate file type, size and upload permissions.
- Add audit records for important actions such as RFQ publication, quotation submission, award selection and contract acceptance.

### Database correctness

- Use Alembic for versioned schema migrations.
- Inspect every SQLAlchemy model and its database-specific behavior.
- Use appropriate timezone-aware timestamps and UTC conventions.
- Use suitable monetary representations, such as BIGINT minor units or exact NUMERIC/DECIMAL values, and document the chosen currency and unit.
- Avoid floating-point arithmetic for money.
- Add indexes based on real query patterns and access-control requirements.
- Use database pagination and filtering rather than loading entire tables into application memory.
- Review transaction boundaries, foreign keys, uniqueness, deletion behavior and concurrent updates.
- Never execute destructive schema changes or production migrations without explicit approval and a recovery plan.

### Production safety

- Disable mock/demo fallback behavior in production.
- If the API is unavailable, display an explicit error or retry state. Never silently replace real data with fake data.
- Do not report an RFQ, quotation, order, signature or payment as successful until the backend confirms the operation.
- Keep secrets in environment variables or an appropriate secret manager.
- Validate configuration at application startup.
- Configure production CORS, trusted hosts, HTTPS, secure headers and request-size limits appropriately.
- Implement structured logging, request correlation IDs, health/readiness checks and actionable error reporting.
- Avoid exposing stack traces or internal database details to users.

## 6. SaaS data model and business lifecycle

Compare the existing schema with the real business requirements. Do not automatically create tables simply because an older architecture document lists them.

Identify the minimum correct model for:

- Users, organizations and organization memberships
- Roles and permissions
- Manufacturer profiles and verification
- RFQs and private technical documents
- Quotations and quotation revisions
- Award selection
- Orders and order status history
- Contracts and versioned contract records
- Signature or acceptance evidence and audit history
- Payment attempts and payment status, if payments are implemented
- QC inspections
- Notifications
- Audit events

Define the relationship between user identity, organization identity and tenant ownership explicitly.

Design lifecycle transitions as validated backend operations. Where appropriate, use explicit states, transactional updates and idempotency keys to protect against duplicate requests and network retries.

Do not implement real escrow, legal guarantees for electronic signatures or payment-provider integrations without approved business and legal requirements.

If commercial subscriptions, subscription plans, quotas, billing or trial periods are not yet defined, document them as SaaS business decisions instead of inventing a billing model.

## 7. Frontend and API integration

Preserve the existing visual identity, Persian/RTL experience and useful screens.

Audit every page and identify whether it uses:

- Real backend data
- Browser-only localStorage state
- Mock data
- An incomplete API integration

Replace demo persistence with real backend operations progressively.

For every critical workflow, provide loading, empty, success and error states. Never silently fall back to fake data in production.

Generate frontend API types from the backend OpenAPI schema where practical. Avoid maintaining duplicate business rules for pricing, trust scores, permissions and award selection in both frontend and backend.

Use server rendering for public pages where it improves SEO and performance, while keeping private company information protected from public indexing and caching.

Apply correct cache boundaries so one user's or tenant's private data cannot appear in another user's response.

Implement pagination, filtering and sorting through the backend for large lists.

Keep upload, quotation submission, award selection, order creation and contract operations connected to authoritative backend endpoints.

## 8. Scalability and reliability

Design for horizontal scaling and growth, but do not invent unsupported capacity guarantees.

Review:

- Database connection pooling and connection limits.
- Query efficiency, indexes, pagination and N+1 queries.
- Redis usage, cache invalidation and safe cache keys.
- Rate limits across multiple backend instances.
- Idempotency and concurrency for important write operations.
- Timeouts, bounded retries and external-service failure handling.
- Background-job retries, duplicate delivery and failure visibility.
- Upload size limits and private object storage.
- Database backup, restore testing and point-in-time recovery options.
- Application metrics, error monitoring and structured logs.
- Resource usage and realistic load-test scenarios.

Do not use Redis as the sole source of truth for business records.

Do not add read replicas, PgBouncer, complex caching, distributed locks or additional infrastructure without establishing a concrete need. Explain any proposed component, the bottleneck it addresses and its operational cost.

Avoid premature optimization and architecture designed around arbitrary user-count claims. Use measurable acceptance criteria and load tests to establish capacity.

## 9. Testing and delivery

Establish a maintainable test strategy covering:

- Backend unit and integration tests.
- API authentication and authorization.
- Cross-tenant access denial.
- RFQ creation and visibility.
- Quotation submission and confidentiality.
- Closed-RFQ restrictions.
- Concurrent and duplicate award selection.
- Money and timestamp correctness.
- Database migrations.
- Frontend/API contract compatibility.
- Production configuration and demo-mode prevention.
- Critical end-to-end business workflows.

Use PostgreSQL for tests involving PostgreSQL-specific behavior; SQLite success alone is insufficient evidence of production correctness.

Add appropriate linting, formatting, type checking and CI checks. Introduce Docker Compose for local development if it fits the repository, with PostgreSQL, Redis and the application services configured consistently.

Document setup, environment variables, migrations, tests, deployment, rollback and backup restoration.

Do not claim production readiness based only on successful startup or a passing unit-test suite.

## 10. Execution plan

Work in the following phases.

### Phase 0 — Read-only assessment

Inspect the repository and reproduce reported problems in a safe local environment.

Deliver:

1. Verified findings with file paths and relevant code locations.
2. Severity and impact for each finding.
3. A concise dependency and architecture map.
4. A distinction between existing functionality, demo-only functionality and missing functionality.
5. A prioritized remediation plan.
6. A proposed test strategy and acceptance criteria.

Do not modify project files during this initial assessment.

Then stop and request approval before implementing Phase 1.

### Phase 1 — Stabilization and production safety

After approval:

- Fix confirmed startup and API errors.
- Correct schema and database type issues.
- Establish Alembic migrations and safe local database setup.
- Fix authentication propagation and tenant authorization.
- Remove unsafe production demo fallbacks.
- Fix RFQ and quotation confidentiality and lifecycle enforcement.
- Add baseline tests for critical security and business rules.
- Introduce missing development infrastructure only where necessary.

Preserve existing user data and uncommitted work.

### Phase 2 — Real MVP

After Phase 1 is reviewed and approved:

- Complete real backend integration for core RFQ and quotation workflows.
- Implement organization memberships and verified manufacturer profiles.
- Implement private file storage and secure downloads.
- Implement reliable RFQ, quotation and award lifecycle transitions.
- Add pagination and filtering.
- Implement the required OTP/session flows after confirming the authentication requirements.
- Complete the minimum viable administration and audit capabilities.

### Phase 3 — Orders and commercial workflows

Implement order lifecycle, versioned contracts, acceptance/signature evidence, notifications and payment integration only after requirements and provider choices are approved.

### Phase 4 — Deployment and scale

Implement staging, CI/CD, monitoring, backup and restore verification, production deployment documentation and realistic load testing.

Add further infrastructure only when test results or operational needs justify it.

### Phase 5 — AI features

Only after reliable real-world data and core business workflows exist, evaluate supplier recommendations, quotation assistance, anomaly detection and fraud signals. Treat AI outputs as recommendations with measurable evaluation criteria, not as authoritative decisions.

## 11. Acceptance criteria

A phase is not complete until its criteria are verified.

At minimum:

- The application starts from documented setup instructions.
- Database migrations can be applied safely in a clean local environment.
- Critical API endpoints work against PostgreSQL.
- Unauthenticated users cannot read private RFQs or quotations.
- Users cannot access another organization's private records.
- Closed RFQs reject new quotations.
- Concurrent requests cannot create conflicting awards.
- Frontend critical workflows use backend persistence rather than local-only demo state.
- Production never silently displays fake fallback data.
- Tests, linting and type checking have actual recorded results.
- Remaining limitations, security risks and deployment prerequisites are documented.

## 12. Your immediate task

Start with **Phase 0 only**.

Inspect the current repository, verify the reported findings and produce a concise, evidence-based report in English or Persian, preferably Persian.

Do not start implementing fixes yet. Do not rewrite the architecture. Do not commit, push or deploy.

At the end, present the exact proposed Phase 1 changes, risks, test commands and acceptance criteria, then wait for my explicit approval.

---

## Project status log (maintained by the agent — update at the end of every phase)

| Phase | Status | Report |
|---|---|---|
| 0 — Read-only assessment | **done 2026-10-13** | `docs/PHASE0_ASSESSMENT.md` (findings F01–F38, Phase 1 proposal §9, decisions D1–D9) |
| 1 — Stabilization | **done — approved by the owner 2026-10-14**. Committed locally on branch `phase-1-stabilization` (five commits after baseline `0ed70a2`); **not pushed**. D8 ("no database with real data exists") confirmed by the owner 2026-10-14. Still open: push approval | `docs/PHASE1_REPORT.md` (acceptance §2, recorded results §3, decisions §9) |
| 2 — Real MVP | **done — approved by the owner 2026-10-14** (steps 2a–2f; migrations up to `0006`). Committed locally on branch `phase-2-mvp` (branched from `phase-1-stabilization`); **not pushed**. Real SMS/email provider for one-time codes deliberately not connected (P8). Still open: push approval, provider choice, legal review of terms/NDA | `docs/PHASE2_PLAN.md` (scope, decisions P1–P10), `docs/PHASE2_REPORT.md` (results, owner decisions §9, limits, next steps) |
| 3 — Orders and commercial workflows | **done — approved by the owner** (work finished 2026-10-14; merged into `master` via PR #1 = `acf1712` at the owner's request «گیتهاب را کد جدید کن», Pages demo redeployed; approved with «بله» 2026-10-15). Steps 3a–3f: orders, versioned contracts signed by both owners, record-only payments (no money moves through the platform, O6), optional QC by verified labs, in-app notifications + real dashboard, disputes with admin decisions, mutual cancellation after signing, real supplier track record and 1–5 ratings; migrations `0007`–`0013` (additive). Branch `phase-3-orders` pushed after each green step (owner's instruction), then merged into `master`. Results: backend 190 tests, frontend 44 unit, Playwright 16/16, CI green. Open: SMS/email provider, legal review, landing-page "AI" wording, lab profiles | `docs/PHASE3_PLAN.md`, `docs/PHASE3_REPORT.md` |
| 4 — Deployment and scale (+ PWA/responsive, owner request 2026-10-15) | **in progress** — plan approved by the owner 2026-10-15 («بله», defaults S1–S12). **Part A (4a–4f) done, CI green 2026-10-15 (`1f5fcc1`):** PWA and device layouts, production images + one-command stack, S3 storage, background worker, page CSP, admin TOTP 2FA, metrics and alerts, security review, encrypted daily backups with a timed restore drill. Part B (4g–4i: staging, load test, deployment docs) waits for the owner's hosting/domain purchase (S3/S4); production go-live needs a separate approval. Work on branch `phase-4-production` (from `master`). Owner's test workflow (2026-10-15): edit a batch, push with `[skip ci]`, run the full CI once at the end; nothing heavy on the owner's PC. **Security & performance hardening 2026-10-26/27** (owner request: benchmark, end-to-end auth tests, then «این مشکلات را هم حل کن»): local load test, 16 verified fixes with tests; owner decisions: CAD files only for verified suppliers (plus the awarded winner of that RFQ), weekly warning while backups are on the same server. **Committed and pushed to `phase-4-production` with the owner's approval (2026-10-27).** The first CI run caught critical Next.js advisories (16.0.0–16.4.0, RCE/DoS) → upgraded to 16.4.3. The owner granted `gh` the `workflow` scope (2026-10-27), so `.github/workflows/*` changes are pushed with `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push …` (Git Credential Manager's token still lacks that scope). Caddy log filter, backup.sh and Playwright are verified only by CI. **Deployed 2026-10-27 (owner-approved steps)** to the owner's shared server 84.32.10.40, next to Laleh's site/bots (compose project `nikan`): `deploy/shared-host` (override of the tested prod compose, `pm.sh`), project `partmachine-prod` in `/opt/partmachine`, its Caddy only on `172.17.0.1:18080`, images `ghcr.io/arnik-ai/partmachine-*:<commit>` built/tested by CI jobs `shared-host` + `publish-images` (first release `304f613bd7d3`); one block appended to `/opt/nikan/Caddyfile` (backup `Caddyfile.bak-20261027T102504Z-before-partmachine`). Test address `https://partmachine.84-32-10-40.sslip.io` (VPN needed in Iran); verified from outside: headers, hidden internal paths, forged X-Forwarded-For ignored. Server prep (approved): root fs grown 25→30 GB, old nikan build cache pruned. Owner decisions: own domain (not a subdomain of Laleh's), images built in GitHub. **2026-10-30: live at https://tarashino.com** (ArvanCloud → origin over plain HTTP like Laleh's domain; release `1527f9eaf72e`; www and the sslip name redirect to it; verified from Iran without VPN, forged X-Forwarded-For ignored). Two admins created by the owner (owner's 2FA on). The nikan Caddyfile also holds other projects' blocks after PartMachine's (talking plant) — replace only PartMachine's block (see deploy/shared-host/README.md). **Arvan→origin encrypted 2026-10-30:** the owner set Arvan's origin protocol to HTTPS; the server's Caddy has a Let's Encrypt certificate for tarashino.com (HTTP-01 through Arvan; Caddy answers challenges on 443 too), Arvan's edges were seen connecting to 443 only, and plain HTTP for tarashino.com now redirects (so Arvan must never be set back to HTTP — it would loop). Open: on-server restore drill, bounded load test |  `docs/PHASE4_PLAN.md` (steps, decisions S1–S12, risks, acceptance), `docs/PHASE4_HARDENING_REPORT.md` |
| 5 — AI features | not started (only after real-world data exists) | — |

### Environment notes (verified 2026-10-14)

- `HANDOFF.md` is current as of the end of Phase 3; start from `docs/PHASE3_REPORT.md`, `docs/PHASE4_PLAN.md`, `docs/DEVELOPMENT.md` and `docs/SECURITY_MODEL.md`.
- Owner requirement (2026-10-15): the app must be an installable **PWA** and responsive on phone, tablet, Windows and iPhone/iOS — planned in Phase 4 step 4a.
- Branches: `phase-1-stabilization` → `phase-2-mvp` → `phase-3-orders`, all pushed to GitHub (`arnik-ai/partmachine`, public); Phases 1–3 were merged into `master` (PR #1, `acf1712`), which deploys the GitHub Pages demo on every push. CI runs on `master`, `phase-*` and PRs (runs on the two older branches stay red because of a Windows-made lockfile fixed in Phase 3). Never push or merge to `master` without the owner's approval; use a PR with green CI. Never reset, drop or `git clean` uncommitted work; outside the owner's standing instruction for Phase 3 steps, every commit/push needs explicit approval.
- **Machine state re-verified 2026-10-26 (some notes below are older):** 15.6 GB RAM, ~94 GB free on C:; the project now lives at `F:\partmachine`. Docker Desktop is installed but WSL is not, so the Docker engine does not start (installing WSL needs the owner's approval). `backend/.venv` points to a Python on the previous PC and does not work. Port 5432 is a native Windows service `postgresql-x64-16` of another project — never touch it. A system proxy (xray VPN, `127.0.0.1:10808`) is on: Python `httpx` routes even `127.0.0.1` through it unless `trust_env=False`/`NO_PROXY` is set.
- This Windows dev machine is shared: ports **5432/6379** belong to the `pooyesh-postgres` / `pooyesh-redis` containers of another project, and port 3000 may be used by other projects. PartMachine uses Postgres **5433**, Redis **6380**, API **8100**, frontend **3100**. Never stop other containers or processes; stop only PIDs you started (check the command line first).
- RAM (~7.6 GB) and free space on drive C: (~12 GB) are tight. Per decision P10, Docker Desktop is started only for test runs (`docker desktop start`) and stopped right after (`docker desktop stop`, then `wsl --shutdown` only if no other WSL distro is running); data survives in the named volumes.
- Backend tests need `docker compose up -d db redis`; they use the database `partmachine_test` (guarded: the name must end in `_test`).
- Git Bash converts env values such as `/partmachine` into Windows paths; run the Pages demo build from PowerShell.
- Browser tests live in `frontend/e2e` (Playwright is a dev dependency; `npm run test:e2e` against API :8100 + standalone frontend :3100). Admin tests need `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (create the admin with `python -m app.create_admin`). Delete `frontend/test-results` and leftover temp browser profiles after runs.
