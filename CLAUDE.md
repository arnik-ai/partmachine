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
| 1 — Stabilization | **done — approved by the owner 2026-10-14**. Committed locally on branch `phase-1-stabilization` (five commits after baseline `0ed70a2`); **not pushed**. Still open: push approval, explicit D8 confirmation | `docs/PHASE1_REPORT.md` (acceptance §2, recorded results §3, decisions §9) |
| 2–5 | not started | — |

### Environment notes (verified 2026-10-14)

- `HANDOFF.md` was rewritten at the end of Phase 1; start from `docs/PHASE1_REPORT.md`, `docs/DEVELOPMENT.md` and `docs/SECURITY_MODEL.md`.
- Work lives on local branch `phase-1-stabilization` (baseline `0ed70a2` + Phase 1 commits, not pushed). Never reset, drop or `git clean` uncommitted work; every commit/push needs the owner's explicit approval.
- This Windows dev machine is shared: ports **5432/6379** belong to the `pooyesh-postgres` / `pooyesh-redis` containers of another project, and port 3000 may be used by other projects. PartMachine uses Postgres **5433**, Redis **6380**, API **8100**, frontend **3100**. Never stop other containers or processes; stop only PIDs you started (check the command line first).
- RAM (~7.6 GB) and free space on drive C: (~2 GB) are tight. The owner may switch Docker Desktop off; data survives in the named volumes. Docker Desktop is installed at `C:\Users\user\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe` — ask before starting it, and when asked to stop it use `docker desktop stop` (then `wsl --shutdown` only if no other WSL distro is running).
- Backend tests need `docker compose up -d db redis`; they use the database `partmachine_test` (guarded: the name must end in `_test`).
- Git Bash converts env values such as `/partmachine` into Windows paths; run the Pages demo build from PowerShell.
- The browser end-to-end smoke test used Playwright 1.64 + Chromium borrowed read-only from `E:\ai_turbo\saas_lead_demo\rahyab-next\node_modules` (script kept outside the repo). Delete leftover temp browser profiles after such runs.
