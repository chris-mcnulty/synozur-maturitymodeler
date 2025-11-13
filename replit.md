# Orion - Synozur Multi-Model Maturity Platform

## Overview
Orion is a comprehensive fullstack JavaScript application designed for multi-model maturity assessments. Its core purpose is to provide dynamic routing for assessments, manage models via CSV, generate gated PDF results, offer benchmarking capabilities, and provide extensive administrative controls. The platform aims to help users "Find Their North Star" through insightful maturity assessments, aligning with Synozur's vision as "the Transformation Company."

## User Preferences
- Uses SendGrid for email delivery (API key method, not Replit connector)
- Prefers seeing metrics on home pages when data is available
- Assessment dimensions are valuable and should be emphasized

## System Architecture
The application uses a modern fullstack architecture:
- **Frontend**: React, Vite, TypeScript, Wouter for routing, and Shadcn UI for component styling.
- **Backend**: Express.js for the API, PostgreSQL for the database, and Drizzle ORM for database interactions.
- **Storage**: PostgreSQL for relational data and object storage (Google Cloud Storage) for assets like model images and knowledge documents.
- **Authentication**: Passport-based session management with tenant-scoped role-based access control using a four-tier hierarchy (global_admin, tenant_admin, tenant_modeler, user). See Role System section below for details.
- **UI/UX**: Features a dark-mode-first UI with a primary purple (#810FFB) and accent pink (#E60CB3) color scheme, utilizing the Inter font family. Responsive gradient styling is applied to hero titles. Admin sidebar is collapsible with icon-only mode via toggle button in header, with hover tooltips for all menu items. Dashboard home button provides quick access to model management screen.
- **Core Features**: Dynamic model routing (/:modelSlug), assessment wizard with autosave, 100-500 point scoring engine, profile gating for results, email-delivered PDF reports, benchmarking, and a comprehensive admin console.
- **Model Management**: CSV-driven import/export of models, dimensions, answer options, and resource editing. Models can be featured on the homepage. Custom model images (via imageUrl field) display as hero backgrounds on model launch pages (opacity-20) and results pages (opacity-10), with fallback to default graphic.
- **Role System**: Four-tier tenant-scoped hierarchy:
  - `global_admin`: Platform-wide control (tenant CRUD, all users, all models)
  - `tenant_admin`: Tenant user management, model management within tenant scope
  - `tenant_modeler`: Model creation/editing within tenant scope
  - `user`: Standard assessment access
  - Legacy roles (`admin`, `modeler`) automatically normalize to new equivalents
  - Permission system enforces tenant boundaries via middleware (ensureGlobalAdmin, ensureAnyAdmin, ensureCanManageModels)
  - Frontend uses helper functions (isAdminUser, canManageModels, normalizeRole) for role checks
- **User Management**: Admin panel for user CRUD, role assignment, email verification management, username changes, and password resets. Self-registration defaults to 'user' role. Global admins see all users; tenant admins see only users within their tenant. Admins can change usernames and reset passwords directly from the user management interface. Admin and modeler roles can access and manage draft models; regular users see published models only.
- **Email System**: Integrated email verification, password reset, and PDF report delivery via SendGrid. Email templates support dynamic content and consistent branding.
- **AI Integration**: Leverages Azure OpenAI GPT-5 for generating personalized recommendations, interpretations, and roadmaps, with a 90-day caching mechanism for cost efficiency. Cache keys use stringified userContextKey for stable profile separation. AI prompts enforce strict personalization rules to prevent cross-model content bleeding (e.g., GTM language in non-GTM models). Detailed logging tracks userContext and cache hits/misses for debugging. Includes an AI content review workflow for admin approval.
- **Knowledge Base**: User-uploadable documents (PDF, DOCX, DOC, TXT, MD) for AI grounding. Supports company-wide and model-specific scopes. Documents stored in object storage with metadata in `knowledge_documents` table (field: `name` for filename, not `fileName`).
- **Data Import**: System for importing anonymized assessment data with validation, fuzzy text matching for question mapping, and batch tracking.
- **Reporting**: Admin dashboard with statistics displaying actual user names and companies. CSV exports include real user data for assessment results and user accounts. Anonymous/imported assessments display as "Anonymous".
- **Benchmarking**: Configurable benchmark calculation system with minimum sample size thresholds for different segment types (overall, industry, company size, country, and combinations). Admins can configure whether to include anonymous/imported assessments and proxy assessments in benchmark calculations. When anonymous inclusion is enabled, the system uses proxy profile fields for proxy assessments and user profile data for regular assessments, ensuring only assessments with valid profile data contribute to segment-specific benchmarks. Default behavior excludes anonymous data to maintain data quality.
- **Profile Management**: User profile editing with standardized dropdowns for job title, industry, company size, and country, all with required validation. Profile fields are now collected during signup for better data quality. Profile edit button is positioned next to the "Profile Information" heading for easier access.
- **Anonymous User Nudges**: Gentle prompts encourage anonymous users to create free accounts on model home pages and results pages, highlighting benefits like AI-powered personalized insights and saved progress.
- **Assessment Claiming**: Anonymous users who complete assessments can sign up or log in via nudge buttons, and their assessment is automatically claimed (associated with their account) upon authentication. The system preserves assessment context through the auth flow via URL parameters, ensuring users return directly to their results after creating an account.
- **Social Sharing**: Enables sharing assessment results across multiple social platforms with pre-filled content. Shares use special Open Graph URLs (`/api/og/:modelSlug`) that provide model-specific previews while auto-redirecting users to the actual model pages.
- **Open Graph Integration**: Server-side rendered meta tags via `/api/og/:modelSlug` endpoint for model-specific social media previews. When users share model links (e.g., for AI Maturity Assessment), social media crawlers see the correct model name and description instead of generic homepage text. Real users visiting these URLs are automatically redirected to the actual model page via JavaScript. All pages use the same custom preview image with Synozur branding.
- **Proxy Assessments**: Admins and modelers can create assessments on behalf of prospects without requiring real user accounts. Proxy assessments store prospect profile data (name, company, job title, industry, company size, country) directly in the assessment record with `isProxy` flag. AI-generated insights use the proxy profile data for personalization. Results pages display proxy profile information prominently. Admin results list shows "Proxy" badge for easy identification. Created via "Create Proxy Assessment" button in admin console header. Proxy assessments can be included in benchmark calculations when the "Include Anonymous/Imported Assessments" setting is enabled in benchmark configuration.
- **Multi-Tenant Architecture (Planned)**: Platform will transform into a multi-tenant system serving as the OAuth 2.0 identity provider for the Synozur ecosystem (Orion, Nebula, Vega). Features include tenant-specific branding (logo, colors), private model publishing, domain-based tenant mapping, application entitlements per tenant, and support for individual skills assessments. Users can exist with or without tenant association. See [MULTI_TENANT_ARCHITECTURE.md](./MULTI_TENANT_ARCHITECTURE.md) for detailed specification and [PRODUCT_BACKLOG.md](./PRODUCT_BACKLOG.md) for implementation roadmap.

## External Dependencies
- **PostgreSQL**: Primary database for all application data.
- **Google Cloud Storage**: Used for object storage of model images.
- **SendGrid**: Email delivery service for verification, password resets, and PDF reports.
- **Azure OpenAI GPT-5**: AI service for generating personalized recommendations and content.
- **HubSpot**: Integrated for website tracking (Account ID: 49076134).
- **jsPDF**: Library used for generating PDF reports.
- **Uppy**: Frontend file uploader for image management in the admin panel.
- **React Icons (react-icons/si)**: Provides social media icons for the sharing feature.