# Orion - Synozur Multi-Model Maturity Platform

## Overview
Orion is a fullstack JavaScript application providing a multi-model maturity assessment platform. It features dynamic routing for assessments, CSV-based model management, gated PDF result generation, benchmarking, and extensive administrative controls. The platform aims to offer insightful maturity assessments, aligning with Synozur's vision as "the Transformation Company." Orion also functions as a comprehensive OAuth 2.1/OpenID Connect identity provider for the Synozur ecosystem.

## User Preferences
- Uses SendGrid for email delivery (API key method, not Replit connector)
- Prefers seeing metrics on home pages when data is available
- Assessment dimensions are valuable and should be emphasized

## System Architecture
The application is built with a modern fullstack architecture, prioritizing a dark-mode UI.

### UI/UX Decisions
-   **Design**: Dark-mode-first aesthetic with a primary purple and accent pink color scheme, using the Inter font.
-   **Responsiveness**: Utilizes responsive gradient styling.
-   **Navigation**: Features a collapsible admin sidebar with hover tooltips for enhanced usability.
-   **Content Editing**: Unified inline Q&A editing via `UnifiedQuestionEditor` component for seamless modification of question text, type, answers, scores, improvement statements, and resource links directly within the ModelBuilder.
-   **Model Creation**: Guided 5-step `ModelCreationWizard` for new models, covering Basics, Dimensions, Questions & Answers, Maturity Scale, and Publish.

### Technical Implementations
-   **Frontend**: React, Vite, TypeScript, Wouter for routing, Shadcn UI for component styling.
-   **Backend**: Express.js, PostgreSQL, Drizzle ORM.
-   **Storage**: PostgreSQL for relational data, Google Cloud Storage for digital assets.
-   **Authentication**: Passport-based session management with tenant-scoped, four-tier role-based access control (`global_admin`, `tenant_admin`, `tenant_modeler`, `user`). Supports Microsoft Entra ID (Azure AD) SSO with PKCE flow, auto-provisioning, Azure AD tenant ID tracking, and admin consent URL generation.
-   **Scoring System**: For 100-point models, scores are calculated as a percentage of the maximum possible: `(totalScore / maxPossibleScore) × maxMaturityScale`. 500-point models use an average of raw scores. The pure scoring engine is in `server/services/scoring.ts`.
-   **Automated Tests**: Vitest for unit tests and Playwright for end-to-end testing, located under `tests/`.
-   **Model Management**: Supports CSV-driven import/export and a `.model` JSON format. Includes a ModelBuilder component with Overview, Structure, Resources, and Maturity Scale tabs. Models can be archived to preserve data while hiding them from active views.
-   **AI Integration**: Features a multi-provider registry pattern (`server/services/ai-providers/`). Primary provider is Azure AI Foundry, with Anthropic Claude Sonnet 4.5 as a fallback via Replit AI Integrations. Active provider and model are configurable via Admin Settings.
-   **Multi-Tenant Architecture**: Supports tenant-private model visibility, OAuth client management, and SSO provisioning.
-   **In-App Support System**: Includes a full-stack support ticket system with CRUD operations, replies, an admin management console, an AI help chatbot (streaming from user guide content), and a "What's New" modal (AI-summarized changelog). Integrates with Microsoft Planner for automatic ticket syncing. Email notifications are sent via SendGrid.
-   **Galaxy Client Portal API**: An OAuth-protected, versioned API (`/api/galaxy/v1/*`) with bearer-token middleware, scope enforcement (`galaxy_portal`, `artifacts.read`, etc.), tenant-specific exposure policies, and audit logging. Webhook events are HMAC-SHA256-signed. An OpenAPI 3.1 specification is provided.
-   **Planner Integration (System-Level)**: Support tickets sync to a single, system-configured Synozur Planner board. Configuration uses `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`/`AZURE_TENANT_ID` environment variables.

### System Design Choices
-   **Frontend Bundle Optimization**: Utilizes `React.lazy()` and dynamic `import()` for code-splitting to reduce initial bundle size. Pages are eagerly imported only for `Landing` and `not-found`, with all other pages lazy-loaded under a single `<Suspense>` boundary. Heavy libraries like `jspdf` and `recharts` are dynamically loaded only when needed by specific routes.
-   **Provisioning Settings**: Allows tenant self-creation and user self-provisioning via SSO with email domain matching. Includes public domain protection to block consumer domains from tenant creation.

## External Dependencies
-   **PostgreSQL**: Primary database (Neon-backed).
-   **Google Cloud Storage**: For storing model images.
-   **SendGrid**: For email delivery.
-   **Azure AI Foundry**: Primary AI provider for advanced AI models (e.g., GPT-5.4, GPT-5.2, GPT-4o).
-   **Anthropic Claude Sonnet 4.5**: Fallback AI provider (via Replit AI Integrations).
-   **Microsoft Graph / Planner**: For system-level integration of support tickets with Microsoft Planner.
-   **HubSpot**: For website tracking and new account creation/updates.
-   **jsPDF**: JavaScript library for generating PDF reports.
-   **Uppy**: Frontend file uploader library.
-   **React Icons (react-icons/si)**: For social media icons.