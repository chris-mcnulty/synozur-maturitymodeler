# Orion - Synozur Multi-Model Maturity Platform

## Overview
Orion is a fullstack JavaScript application designed for multi-model maturity assessments. It provides dynamic routing for assessments, CSV-based model management, gated PDF result generation, benchmarking, and extensive administrative controls. The platform aims to help users "Find Their North Star" through insightful maturity assessments, aligning with Synozur's vision as "the Transformation Company." Orion also serves as a comprehensive OAuth 2.1/OpenID Connect identity provider for the Synozur ecosystem.

## User Preferences
- Uses SendGrid for email delivery (API key method, not Replit connector)
- Prefers seeing metrics on home pages when data is available
- Assessment dimensions are valuable and should be emphasized

## System Architecture
The application features a modern fullstack architecture with a dark-mode-first UI.

-   **Frontend**: React, Vite, TypeScript, Wouter for routing, Shadcn UI for styling.
-   **Backend**: Express.js, PostgreSQL, Drizzle ORM.
-   **Storage**: PostgreSQL for relational data, Google Cloud Storage for assets.
-   **Authentication**: Passport-based session management with tenant-scoped, four-tier role-based access control (`global_admin`, `tenant_admin`, `tenant_modeler`, `user`). Supports Microsoft Entra ID (Azure AD) SSO with PKCE flow and auto-provisioning.
-   **UI/UX**: Dark-mode-first with primary purple and accent pink, Inter font. Responsive gradient styling. Collapsible admin sidebar with hover tooltips.
-   **Core Features**: Dynamic model routing, assessment wizard with autosave, flexible scoring engine (100-point or 100-500 point scales), profile gating, email-delivered PDF reports, benchmarking, comprehensive admin console.
-   **Scoring System**: For 100-point scale models, defaults to **averaging** answer scores (suitable for percentage-based answers 0-100). Models can override with `scoringMethod: 'sum'` in maturity scale config for traditional 0-4 answer scoring. 500-point scale models always average.
-   **Model Management**: CSV-driven import/export, card-based grid layout for editing, ModelBuilder component for detailed editing (Overview, Structure, Resources, Maturity Scale tabs), debounced updates, accessibility via aria-labels.
-   **User Management**: Admin CRUD for users, role assignment, email verification, password resets. Supports self-registration and bulk import.
-   **Email System**: Integrated email verification, password reset, and PDF report delivery via SendGrid.
-   **AI Integration**: Anthropic Claude Sonnet 4.5 for personalized recommendations and roadmaps, with 90-day caching and content review workflow.
-   **Knowledge Base**: User-uploadable documents (PDF, DOCX, TXT, MD) for AI grounding, company-wide and model-specific scoping.
-   **Data Import**: System for importing anonymized assessment data with validation and batch tracking.
-   **Reporting**: Admin dashboard with user statistics and CSV exports.
-   **Assessment Tagging**: Custom tag system for categorization with configurable names, colors, and descriptions.
-   **Benchmarking**: Configurable calculation system with minimum sample size thresholds, supporting various segments and optional inclusion of anonymous/imported assessments.
-   **Profile Management**: User profile editing with standardized dropdowns, required validation, collected during signup.
-   **Anonymous User Nudges & Assessment Claiming**: Prompts for anonymous users to create accounts, with automatic assessment claiming upon authentication.
-   **Social Sharing**: Enables sharing results with pre-filled content, using Open Graph URLs for model-specific previews.
-   **Proxy Assessments**: Admins can create assessments on behalf of prospects, storing profile data directly for AI personalization.
-   **Multi-Tenant Private Model Visibility**: Models can be public or tenant-private, assignable to multiple tenants. Access is enforced via `canAccessModel()` helper.
-   **Model Archiving**: Models can be archived to remove them from homepage and default admin views while preserving all data and assessment history. Archived models can be viewed via "Show archived" toggle in admin.
-   **OAuth 2.1 Identity Provider**: Orion functions as an OAuth 2.1/OpenID Connect provider with client management (CRUD, auto-generated credentials, redirect URIs), core endpoints (`/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`, OIDC discovery, JWKS), support for confidential and public clients (PKCE mandatory for public), RS256 JWT signing, `authorization_code` and `refresh_token` grant types, and persistent user consent management.
-   **Multi-Tenant Architecture**: In progress, with tenant-private model visibility and OAuth client management completed. Future plans include tenant-specific branding and domain mapping.

## Backlog / Technical Debt
- **SSO State Storage**: Current SSO auth state is in-memory (Map). For multi-instance deployment, move to database storage following Vega's session management model.
- **reCAPTCHA for Standard Signup**: Add Google reCAPTCHA to email/password signup and password reset forms to prevent bot registrations.
- **ExecAI/Copilot import format**: One-off simple format (`modelName`, `options`, `routing`) added for compatibility. Consider deprecating once models are migrated to standard Orion format.

## Related Synozur Products

### Vega (Synozur Company OS Platform)
- **Repository**: https://github.com/chris-mcnulty/synozur-vega
- **Replit**: https://replit.com/@chrismcnulty1/VegaPrototype
- **Purpose**: Multi-tenant AI-augmented Company Operating System for OKR management, strategy tracking, and focus rhythm. Aligns organizational strategy with execution through AI-powered modules.
- **Relevant Patterns for Orion**:
    - **Microsoft Entra ID SSO**: Multi-tenant MSAL-based Azure AD authentication with PKCE flow, just-in-time (JIT) user provisioning, and tenant mapping by email domain.
    - **Auto-Provisioning**: 
        - Users auto-provision into existing tenants when their email domain matches a tenant's allowed domains
        - First user from a new domain can auto-provision a NEW tenant (domain becomes that tenant's allowed domain)
        - **Public Domain Protection**: Consumer domains (gmail.com, yahoo.com, outlook.com, hotmail.com, icloud.com, etc.) are blocklisted from tenant creation - users from these domains:
            - Cannot auto-create a tenant (prevents someone from "claiming" gmail.com)
            - Cannot control subsequent users from that domain
            - Must be explicitly invited to join an existing tenant, OR
            - Get a personal single-user tenant (invite-only mode) that doesn't claim the domain
    - **Multi-Tenancy**: UUID-based tenant IDs, tenant-scoped data isolation, `TenantContext` and `TenantSwitcher` components
    - **RBAC**: 6 defined roles (`tenant_user`, `tenant_admin`, `admin`, `global_admin`, `vega_consultant`, `vega_admin`)
    - **Vocabulary Module**: Customizable terminology with system defaults and tenant overrides
- **Shared UI/UX**: Maintains consistent aesthetic with Orion for Synozur brand continuity

### Orbit (Synozur Domain/Service Management Platform)
- **Repository**: https://github.com/chris-mcnulty/synozur-orbit (private)
- **Purpose**: Domain and service management platform with sophisticated domain-based access controls.
- **Relevant Patterns for Orion**:
    - **Domain-Based Service Limiting**: System for restricting/allowing service access based on email domains
    - **Granular Provisioning Controls**: Multi-level settings for tenant and user provisioning

## Provisioning Settings (For Entra SSO Implementation)

### App-Level Settings
- **Allow Tenant Self-Creation**: Whether new tenants can be auto-created when first user from a new domain signs in (default: yes)

### Per-Tenant Settings
- **Allow User Self-Provisioning**: Whether users can auto-provision into this tenant via SSO when their email domain matches (default: yes)
- **Sync to HubSpot**: Whether new account creation should create/update HubSpot contacts (default: yes)

## External Dependencies
-   **PostgreSQL**: Primary database.
-   **Google Cloud Storage**: Object storage for model images.
-   **SendGrid**: Email delivery service.
-   **Anthropic Claude Sonnet 4.5**: AI service via Replit AI Integrations.
-   **HubSpot**: Website tracking (Account ID: 49076134).
-   **jsPDF**: PDF report generation library.
-   **Uppy**: Frontend file uploader.
-   **React Icons (react-icons/si)**: Social media icons.