# Orion Changelog

**Synozur's AI-Powered Maturity Assessment Platform**

This changelog documents new features, improvements, and fixes in Orion. Updates are listed with the most recent changes first.

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
