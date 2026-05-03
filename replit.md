# Orion - Synozur Multi-Model Maturity Platform

## Overview
Orion is a fullstack JavaScript application designed for multi-model maturity assessments. It provides dynamic routing for assessments, CSV-based model management, gated PDF result generation, benchmarking, and extensive administrative controls. The platform aims to help users "Find Their North Star" through insightful maturity assessments, aligning with Synozur's vision as "the Transformation Company." Orion also serves as a comprehensive OAuth 2.1/OpenID Connect identity provider for the Synozur ecosystem.

## Project Documentation

Detailed documentation lives in dedicated files. **Keep these files updated** when making feature changes, fixing bugs, or adding new capabilities:

| File | Purpose | When to Update |
|------|---------|----------------|
| `USER_GUIDE.md` | End-user and admin feature documentation (v2.0) | When adding/changing user-facing features, UI flows, or SSO behavior |
| `ADMIN_GUIDE.md` | Admin console operations and configuration | When adding/changing admin features, model management, or tenant settings |
| `CHANGELOG.md` | Reverse-chronological record of all platform changes | After every feature, improvement, bug fix, or security update |
| `PRODUCT_BACKLOG.md` | Master backlog with priorities, status, and roadmap | When completing backlog items, adding new proposals, or changing priorities |
| `replit.md` | Technical architecture reference for coding agents (this file) | When changing stack, architecture patterns, or coding conventions |

**Important:** Feature details, backlog items, and change history belong in their respective files above -- not duplicated here. This file focuses on technical architecture and coding patterns that agents need for implementation.

## Critical Infrastructure Rules

> **DEV AND PRODUCTION USE COMPLETELY SEPARATE DATABASES.** They do not share any data. Running `npm run db:push` in dev ONLY migrates the dev database — production is unaffected. To query production data, use `executeSql` with `environment: "production"` (read-only SELECT only). **Never query the dev database and assume results reflect production — users, tenants, and all data may differ between environments.**
>
> **HOW PRODUCTION MIGRATIONS WORK:** When the app is published (deployed) on Replit, any structural database changes made in development (added/removed columns, new tables, etc.) are **automatically applied to the production database by Replit during the publish process.** There is NO need for startup migrations or manual SQL — just run `npm run db:push` in dev to capture the schema, then publish. Do NOT add startup migration code to `server/index.ts`.

## User Preferences
- Uses SendGrid for email delivery (API key method, not Replit connector)
- Prefers seeing metrics on home pages when data is available
- Assessment dimensions are valuable and should be emphasized

## System Architecture
The application features a modern fullstack architecture with a dark-mode-first UI.

-   **Frontend**: React, Vite, TypeScript, Wouter for routing, Shadcn UI for styling.
-   **Backend**: Express.js, PostgreSQL, Drizzle ORM.
-   **Storage**: PostgreSQL for relational data, Google Cloud Storage for assets.
-   **Authentication**: Passport-based session management with tenant-scoped, four-tier role-based access control (`global_admin`, `tenant_admin`, `tenant_modeler`, `user`). Supports Microsoft Entra ID (Azure AD) SSO with PKCE flow, auto-provisioning, Azure AD tenant ID tracking, and admin consent URL generation for enterprise onboarding.
-   **UI/UX**: Dark-mode-first with primary purple and accent pink, Inter font. Responsive gradient styling. Collapsible admin sidebar with hover tooltips.
-   **Scoring System**: For 100-point scale models, scores are calculated as a **percentage of maximum possible** — `(totalScore / maxPossibleScore) × maxMaturityScale`. This correctly handles both 0-4 and 0-100 answer ranges. 500-point scale models average raw scores. Max possible per question is determined dynamically (max answer score for MC, 4 for normalized numeric/multi-select). The pure scoring engine lives in `server/services/scoring.ts` (`calculateAssessmentScore`); `POST /api/assessments/:id/calculate` in `server/routes.ts` pre-loads questions/answers and delegates to it. Unit tests in `tests/unit/scoring.test.ts`.
-   **Automated Tests**: Vitest + Playwright foundation under `tests/` (see `tests/README.md`). Unit tests cover the scoring engine and the AI provider registry; a Playwright smoke suite covers signup → assessment → results, plus an admin "edit question" leg gated on `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD`. Run with `npx vitest run` and `npx playwright test`. New features should add at minimum a unit test for any pure scoring/aggregation logic and a Playwright happy-path spec for new user-facing journeys.
-   **Model Management**: CSV-driven import/export plus .model JSON format. ModelBuilder component with Overview, Structure, Resources, and Maturity Scale tabs. Model archiving preserves data while hiding from default views.
-   **Admin Content Experience**: Unified inline Q&A editing via `UnifiedQuestionEditor` component (client/src/components/admin/UnifiedQuestionEditor.tsx) — question text, type, answers, scores, improvement statements, and resource links are all editable inline in the ModelBuilder Structure tab with no modal dialogs. New models are created via `ModelCreationWizard` (client/src/components/admin/ModelCreationWizard.tsx) — a 5-step guided flow (Basics → Dimensions → Questions & Answers → Maturity Scale → Publish). The standalone Dimensions and Questions nav items have been removed from the Admin sidebar; all model content is managed through All Models → open model → Structure tab. The Content/Bulk Tools tab (ContentManagement.tsx) handles only CSV import/export and AI tool quick-links.
-   **AI Integration**: Multi-provider registry pattern (`server/services/ai-providers/`). Primary: Azure AI Foundry (`@azure-rest/ai-inference`) supporting GPT-5.4, GPT-5.2, GPT-4o. Fallback: Anthropic Claude Sonnet 4.5 via Replit AI Integrations. Active provider + model are DB-backed settings (`aiProvider`, `aiModel`) switchable from Admin Settings dialog. 90-day caching and content review workflow unchanged.
-   **Multi-Tenant Architecture**: ~60% complete. Tenant-private model visibility, OAuth client management, and SSO provisioning done. Branding and domain mapping remaining. See `PRODUCT_BACKLOG.md` for full status.
-   **In-App Support System**: Full-stack support ticket system with CRUD, replies, admin management console (Support tab in Admin sidebar), AI help chatbot (SSE streaming from user guide), What's New modal (AI-summarized changelog on login, system-level `showWhatsNew` toggle default OFF), Microsoft Planner integration (auto-sync tickets to tenant-configured plans, multi-tenant credentials). Public /help and /changelog pages render USER_GUIDE.md and CHANGELOG.md. Header help menu dropdown. Email notifications via SendGrid on ticket create/close. Schema tables: `supportTickets`, `supportTicketReplies`, `supportTicketPlannerSync`. Routes: `server/routes-support.ts`. Frontend: `UserGuide.tsx`, `Changelog.tsx`, `Support.tsx`, `WhatsNewModal.tsx`, `HelpChatPanel.tsx`, `SupportManagement.tsx`.
-   **Galaxy Client Portal API**: OAuth-protected, versioned API at `/api/galaxy/v1/*` (see `server/routes/galaxy/`). Bearer-token middleware (`middleware.ts`) reuses `oauthTokens.accessTokenHash` lookup, requires `galaxy_portal` scope plus per-resource scope (`artifacts.read`, `assessments.read`, `insights.read`, etc.), enforces a per-tenant `galaxy_exposure_policies` row (master `enabled` + per-type toggles + audience + rate limit) and writes structured logs / audit rows. Outbound events are HMAC-SHA256-signed via `webhooks.ts`. Tenant-admin management routes live at `/api/admin/galaxy/*` (policy, webhook, deliveries, audit) and back the `GalaxyIntegration` admin section. OpenAPI 3.1 spec is served from `/api/galaxy/v1/openapi.json`. Galaxy scopes are advertised by the IdP via `server/config/environment.ts` `allowedScopes`. Schema: `galaxy_exposure_policies`, `galaxy_webhooks`, `galaxy_webhook_deliveries`, `galaxy_audit_log` in `shared/schema.ts`. Course/attestation/certificate endpoints are stubbed (return empty collections) until those entities exist in Orion.
-   **Planner Integration (System-Level)**: All support tickets sync to a single Synozur Planner board, configured via system settings (`plannerEnabled`, `plannerPlanId`, etc.). Uses `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`/`AZURE_TENANT_ID` environment variables directly — no manual tenant ID entry needed. Global-admin-only configuration in Admin → Support → Settings. No per-tenant Planner setup needed.

## Frontend Bundle / Code-Splitting Policy
- The router (`client/src/App.tsx`) eagerly imports only `Landing` and `not-found`. Every other page is wrapped in `React.lazy(() => import(...))` and rendered under a single `<Suspense>` boundary with a centered spinner fallback (`data-testid="route-suspense-fallback"`).
- Heavy libraries are pulled in only by the routes that need them, so they ship in route chunks rather than the landing-page bundle:
  - `jspdf` / `client/src/services/pdfGenerator.ts` — loaded via dynamic `import()` inside the PDF callbacks in `client/src/pages/Results.tsx`. The PDF generator only downloads when a user clicks Download or Email.
  - `recharts` — only used by `Profile.tsx`, `admin/AiUsageDashboard.tsx`, and `admin/TrafficDashboard.tsx`, all of which are inside lazy-loaded routes.
  - `mammoth` / `pdf-parse` — server-side only, never reach the browser bundle.
- When adding a new page, register it in `App.tsx` with `lazy(() => import(...))` (not a static import). When adding a heavy library that is only used on one route, prefer a dynamic `import()` inside the consuming function/component.
- A bundle visualizer is wired into `vite.config.ts` behind the `ANALYZE` env var. Run `ANALYZE=1 npx vite build` (or `ANALYZE=1 npm run build`) to produce `dist/bundle-stats.html` (treemap, gzip + brotli sizes) for ongoing visibility. A dedicated `build:analyze` npm script is desirable but the platform blocks direct `package.json` script edits — adding it requires user approval.

### Measured impact (production build, gzip)
Numbers below are from real builds against this commit (Vite 5.4.20, all assets are static page chunks unless noted):

| Build | Initial entry chunk | Notes |
| --- | --- | --- |
| Baseline (every page eager-imported, jsPDF imported statically in Results) | `index-*.js` **2,650.49 kB raw / 802.42 kB gzip** | Single monolithic chunk loaded on the landing page. |
| After this task (lazy pages + dynamic `import()` for jsPDF) | `index-*.js` **395.72 kB raw / 124.06 kB gzip** | Plus per-route chunks fetched on demand: Admin 670 kB / 179 kB gzip, pdfGenerator 696 kB / 265 kB gzip, Results 50 kB / 14 kB gzip, Profile 24 kB / 7 kB gzip, ModelHome 31 kB / 8 kB gzip, Auth 15 kB / 4 kB gzip, Assessment 10 kB / 3 kB gzip, Support 11 kB / 3 kB gzip, smaller pages (UserGuide, Changelog, ForgotPassword, ResetPassword, VerifyEmail, OAuthConsent, CompleteProfile) all under 8 kB gzip. |
| **Reduction** | **~85% raw / ~84.5% gzip** | Comfortably above the task's ≥30% target. |

To re-measure after future changes: temporarily revert the lazy imports in `App.tsx` (and the dynamic `import()` in `Results.tsx`) for a baseline build, then restore them — or just compare consecutive `ANALYZE=1` builds via the treemap in `dist/bundle-stats.html`.

## Technical Debt
- **ExecAI/Copilot import format**: One-off simple format (`modelName`, `options`, `routing`) added for compatibility. Consider deprecating once models are migrated to standard Orion format.

## Related Synozur Products

### Vega (Synozur Company OS Platform)
- **Repository**: https://github.com/chris-mcnulty/synozur-vega
- **Replit**: https://replit.com/@chrismcnulty1/VegaPrototype
- **Purpose**: Multi-tenant AI-augmented Company Operating System for OKR management, strategy tracking, and focus rhythm.
- **Relevant Patterns**: Microsoft Entra ID SSO (PKCE, JIT provisioning, tenant mapping), auto-provisioning with public domain protection, multi-tenancy (UUID tenant IDs, scoped data isolation), 6-role RBAC, vocabulary module.
- **Shared UI/UX**: Maintains consistent aesthetic with Orion for Synozur brand continuity

### Orbit (Synozur Domain/Service Management Platform)
- **Repository**: https://github.com/chris-mcnulty/synozur-orbit (private)
- **Purpose**: Domain and service management platform with domain-based access controls.
- **Relevant Patterns**: Domain-based service limiting, granular provisioning controls.

## Provisioning Settings (For Entra SSO Implementation)

### App-Level Settings
- **Allow Tenant Self-Creation**: Whether new tenants can be auto-created when first user from a new domain signs in (default: yes)

### Per-Tenant Settings
- **Allow User Self-Provisioning**: Whether users can auto-provision into this tenant via SSO when their email domain matches (default: yes)
- **Sync to HubSpot**: Whether new account creation should create/update HubSpot contacts (default: yes)

### Public Domain Protection
Consumer domains (gmail.com, yahoo.com, outlook.com, hotmail.com, icloud.com, etc.) are blocklisted from tenant creation. Users from these domains must be explicitly invited to join an existing tenant, or get a personal single-user tenant that doesn't claim the domain.

## External Dependencies
-   **PostgreSQL**: Primary database (Neon-backed via Replit).
-   **Google Cloud Storage**: Object storage for model images.
-   **SendGrid**: Email delivery service.
-   **Azure AI Foundry**: Primary AI provider (`AZURE_AI_FOUNDRY_ENDPOINT`, `AZURE_AI_FOUNDRY_API_KEY`). Models: GPT-5.4 (default), GPT-5.2, GPT-4o.
-   **Anthropic Claude Sonnet 4.5**: Fallback AI provider via Replit AI Integrations.
-   **Microsoft Graph / Planner**: System-level ticket-to-task sync to a single Synozur Planner board. Uses `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`/`AZURE_TENANT_ID` environment variables directly. Requires `Tasks.ReadWrite.All` and `Group.Read.All` application permissions via admin consent. Uses `@azure/msal-node` for app-only auth.
-   **HubSpot**: Website tracking (Account ID: 49076134).
-   **jsPDF**: PDF report generation library.
-   **Uppy**: Frontend file uploader.
-   **React Icons (react-icons/si)**: Social media icons.