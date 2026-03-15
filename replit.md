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
-   **Scoring System**: For 100-point scale models, scores are calculated as a **percentage of maximum possible** — `(totalScore / maxPossibleScore) × maxMaturityScale`. This correctly handles both 0-4 and 0-100 answer ranges. 500-point scale models average raw scores. Max possible per question is determined dynamically (max answer score for MC, 4 for normalized numeric/multi-select).
-   **Model Management**: CSV-driven import/export plus .model JSON format. ModelBuilder component with Overview, Structure, Resources, and Maturity Scale tabs. Model archiving preserves data while hiding from default views.
-   **AI Integration**: Multi-provider registry pattern (`server/services/ai-providers/`). Primary: Azure AI Foundry (`@azure-rest/ai-inference`) supporting GPT-5.4, GPT-5.2, GPT-4o. Fallback: Anthropic Claude Sonnet 4.5 via Replit AI Integrations. Active provider + model are DB-backed settings (`aiProvider`, `aiModel`) switchable from Admin Settings dialog. 90-day caching and content review workflow unchanged.
-   **Multi-Tenant Architecture**: ~60% complete. Tenant-private model visibility, OAuth client management, and SSO provisioning done. Branding and domain mapping remaining. See `PRODUCT_BACKLOG.md` for full status.
-   **In-App Support System**: Full-stack support ticket system with CRUD, replies, admin management console (Support tab in Admin sidebar), AI help chatbot (SSE streaming from user guide), What's New modal (AI-summarized changelog on login, system-level `showWhatsNew` toggle default OFF), Microsoft Planner integration (auto-sync tickets to tenant-configured plans, multi-tenant credentials). Public /help and /changelog pages render USER_GUIDE.md and CHANGELOG.md. Header help menu dropdown. Email notifications via SendGrid on ticket create/close. Schema tables: `supportTickets`, `supportTicketReplies`, `supportTicketPlannerSync`. Routes: `server/routes-support.ts`. Frontend: `UserGuide.tsx`, `Changelog.tsx`, `Support.tsx`, `WhatsNewModal.tsx`, `HelpChatPanel.tsx`, `SupportManagement.tsx`.
-   **Planner Integration (System-Level)**: All support tickets sync to a single Synozur Planner board, configured via system settings (`plannerEnabled`, `plannerSsoTenantId`, `plannerPlanId`, etc.). Uses `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET` with the configured Synozur Azure AD tenant ID. Global-admin-only configuration in Admin → Support → Settings. No per-tenant Planner setup needed.

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
-   **Microsoft Graph / Planner**: System-level ticket-to-task sync to a single Synozur Planner board. Uses `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET` with a configured Synozur Azure AD tenant ID (stored as system setting `plannerSsoTenantId`). Requires `Tasks.ReadWrite.All` and `Group.Read.All` application permissions via admin consent. Uses `@azure/msal-node` for app-only auth.
-   **HubSpot**: Website tracking (Account ID: 49076134).
-   **jsPDF**: PDF report generation library.
-   **Uppy**: Frontend file uploader.
-   **React Icons (react-icons/si)**: Social media icons.