# DataFlow - Data Connector Platform

## Project Overview

A React + Vite single-page application for managing data pipelines and connections, with a local Express.js API backend and PostgreSQL database.

## Tech Stack

- **Framework**: React 18 with Vite 6
- **Styling**: Tailwind CSS + Radix UI components (shadcn/ui), US Bank blue (#0060AF) accent color, collapsible dark sidebar nav, CSS variable-based light/dark mode
- **Routing**: React Router DOM v6
- **State/Data**: TanStack React Query
- **Backend**: Express.js (embedded in Vite dev server via plugin, standalone for production)
- **Database**: PostgreSQL with JSONB storage for all entities
- **Language**: JavaScript (JSX/ESM)

## Project Structure

```
dataflow.yaml              - ★ MASTER CONFIG — infra, nav, features, env overrides
config/
  pipeline-wizard.yaml   - Wizard steps, transforms, DQ rules, masking, data types
  platforms.yaml         - Supported connection platforms (category → flat_file auto-derived)
  index.js               - Server config loader (selects by NODE_ENV)
  development.js         - Server dev defaults (env-var driven)
  production.js          - Server prod defaults (env-var driven)
src/
  dataflow-config.js     - Frontend config loader (merges dataflow.yaml + config/*.yaml, applies env overrides)
  feature-flags.js       - Feature flags derived from dataflow.yaml navigation/features sections
  api/client.js          - SDK client instance
  components/            - Reusable UI components and shadcn/ui components
  hooks/                 - Custom React hooks
  lib/
    local-sdk.js         - Local SDK adapter (entity CRUD, auth, functions)
    AuthContext.jsx       - Authentication context (local mock user)
    NavigationTracker.jsx - Page navigation logging
    app-params.js        - App parameter management
  pages/                 - Route-level page components
  utils/
    toYaml.js            - Shared YAML serializer (used by JobSpecExport, JobSpecTabPreview, DeployTabContent, GitCheckinDialog)
server/
  middleware.js          - Express API middleware (used in Vite dev server)
  production.js          - Standalone production server (serves API + static files)
  db.js                  - PostgreSQL connection pool, table initialization, workspace management
  redis.js               - Redis client (ioredis) — sessions, caching; graceful fallback to in-memory
  logger.js              - Structured JSON logging (pino) — request logging, contextual fields, log levels
  validation.js          - Zod input validation schemas + middleware (login, entities, workspace, GitLab)
  ldap-auth.js           - LDAP authentication, Redis-backed sessions, HTTP-only cookies, workspace resolution
  test-connection.js     - Real database connection tester (PostgreSQL, MySQL, SQL Server, MongoDB, Oracle, file paths)
  introspect-schema.js   - Live database schema introspection (PostgreSQL, MySQL, SQL Server) via information_schema
  airflow-proxy.js       - Airflow REST API proxy (DAGs, runs, task instances, logs, triggers)
  spec-validator.js      - YAML/JSON pipeline spec validation engine (structural + DB connection checks)
```

## Database (14 tables, JSONB storage + workspace table)

**Workspace table** (relational): id, name, slug, description, settings (JSONB), timestamps
**Entity tables** (13, JSONB): Pipeline, Connection, PipelineRun, ActivityLog, AuditLog, IngestionJob, AirflowDAG, CustomFunction, ConnectionProfile, ConnectionPrerequisite, PipelineVersion, DataCatalogEntry, DagTemplate — all have `workspace_id` FK column

## Architecture

- **Development**: Vite dev server on port 5000 with Express middleware plugin handling `/api/*` routes
- **Production**: Express server on port 5000 serving both API routes and static built files from `dist/`
- **Configuration**: `config/` directory with separate files for dev and prod, auto-selected by NODE_ENV
- **SDK Adapter**: `src/lib/local-sdk.js` provides a client with entity CRUD, auth, and function invocation via REST calls to the local API. All API calls include `x-session-id` header for workspace scoping.
- **Auth**: LDAP authentication with Redis-backed sessions (fallback to in-memory Map). Login returns workspace context. Sessions use HTTP-only cookies (`dataflow_sid`) with secure/SameSite flags in production; `x-session-id` header supported as fallback for backward compatibility.
- **Multi-Tenancy**: Workspace-based (Airbyte model). All entity tables have `workspace_id` column. API resolves workspace from session and scopes all CRUD queries. Default workspace auto-created on init. Existing data auto-migrated to default workspace.
- **Redis**: Session storage (8h TTL), cache layer. Graceful degradation — falls back to in-memory when Redis unavailable. `server/redis.js` wraps ioredis with session/cache helpers.
- **Structured Logging**: `server/logger.js` — pino-based JSON logging with request ID tracking, per-request context (method, URL, status, duration, IP, user agent), log-level-based routing (errors → `logger.error`, client errors → `logger.warn`, success → `logger.info`). Startup events, auth events, and all error paths use structured fields. Configurable via `LOG_LEVEL` env var.
- **Input Validation**: `server/validation.js` — Zod schemas for all API inputs (login, entity CRUD, workspace CRUD, GitLab, introspect, purge). `validateBody()` / `validateParams()` middleware returns 400 with field-level error details on invalid input. Prevents bad data from reaching the database.
- **Security**: SQL injection prevention via `sanitizeFieldName()` for JSONB field names and `entityNameToTable()` allowlist validation. HTTP-only cookies prevent XSS session theft. Zod validation prevents injection via malformed payloads.
- **Entity Name Mapping**: CamelCase entity names to snake_case table names (handles acronyms: AirflowDAG to airflow_dag)

## Performance & Security (Production Server)

- **Compression**: `compression` middleware (gzip/brotli responses)
- **Security Headers**: `helmet` middleware (CSP disabled for SPA compatibility)
- **Rate Limiting**: `express-rate-limit` — 1000 reads / 200 writes per 15 min per IP (configurable via `RATE_LIMIT_MAX`, `RATE_LIMIT_WRITE_MAX`)
- **DB Indexes**: Auto-created on startup — B-tree on created_date/updated_date, GIN on JSONB data, expression indexes on status/name for high-query tables, functional indexes on pipeline_id/connection_id/category/log_type/platform/connection_type, pg_trgm trigram indexes on name fields for ILIKE pattern matching
- **Full-Text Search**: Targeted `to_tsvector` / `plainto_tsquery` (GIN-indexed) on specific fields (name+description for pipeline/connection, message+category for activity_log) instead of noisy `data::text`
- **Keyset Pagination**: `GET /api/entities/:name?cursor=<id>&limit=N` returns `{ items, nextCursor, hasMore }` for efficient deep pagination (backward compatible — omitting cursor returns flat array)
- **Batch Create**: `POST /api/entities/:name/batch` accepts `{ items: [...] }` for multi-row INSERT in a single transaction (limit 100)
- **Admin Endpoints**: `POST /api/admin/purge-logs` (activity log retention), `GET /api/admin/data-model` (live schema introspection)
- **Admin Mode**: Sidebar toggle reveals admin nav section (Data Model, Audit Trail, Activity Logs, Airflow, Custom Functions). Persisted in localStorage.
- **Health Check**: `GET /api/health` returns status, uptime, database connectivity, timestamp (503 if DB down)
- **Code Splitting**: All pages lazy-loaded via `React.lazy()` + `Suspense`
- **Connection Testing**: Real database driver tests via `POST /api/test-connection` using pg, mysql2, mssql, mongodb packages
- **Schema Introspection**: `POST /api/introspect-schema` — live database schema/table/column discovery from saved connections (PostgreSQL, MySQL, SQL Server); `ObjectSelector` auto-fetches when `connectionId` prop provided; auto-shows `SchemaImporter` when live connection unavailable
- **Schema Import (Flat Files)**: `SchemaDefinitionPanel` in Datasets step for flat file sources — supports CSV schema (header/column definitions), JSON schema, and COBOL CFD/Copybook parsing (PIC X/9/S9 COMP-3 fields). Default mode contextual by platform. Stores parsed columns in `formData.file_schema`
- **DDL Validation**: `SchemaImporter` validates DDL against RDBMS flavors (PostgreSQL, SQL Server, MySQL, Oracle). Auto-detects flavor from connection platform. Shows anti-pattern warnings (e.g., SERIAL in SQL Server, AUTO_INCREMENT in PostgreSQL) and parse errors. `validateDDL()` + `detectFlavor()` functions with comprehensive type/feature/anti-pattern tables per flavor
- **Spec Validation**: `POST /api/validate-spec` — validates pipeline YAML/JSON specs (required fields, cron syntax, dataset schemas) and verifies connection IDs exist in database; returns `{ valid, errors[], warnings[], checked_at }`
- **Pipeline Artifacts**: Two generated artifacts per pipeline — Airflow DAG (dag-factory YAML) and Pipeline Spec (YAML/JSON). Git commit triggers CI/CD for automated deployment.
- **GitLab Integration (LDAP)**: Only deployment target (GitHub removed). `POST /api/gitlab/commit` authenticates via GitLab OAuth password grant (LDAP credentials entered at commit time, never stored), then commits via GitLab Commits API. `POST /api/gitlab/status` verifies LDAP auth + project access. `GET /api/gitlab/config` returns configured URL/project. Env vars: `GITLAB_URL` (e.g. `https://gitlab.company.com`), `GITLAB_PROJECT` (e.g. `namespace/project-name`). Files: `server/gitlab.js`. Frontend: GitLab-only deploy with LDAP username/password fields and authenticate button.
- **Airflow DAG Generation** (template-based, dag-factory format): Users select from pre-built YAML templates (`DagTemplates.js`) — values auto-filled from pipeline spec. Built-in templates: "Flat File — Landing to Raw" (sensor → ingest → optional transform), "Flat File — Simple Ingest" (no sensor), "Database — Extract to DWH" (SparkSubmit per dataset). Template selection stored in `dag_template_id` on pipeline formData. Configurable DAG callable base path (default `/data/dags/`). Schedule mapped from form: @once/@daily/@weekly/cron etc.
- **Pipeline Wizard Tabs**: Basics → Datasets → Schedule → [Advanced] → Review → Deploy. "Review" tab shows template selection + generated YAML preview + validation. "Deploy" tab shows artifact cards + GitLab (LDAP) settings + branch/commit message + deploy button. Deploy flow: save pipeline first, then commit artifacts to git. Components: `JobFormDialog.jsx` (wizard), `JobSpecTabPreview.jsx` (review), `DeployTabContent.jsx` (deploy).
- **Advanced Tab Layout**: Left-pane vertical navigation (Data Cleansing, Data Quality, Column Mapping, Security & Masking, SLA Configuration) with full-width content area on the right. Dataset selector tabs at top. Active section highlighted in #0060AF blue. Syncs active dataset with selected_datasets changes.
- **LDAP Authentication**: Real LDAP auth via `ldap-authentication` library. Backend: `server/ldap-auth.js` with session management (8h TTL). Config: `LDAP_URI` (ldaps://prod-ldapad-int2.us.bank-dns.com:636), `LDAP_BASEDN` (DC=us,DC=bank-dns,DC=com), `LDAP_DOMAIN` (us.bank-dns.com), `LDAP_ROLES_MAPPING_ADMIN`, `LDAP_ROLES_MAPPING_DEV`. Falls back to demo mode (admin/admin) when LDAP env vars not set. Frontend stores session ID in sessionStorage. Role mapping: admin group → admin, dev group → developer, else → viewer. Auth endpoints: `POST /api/auth/login`, `GET /api/auth/me` (with x-session-id header), `POST /api/auth/logout`.
- **Auth Flow**: Unauthenticated users see full-screen login page (no sidebar/Layout). After login, `AuthContext.checkAppState()` sets `isAuthenticated=true` and routes to Dashboard. Sign Out button in sidebar (below Collapse) calls `logout()` which clears session and routes back to login. `App.jsx` gates all routes behind `isAuthenticated` — unauthenticated users always see login regardless of URL.
- **Landing/Login Page**: `LDAPIntegration.jsx` is login-only (no post-login content). Shows DataFlow branding (#0060AF blue Workflow icon), app description, "Preferred ID" + password form. Demo credentials banner only in dev mode (`import.meta.env.DEV`).
- **Vault Credentials (HashiCorp)**: Connections support `vault_credentials` auth method — AppRole authentication to HashiCorp Vault (KV v2). Vault config stored per connection: URL, namespace, role_id, secret_id, mount_point, secret_path. Credentials resolved server-side at test/connect time (`server/vault.js`). UI includes "Test Vault Connection" button to verify AppRole access. `POST /api/test-vault` endpoint for standalone vault testing.
- **No Execution Operator section** — removed from schedule settings (auto-detect logic handled by deployment pipeline)
- **No Data Lineage** — lineage pages, components, and spec generators fully removed
- **Supported Drivers**: PostgreSQL (pg), MySQL (mysql2), SQL Server (mssql), MongoDB (mongodb), Oracle (oracledb — requires Instant Client), file system paths
- **Airflow Integration**: Backend proxy (`/api/airflow/*`) for secure Airflow REST API calls — supports DAG listing, run history, task instances, log retrieval, DAG triggering, pause/unpause. Credentials never exposed to frontend. Orchestration data displayed natively on Dashboard (summary) and Pipelines (full detail) pages via `OrchestrationPanel` component — no separate Airflow tab.
- **Admin DAG Check-In**: Admins can push DAG files (YAML/Python) directly to Airflow's DAG bag folder for local testing (bypassing GitLab CI/CD). Configurable `dags_folder` path per Airflow connection. Endpoints: `POST /:connectionId/dags/checkin` (write file), `GET /:connectionId/dags-folder` (list files + status), `DELETE /:connectionId/dags-folder/:filename` (remove file). Path traversal protection via `path.resolve` + prefix validation. UI: collapsible `DAGCheckinPanel` on the Airflow page with file upload, paste content, subfolder support, and existing file management.

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string (required)
- `DB_SSL` - Database SSL (`false` to disable, default: enabled)
- `REDIS_URL` - Redis connection URL (default: redis://localhost:6379, optional — falls back to in-memory)
- `REDIS_PREFIX` - Redis key prefix (default: dataflow:)
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment (`development` or `production`)
- `LOG_LEVEL` - Logging level (default: debug in dev, warn in prod)
- `CORS_ORIGIN` - Allowed CORS origin (default: *)
- `RATE_LIMIT_MAX` - API read rate limit per 15 min window (default: 1000)
- `RATE_LIMIT_WRITE_MAX` - API write rate limit per 15 min window (default: 200)

## Key Design Decisions

- **No connection_type**: Connections have no source/target type — any connection can serve as either
- **Case-insensitive duplicate prevention**: Server uses `LOWER(data->>'name')` for pipeline and connection name uniqueness (both create and update)
- **DAG Callable Base Path**: Defaults to `/data/dags/`, used by dag-factory YAML generation and spec export
- **dag-factory format**: Airflow DAG YAML uses dag-factory compatible structure with PythonSensor, PythonOperator, and SparkSubmitOperator
- **Schedule Settings**: 8-preset grid (None/Hourly/Daily/Weekly/Monthly/Quarterly/Cron/Sensor), Calendar Timetable (include/exclude calendars for business days, bank holidays, market holidays, year-end freeze, custom dates). DAG config, retries, and tags/ownership sections removed from UI — defaults used in DAG generation and spec export.
- **Advanced Pipeline Features**: Enable Advanced Tab toggle with per-feature selection — Column Mapping (always on/default), Data Cleansing, Data Quality, Security & Masking, SLA Configuration. Selected features propagate to Advanced tab sidebar navigation. "Select All" shortcut available. Feature flags stored in `formData.advanced_features`.
- **Pipeline Wizard UX**: Step indicator with chevron arrows, ring highlight on active step, 12px step labels always visible. Back/Next navigation with contextual labels ("Next: Advanced", "Next: Review"). Left-aligned Back button, right-aligned action cluster (Cancel, Save Draft, Next). Chevron icons on navigation buttons.
- **Pipeline Cards**: Consolidated actions — only Run button visible, Deploy/Export/Details/Retry/Pause/Clone/Edit/Delete in dropdown menu. Card + list view toggle (same as Connections).
- **Pipeline Status Chips**: Clickable filter chips (All/Active/Idle/Running/Completed/Failed/Paused) with counts replace dropdown filter.
- **Connection Cards**: Platform-colored left border (4px) using `platformConfig.borderColor` for quick visual scanning.
- **Connection Selector Tags**: Pipeline wizard connection dropdown shows environment tags (dev/prod/uat/staging) as colored pills.
- **Config Architecture (3-file split)**:
  - `dataflow.yaml` — infrastructure (app, server, db, ldap, vault, gitlab, airflow, logging), navigation flags, feature toggles, environment overrides
  - `config/pipeline-wizard.yaml` — wizard steps, advanced features, transforms, DQ rules, masking types, PII types, encryption, data types, schedule presets, load methods, delivery channels, event sensors, file input modes, schema import modes
  - `config/platforms.yaml` — platform definitions with `category` (database/cloud/file/orchestration); `FLAT_FILE_PLATFORMS` auto-derived from `category: file`
  - `src/dataflow-config.js` merges all three files + applies environment overrides
- **Feature Flags**: `src/feature-flags.js` derives flags from `dataflow.yaml` navigation + features sections. Each nav item has `enabled` (show/hide) and `coming_soon` (dimmed + "Soon" badge).
- **Config-driven components**: ColumnMapper/constants.jsx, DataQualityRules.jsx, DataMaskingConfig.jsx, ScheduleSettings.jsx (event sensors), JobDataTab.jsx (file input modes, schema import modes), JobSpecExport.jsx (FLAT_FILE_PLATFORMS from platform categories), JobFormDialog.jsx (imports shared FLAT_FILE_PLATFORMS).
- **Login Page**: Decorative icons removed; credentials banner only shown in development mode.
- **Dashboard**: "Data Pipelines" stat card (not "Ingestion Pipelines"). Recent Pipeline Runs table shows both Pipeline Status and Run Status columns so DAG run outcomes are linked to pipeline status. Stat card subtitle dynamically shows running/failed/configured count.
- **Airflow DAG Status Sync**: `POST /api/airflow/sync-pipeline-status` polls all active Airflow connections, queries latest DAG run for each pipeline (dag_id = `dataflow__<sanitized_name>`), and updates pipeline status from Airflow state (success→completed, failed→failed, running/queued→running). Frontend hook `useAirflowStatusSync` polls every 2 minutes on Dashboard and Pipelines pages; silently no-ops if no Airflow connections exist.
- **Empty States**: Dashboard shows "No pipeline runs yet" with CTA link to Pipelines; Pipelines page shows "Set up a connection first" when no connections exist.
- **GitLab Deploy UI**: Streamlined card-based layout with US Bank blue Authenticate button (no orange), compact artifact previews, dark mode support. Orange reserved only for GitLab SVG icon.

## Running the App

```bash
npm run dev       # Development (Vite + Express middleware)
npm run build     # Build frontend for production
npm start         # Production server (NODE_ENV=production)
```

Runs on `http://0.0.0.0:5000`

## Deployment

### Replit (autoscale)
- Build: `npm run build`
- Run: `npm start`

### Docker (AKS / Local PC)
- `Dockerfile` — multi-stage build (node:20-alpine), healthcheck on `/api/health`
- `docker-compose.yml` — app + PostgreSQL, reads `.env` file, healthcheck-gated startup
- `.env.example` — full list of all env vars with defaults and documentation
- `.dockerignore` — excludes node_modules, .git, .replit, etc.

```bash
cp .env.example .env   # Edit values for your environment
docker compose up -d   # Start app + database
```

All config is env-var driven — no hardcoded URLs, ports, or credentials.

## Production Readiness

See `docs/production-readiness-review.md` for full assessment and industry benchmark (Airflow/Airbyte comparison).

**Implemented**: Redis session store (with in-memory fallback), workspace-based multi-tenancy (all 13 entity tables scoped by workspace_id), HTTP-only cookie sessions (secure, SameSite, TTL-enforced), structured JSON logging (pino), Zod input validation on all API endpoints, default workspace auto-creation, data migration to default workspace, workspace CRUD API, workspace switching.

**RBAC**: 3-role hierarchy (admin > developer > viewer). `server/rbac.js` exports `requireRole()`, `requirePermission()`, `entityWriteGuard()` middleware. Viewer write guards on entity create/update/delete/batch in **both** middleware.js (dev) and production.js (prod). `req.sessionUser` injected via `resolveSessionFull()` in `requireWorkspace()`. `created_by` uses session email. Demo mode blocked in production (`NODE_ENV=production`). Session TTL configurable via `LDAP_SESSION_TTL_HOURS` env var.

**Production Hardening**: CORS credentials only sent when `CORS_ORIGIN` is not `*` (startup warning logged). Graceful shutdown on SIGTERM/SIGINT (closes HTTP server, PG pool, Redis). GitLab routes (config/status/commit) and batch entity route ported to production.js. `.env.example` rate limit var names fixed to match code (`RATE_LIMIT_MAX`, `RATE_LIMIT_WRITE_MAX`).

**Remaining**: Resource-level RBAC (per-entity ownership checks), BullMQ async job queue, DB migrations tool, `workspace_member` table for team-level access.
