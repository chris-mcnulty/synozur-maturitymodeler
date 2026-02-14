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
-   **Scoring System**: For 100-point scale models, defaults to **averaging** answer scores (suitable for percentage-based answers 0-100). Models can override with `scoringMethod: 'sum'` in maturity scale config for traditional 0-4 answer scoring. 500-point scale models always average.
-   **Model Management**: CSV-driven import/export plus .model JSON format. ModelBuilder component with Overview, Structure, Resources, and Maturity Scale tabs. Model archiving preserves data while hiding from default views.
-   **AI Integration**: Anthropic Claude Sonnet 4.5 for personalized recommendations and roadmaps, with 90-day caching and content review workflow.
-   **Multi-Tenant Architecture**: ~60% complete. Tenant-private model visibility, OAuth client management, and SSO provisioning done. Branding and domain mapping remaining. See `PRODUCT_BACKLOG.md` for full status.

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
-   **Anthropic Claude Sonnet 4.5**: AI service via Replit AI Integrations.
-   **HubSpot**: Website tracking (Account ID: 49076134).
-   **jsPDF**: PDF report generation library.
-   **Uppy**: Frontend file uploader.
-   **React Icons (react-icons/si)**: Social media icons.