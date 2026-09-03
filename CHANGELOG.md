# Orion Changelog

**Synozur's AI-Powered Maturity Assessment Platform**

This changelog documents new features, improvements, and fixes in Orion. Updates are listed with the most recent changes first.

---

## September 2026 — Version 3.2

### September 3, 2026 — Orion 3.2

Version 3.2 consolidates the major platform capabilities delivered since Version 2.1.

**New Features**
- **Type and propensity assessments:** Models can assign respondents to an archetype or champion type instead of producing a numeric maturity score. Authoring, tie handling, type imagery, results, history, and population insights support this assessment mode.
- **Cross-model Insights:** Users and tenant administrators can review trends across assessments, compare model performance, and export an Insights PDF.
- **Advanced course creation:** Course authors can build structured slides, rich-text lessons, quizzes, assignments, resources, attestations, and required learner submissions with server-side completion rules.
- **PowerPoint course intake:** `.pptx` files can be reviewed, split into lessons, edited before saving, and converted into structured course content without losing the original review state.
- **Slide narration:** Azure Speech generates per-slide narration with voice selection, bulk generation, transcript support, playback controls, and optional auto-advance.
- **Course and SCORM portability:** Native course import/export includes lesson resources and learner assignments. SCORM import, playback, and export are available; bundling private slide and narration media for offline external LMS packages remains a follow-up.
- **Monthly Insights digest:** Administrators can manage tenant participation, users can opt out, duplicate sends are prevented across server instances, and administrators can inspect or reset the current run state.
- **Bulk result tagging:** Administrators can assign or remove tags across multiple assessment results with tenant-safe enforcement.
- **Expanded Galaxy API:** Galaxy can access courses, progress, certificates, and attestations in addition to assessments, results, and Insights through the tenant-governed API.

**Improvements**
- **Azure AI Foundry:** GPT-5.4 in Azure AI Foundry is the active production model for AI summaries, recommendations, and Insights, with provider/model selection available to administrators.
- **Assessment presentation controls:** Model authors can suppress numeric scores and detailed narratives while preserving maturity-level results and appropriately worded AI summaries.
- **Microsoft 365 assessment compatibility:** Numeric question handling, scoring, maturity levels, and result presentation were corrected for imported Microsoft 365 models.
- **Course recommendations:** Assessments can be linked to courses, with recommendations surfaced from completed results and in the course catalog.
- **Tenant administration:** Branding, verified email-domain mapping, tenant-scoped result access, consent status, and Microsoft SSO onboarding were strengthened.
- **Microsoft consent separation:** Basic Microsoft sign-in consent is separate from optional Planner integration consent. Consent links are tenant-bound and consent emails identify Orion's production site.
- **Model portability:** Markdown interview-guide export includes the configured scoring scale, and model imports provide more reliable dimension and question previews.
- **Accessibility:** A broad Section 508/WCAG 2.1 AA pass improved keyboard navigation, labels, focus behavior, contrast, form semantics, and course-media accessibility.

**Security and Reliability**
- Hardened tenant isolation across assessment results, administrative operations, courses, and Galaxy APIs.
- Removed unsafe URL-fetch behavior from PowerPoint intake and tightened uploaded-media validation and access controls.
- Protected OAuth and Microsoft SSO callbacks against open redirects and tampered tenant state.
- Added private course-media authorization, safe cleanup of abandoned uploads, and server-side lesson completion validation.
- Remediated dependency findings and restored clean TypeScript and security checks.

**Known Follow-Ups**
- Digest run history, monitoring health endpoint, automated CI coverage, and automatic recovery from abandoned digest runs remain planned.
- Custom tenant domains, full white-labeling, billing, GDPR workflows, reassessment reminders, xAPI, video transcoding, and native/PWA applications remain future work.

---

## May 2026 — Version 2.1

### May 15, 2026 — Mobile-Friendly Assessment Navigation

**Improvements**
- Assessment wizard mobile polish for the live-event critical path: on small screens the Previous/Next controls are now a sticky bottom navigation bar with large, full-width tap targets and safe-area padding for notched devices, so attendees taking an assessment on a phone always have the controls in reach. Desktop layout is unchanged.

### May 15, 2026 — Course Catalog Filters & Search

**New Features**
- **Catalog search & filtering** on `/courses`: keyword search across course title, summary, and description; multi-select tag chips; duration buckets (under 30 min, 30–60 min, over 60 min); and a per-learner completion-status filter (not started / in progress / completed). A live result count and one-click "Clear filters" keep the catalog easy to scan as it grows.

**Notes**
- Completes the last open item in the Learning Courses MVP follow-ups. The assessment-driven recommendation surface (Results page + "Suggested for you") and certificate PDF generation were already shipped and are now reflected as complete in the backlog.

### May 2, 2026 - Galaxy Client Portal API

**New Features**
- **Galaxy Client Portal API** (`/api/galaxy/v1/...`): OAuth-protected, versioned API exposing Orion assessments, results, and insights to the Galaxy client portal. Endpoints: `/me`, `/artifacts`, `/assessments`, `/assessments/:id`, `/insights/me`, plus stubs for `/courses`, `/attestations`, `/certificates` (returning empty collections until those entities exist in Orion).
- **OAuth scopes for Galaxy**: `galaxy_portal` (required), `artifacts.read/write`, `assessments.read/write`, `courses.read/write`, `attestations.read/write`, `insights.read`, `admin.directory.read`. Advertised in `/.well-known/openid-configuration`.
- **Per-tenant Exposure Policy**: Master enable + per-artifact toggles (assessments, results, recommendations, insights, certificates), explicit model allowlist, audience scope (all/roles/tags), allowed origins, per-tenant rate limit. Stored in `galaxy_exposure_policies`.
- **Outbound webhooks**: HMAC-SHA256 signing (`x-galaxy-signature: sha256=…` over `{timestamp}.{body}`), per-tenant signing secret with rotate-once-visible UX, delivery log with status & response codes.
- **Galaxy audit log**: Append-only record of sensitive Galaxy reads (`galaxy_audit_log`).
- **OpenAPI 3.1 spec**: `/api/galaxy/v1/openapi.json` (public, cacheable).
- **Admin UI**: New "Galaxy Portal" section in Admin sidebar with Policy / Webhook / Activity / API tabs. Tenant admins manage their own tenant; global admins can switch tenants via `?tenantId=`.
- **Per-tenant rate limiting**: Configurable `req/min/user` (default 120), enforced in-process with `x-ratelimit-*` response headers.
- **Structured logs**: Every authenticated Galaxy call emits a JSON log line with `requestId`, `tenantId`, `userId`, `clientId`, status. `x-request-id` returned/echoed.

**Tests**
- Unit tests for the webhook signer (`tests/unit/galaxy-webhooks.test.ts`).

### May 2, 2026 — Learning Courses Module (MVP)

**New Features**
- **Course catalog**: New `/courses` page lists published courses with summaries, module/lesson counts, estimated time, and tags
- **Course player**: `/courses/:slug` renders a full course with modules and lessons; supports rich text, slide decks, video, audio, quizzes, and attestation lesson types
- **Quiz scoring**: Server-side quiz grading with per-course passing score, retry on failure, and recorded attempts
- **Attestations**: Signed acknowledgment lessons capture user name, IP, and user-agent for compliance reporting
- **Progress tracking**: Per-user enrollment + per-lesson progress with automatic course-level percentage and status (enrolled / in_progress / completed)
- **Course authoring**: Admin → Content → Courses provides a builder with overview, structure (modules + lessons), and enrollments tabs; lesson editor offers per-type JSON content templates
- **Tenant scoping**: Courses can be public or private to an owning tenant; visibility honored in the catalog API

**Status by Version 3.2**
- SCORM 1.2/2004 import, playback, and export are now implemented.
- Certificate PDF generation on course completion is now implemented.
- Assessment-driven course recommendations are now implemented.
- Attestation reminder and expiration emails remain deferred.

---

## February 2026

### February 14, 2026 - Version 2.0

**New Features**
- **SSO Profile Completion**: New `/complete-profile` page for SSO users to fill in required demographic fields (company, job title, industry, company size, country) after first Microsoft sign-in
- **SSO Sign-Up Tab**: "Sign up with Microsoft" button now appears on both Login and Sign Up tabs for first-time users
- **Secured SSO Consent Endpoints**: Authentication and role-based authorization (tenant_admin/global_admin) added to consent status/grant endpoints with proper tenant scoping
- **.model Format Reference**: Collapsible JSON format reference with copyable template added to the Import/Export panel in admin console

**Documentation**
- User Guide v2.0: Comprehensive rewrite with feature overview, .model format specification, SSO documentation, and structured table of contents
- Changelog: New CHANGELOG.md tracking all platform updates (this file)
- Backlog: PRODUCT_BACKLOG.md rewritten with executive summary status table, priority sequencing, and detailed feature specifications

**Bug Fixes**
- **Results screen ordering**: Fixed random ordering of assessment results -- now consistently sorted by most recent first, using completion date with fallback to start date for legacy assessments
- **Date range filtering**: Fixed date filters returning no results -- 55 completed assessments had missing completion timestamps, causing them to be excluded from any date filter. Backfilled missing timestamps and updated filtering logic to handle legacy data.
- **Assessment completion timestamps**: Fixed assessment submission to properly record completion timestamp (was only setting status to "completed" without recording when)

**Improvements**
- Profile update API (`PATCH /api/user/profile`) allows users to update their own demographic fields securely
- SSO callback flow checks profile completeness and redirects to completion page with return URL preservation

---

### February 2026 (Early) - Version 1.9

**New Features**
- **Microsoft Entra ID SSO**: Full enterprise SSO integration with PKCE flow
  - Multi-tenant MSAL configuration with Azure AD
  - Just-in-time user provisioning from SSO
  - Tenant mapping via Azure AD tenant ID or email domain
  - Admin consent URL generation for enterprise onboarding
- **Database-Backed SSO State**: Production-ready auth state storage replacing in-memory storage
- **Azure AD Tenant Tracking**: Tenant ID column with visual consent status indicators, copy-to-clipboard, and inline editing in Tenant Management
- **Tenant Management UI Enhancements**: Azure AD tenant ID display, consent status indicators, and inline editing capability

---

## January 2026

### January 2026 (Late)

**New Features**
- **reCAPTCHA for Signup**: Google reCAPTCHA added to email/password signup and password reset forms to prevent bot registrations

**Improvements**
- AI assessment dimension scores display corrected
- Date display fallbacks fixed for historical assessments
- Admin results endpoint logging added for debugging
- Default date filter removed to show all assessment results
- Assessment results filtering optimized for faster data retrieval

---

### January 2026 (Mid)

**New Features**
- **Share Links & QR Codes**: Shareable links and QR codes added to model overview pages
- **Model Archiving**: Archive models to remove from homepage and default admin views while preserving all data and assessment history
  - "Show archived" toggle in admin console
  - Graceful handling for archived assessment display
- **AI Individual Assessment Support**: AI analysis language adapts for individual vs. organizational assessment types
- **Anonymous AI Access**: Anonymous users can view AI-generated content when enabled per model

**Improvements**
- Page titles updated to include Orion branding and alliance name
- Question reordering within the assessment editor
- Anonymous user settings no longer revert after edits

---

### January 2026 (Early)

**New Features**
- **Flexible Scoring Engine**: 100-point scale with configurable averaging or sum scoring, plus 500-point scale support
  - Scoring method toggle in ModelBuilder interface
  - AI summaries correctly interpret scores based on model scale
  - Dimension scores display updated for flexible scales
- **Bulk Demographic Assignment**: Assign demographics to assessments in bulk based on tags
- **Multi-Format Model Import**: Import models from standard .model JSON, ExecAI simple format, and production export format
- **Model Duplication**: Duplicate models directly within the admin interface
- **Assessment Filtering & Reporting**: Filter by model, type (proxy/direct), date range with debounced inputs
- **AI-Powered Cohort Insights**: AI analysis and data export for assessment cohorts
- **Model Export Standardization**: Export uses correct standard .model format

**Improvements**
- AI analysis excludes unspecified demographics and corrects score displays
- PDF generation library updated for stability
- Sensitive password information removed from logs
- Database indexes added for faster assessment filtering by date and model
- Dates and times display in Pacific time across the platform

**Security**
- Hardcoded credentials removed from test files
- OAuth testing scripts cleaned up
- Environment variables used for all sensitive credentials

---

## November 2025

### November 2025 (Late)

**New Features**
- **OAuth 2.1 Identity Provider**: Orion functions as an OIDC provider for the Synozur ecosystem
  - Client management (CRUD, auto-generated credentials, redirect URIs)
  - Core endpoints: `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`, OIDC discovery, JWKS
  - Support for confidential and public clients (PKCE mandatory for public)
  - RS256 JWT signing, authorization_code and refresh_token grant types
  - Persistent user consent management
- **Multi-Tenant Architecture (Phase 1)**: Tenant-private model visibility, OAuth client management
- **Tenant Management**: CRUD for tenants with domain mapping and branding settings

---

### November 2025 (Mid)

**New Features**
- **Admin Guide**: Comprehensive ADMIN_GUIDE.md documentation
- **Knowledge Base System**: Upload documents (PDF, DOCX, TXT, MD) for AI grounding
  - Company-wide and model-specific scoping
  - AI insights grounded in uploaded content for higher-quality recommendations
- **Assessment Data Import**: Bulk import anonymized assessment data with validation and batch tracking
- **Assessment Tagging**: Custom tag system with configurable names, colors, and descriptions
- **Proxy Assessments**: Admins can create assessments on behalf of prospects with stored profile data
- **Social Sharing**: Share results on LinkedIn, Twitter, Facebook, email with Open Graph previews

**Improvements**
- Benchmark configuration with minimum sample size thresholds
- User management with bulk import capability
- Profile management with standardized dropdowns

---

### November 2025 (Early)

**New Features**
- **AI Content Review Workflow**: Admin review and approval process for AI-generated content
- **AI Usage Tracking**: Usage statistics and cost tracking for AI operations
- **Benchmarking System**: Configurable benchmark calculations supporting industry, company size, country, and combined segments

---

## October 2025

### October 2025

**New Features**
- **AI-Powered Insights**: Integration with Anthropic Claude Sonnet 4.5
  - Personalized executive summaries
  - Dimension-by-dimension interpretations
  - Transformation roadmaps
  - Personalized recommendations (3-5 per assessment)
  - 90-day AI response caching
- **PDF Report Generation**: Downloadable PDF reports with insights and benchmarks
- **Email Report Delivery**: PDF reports delivered via SendGrid
- **Anonymous User Claiming**: Automatic assessment association upon account creation
- **Anonymous User Nudges**: Prompts encouraging account creation from results pages

**Improvements**
- Assessment wizard with autosave and progress tracking
- Model images and hero backgrounds
- Session management improvements
- Role-based access control (global_admin, tenant_admin, tenant_modeler, user)

---

## September 2025

### September 2025

**Major Milestone: Initial Platform Release**

**Core Platform**
- Multi-model maturity assessment engine
- Dynamic model routing with URL slugs
- Assessment wizard with question navigation
- Results page with overall and dimension scores
- Radar charts for dimension visualization
- CSV import/export for model management
- ModelBuilder with Overview, Structure, Resources, and Maturity Scale tabs
- Admin console with model, user, and question management
- User registration and authentication with email verification
- Password reset functionality
- Responsive dark-mode-first UI with Synozur branding

---

## How to Read This Changelog

- **New Features**: Brand new capabilities added to the platform
- **Improvements**: Enhancements to existing features
- **Bug Fixes**: Issues that have been resolved
- **Performance**: Speed and efficiency improvements
- **Security**: Security-related updates

---

## Feedback

Have suggestions or found an issue? Contact us at [ContactUs@synozur.com](mailto:ContactUs@synozur.com)
