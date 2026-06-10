# Orion Platform Master Backlog

**Last Updated:** February 18, 2026 (Added reassessment reminders backlog item)

> **Note:** This is the single source of truth for all Orion feature proposals, implementation plans, UX enhancements, known issues, and technical decisions. All coding agents should reference this document for backlog-related questions.

---

## TABLE OF CONTENTS

1. [Executive Summary & Priority Sequence](#executive-summary--priority-sequence)
2. [High Priority Features](#high-priority-features)
3. [Medium Priority Features](#medium-priority-features)
4. [Lower Priority / Future Features](#lower-priority--future-features)
5. [UX Enhancements](#ux-enhancements)
6. [Known Issues & Bugs](#known-issues--bugs)
7. [Technical Decisions](#technical-decisions)
8. [Completed Features](#completed-features)
9. [Dependencies](#dependencies)
10. [Metrics for Success](#metrics-for-success)

---

## EXECUTIVE SUMMARY & PRIORITY SEQUENCE

### Current Status Assessment (February 14, 2026)

| Item | Status | Notes |
|------|--------|-------|
| **Core Assessment Engine** | Complete | Multi-model, flexible scoring (100/500-point), auto-save, anonymous access |
| **AI-Powered Insights** | Complete | Claude Sonnet 4.5, 90-day caching, content review workflow |
| **Benchmarking** | Complete | Industry, company size, country, combined segments with min thresholds |
| **PDF Reports & Email** | Complete | jsPDF generation, SendGrid delivery |
| **Model Management** | Complete | CSV + .model JSON import/export, ModelBuilder, archiving, duplication |
| **User Management** | Complete | CRUD, bulk import, roles, email verification, password resets |
| **RBAC** | Complete | Four-tier: global_admin, tenant_admin, tenant_modeler, user |
| **Knowledge Base** | Complete | Document upload for AI grounding, model-specific scoping |
| **Assessment Tagging** | Complete | Custom tags with colors, bulk assignment |
| **Social Sharing** | Complete | LinkedIn, Twitter, Facebook, email with OG previews, QR codes |
| **Proxy Assessments** | Complete | Admin-created assessments for prospects |
| **OAuth 2.1 Identity Provider** | Complete | OIDC endpoints, PKCE, RS256 JWT, client management |
| **Microsoft Entra ID SSO** | Complete | PKCE flow, auto-provisioning, tenant mapping, admin consent |
| **SSO Profile Completion** | Complete | Required profile fields for new SSO users |
| **Multi-Tenant Architecture** | ~60% | Tenant-private models, OAuth clients, SSO provisioning done. Branding, domain mapping remaining. |
| **Data Import** | Complete | Anonymized assessment data with validation and batch tracking |
| **Traffic Analytics** | Complete | Visit tracking, engagement metrics, CSV export |
| **Documentation** | Complete | User Guide v2.0, Admin Guide, Changelog, Backlog |

### Recommended Priority Sequence

```
PHASE 1: Multi-Tenant Completion (Q1 2026)
├── Tenant-specific branding (logo, colors)
├── Custom subdomain/domain mapping
└── Tenant entitlements and feature gating

PHASE 1.5: In-App Documentation & What's New (Q1 2026)
├── In-app User Guide / Help pages
├── What's New modal with AI-generated summaries
└── Admin Guide integration

PHASE 2: Individual Assessments & Billing (Q2 2026)
├── Individual/skills-based assessment models
├── Stripe billing and subscriptions
└── Usage-based feature entitlements

PHASE 3: Advanced Analytics & Enterprise (Q2-Q3 2026)
├── Enhanced reporting dashboards
├── Cross-model comparison analytics
├── Trend analysis over time
└── API rate limiting per tenant
```

---

## HIGH PRIORITY FEATURES

### 1. Multi-Tenant Architecture Completion

**Status:** ~60% Complete
**Priority:** High
**Effort:** 4-6 weeks remaining

**What's Built:**
- Tenant-private model visibility with `canAccessModel()` enforcement
- Model-to-tenant assignment (multi-select)
- OAuth client management per tenant
- Microsoft Entra ID SSO with auto-provisioning by domain/Azure AD tenant ID
- Tenant Management UI with Azure AD tenant tracking and consent status
- Four-tier RBAC with tenant scoping

**Remaining Work:**

| Feature | Effort | Description |
|---------|--------|-------------|
| **Tenant Branding** | 2 weeks | Custom logo, primary/secondary colors, favicon per tenant |
| **Domain Mapping** | 1 week | Map tenants to allowed email domains for auto-provisioning |
| **Tenant Entitlements** | 1 week | Feature gating based on subscription tier |
| **Tenant Data Isolation Audit** | 1 week | Verify all queries are tenant-scoped where appropriate |

---

### 2. In-App Documentation & What's New

**Status:** Not Started
**Priority:** High
**Effort:** 2-3 weeks

**Overview:**
Following Vega and Constellation patterns, surface platform documentation directly within the app. Users should be able to access the User Guide, see what's changed, and find help without leaving the application.

| Feature | Description |
|---------|-------------|
| **In-App User Guide** | Render USER_GUIDE.md content as browsable help pages accessible from the app header/footer |
| **In-App Admin Guide** | Render ADMIN_GUIDE.md within the admin console for admin users |
| **What's New Modal** | Auto-display modal after login showing AI-generated summary of recent CHANGELOG.md updates since last visit |
| **Dismiss Logic** | "Got it" button saves current version; won't show again until next release |
| **Help Sidebar/Page** | Dedicated help section with searchable documentation |
| **Changelog Page** | Browsable changelog showing platform update history |
| **Footer/Header Links** | Quick access links to documentation from main navigation |

**Implementation Approach:**
- Serve markdown files via API endpoints, render with a markdown component on the frontend
- Track user's `lastSeenVersion` to control What's New modal display
- Admin Guide visible only to admin roles
- Follow Vega's pattern: clean typography, collapsible sections, search

---

### 3. Individual Assessment Models

**Status:** Not Started
**Priority:** High
**Effort:** 3-4 weeks

**Overview:**
Support personal/skills-based assessments within organizations, complementing the current organizational maturity models.

| Feature | Description |
|---------|-------------|
| **Individual Scoring** | Different scoring system optimized for personal skills |
| **Individual Questions** | Question types suited to personal assessment (self-evaluation, frequency, proficiency) |
| **Tenant Reporting** | HR/management dashboards showing team skill distribution |
| **Skills Progression** | Track individual improvement over repeated assessments |
| **Privacy Controls** | Individual results visible only to the user and designated managers |

**Implementation Approach:**
- Add `assessmentType` field to models (`organizational` vs `individual`)
- Adapt AI prompts for individual context (already partially done)
- Individual-specific benchmarking (role-based, level-based)
- Privacy-aware result sharing

---

### 4. Billing & Subscriptions

**Status:** Not Started
**Priority:** High
**Effort:** 4-6 weeks

**Overview:**
Monetization through Stripe at the tenant level.

| Feature | Description |
|---------|-------------|
| **Stripe Integration** | Tenant-level subscription management |
| **Subscription Tiers** | Free, Professional, Enterprise with different feature sets |
| **Usage Tracking** | Assessment count, AI usage, user count per tenant |
| **Payment Portal** | Self-service billing management for tenant admins |
| **Feature Gating** | Restrict features based on subscription tier |

**Tier Structure (Proposed):**

| Feature | Free | Professional | Enterprise |
|---------|------|-------------|------------|
| Assessments/month | 10 | Unlimited | Unlimited |
| AI Insights | Basic | Full | Full + Custom |
| Benchmarking | Overall only | All segments | Custom segments |
| Custom Models | No | Yes | Yes |
| White Label | No | No | Yes |
| SSO | No | No | Yes |

---

## MEDIUM PRIORITY FEATURES

### 5. Enhanced Reporting & Analytics

**Status:** Not Started
**Priority:** Medium
**Effort:** 3-4 weeks

| Feature | Description |
|---------|-------------|
| **Tenant Dashboards** | Per-tenant analytics with assessment trends |
| **Cross-Model Comparisons** | Compare maturity across different models |
| **Trend Analysis** | Track score changes over time for repeat assessments |
| **Custom Report Builder** | Admin-configurable report templates |
| **PowerPoint Export** | Presentation-ready slides from assessment data |

---

### 6. Dedicated Tenant Visibility Manager

**Status:** Not Started
**Priority:** Medium
**Effort:** 1-2 weeks

**Overview:**
Advanced UI for managing model-to-tenant assignments, replacing the current multi-select dropdown.

| Feature | Description |
|---------|-------------|
| **Visual Tenant Grid** | All tenants with checkboxes and search |
| **Bulk Assignment** | Assign/remove models to multiple tenants at once |
| **Assignment History** | Audit log of visibility changes |
| **Quick Filters** | Filter by tenant name, domain, or status |

---

### 7. API Rate Limiting

**Status:** Not Started
**Priority:** Medium
**Effort:** 1-2 weeks

| Feature | Description |
|---------|-------------|
| **Per-Tenant Quotas** | Request limits based on subscription tier |
| **Usage Monitoring** | Real-time usage tracking dashboard |
| **Overage Handling** | Graceful degradation or upgrade prompts |
| **Rate Limit Headers** | Standard rate limit headers in API responses |

---

### 8. Automated Assessment Reassessment Reminders

**Status:** Not Started
**Priority:** Medium
**Effort:** 1-2 weeks

**Overview:**
Automatically send email reminders to registered users 6 and 12 months after their last completed assessment, encouraging them to retake the same model to track maturity progression over time.

| Feature | Description |
|---------|-------------|
| **6-Month Reminder** | Email sent 6 months after last completed assessment for a given model, with direct link to start the same assessment |
| **12-Month Reminder** | Follow-up email at 12 months if the user hasn't retaken the assessment |
| **Per-Model Tracking** | Reminders are model-specific; a user with multiple models gets independent reminder timelines |
| **Opt-Out** | Users can unsubscribe from reminders via profile settings or email link |
| **Smart Suppression** | Skip reminder if user has already retaken the assessment since the last completion |
| **Admin Controls** | Global and per-model toggle to enable/disable reminders; preview email templates |

**Implementation Approach:**
- Scheduled job (cron or background worker) runs daily checking for assessments reaching 6/12-month milestones
- Query: completed assessments where `completedAt` is 6 or 12 months ago AND no newer assessment exists for the same user+model
- Send via SendGrid with personalized template including model name, previous score, and direct assessment link
- Track reminder history (sent dates, opened, clicked) in a `reminder_log` table
- Add `reminderOptOut` boolean to user profile or a per-model opt-out table
- Respect tenant-level settings for reminder enablement

**Email Content (Proposed):**
- Subject: "It's been 6 months - time to reassess your {Model Name} maturity?"
- Body: Previous score summary, link to retake, benefits of reassessment, unsubscribe link

---

## LOWER PRIORITY / FUTURE FEATURES

### 9. Custom Subdomains (Premium)

**Status:** Not Started
**Priority:** Low
**Effort:** 2-3 weeks

Premium feature for tenant-specific URLs:
- tenant.orion.synozur.com routing
- SSL certificate management
- DNS configuration interface

---

### 10. White-Label Options

**Status:** Not Started
**Priority:** Low
**Effort:** 3-4 weeks

Complete branding customization:
- Custom domains
- Email sender configuration
- Remove Synozur branding (premium tier)
- Custom landing pages

---

### 11. Data Export Compliance (GDPR)

**Status:** Not Started
**Priority:** Low
**Effort:** 2 weeks

- Bulk data export for tenants
- User data deletion workflows
- Audit trail exports
- Data retention policies

---

### 12. Mobile Applications

**Status:** Not Started (PWA explicitly deferred — mobile-friendly polish only)
**Priority:** Low
**Effort:** 8-12 weeks

- Progressive Web App (PWA) — **deferred by product decision.** A PWA implementation (manifest, service worker, install prompt, offline resilience) was prototyped on May 15, 2026 but rolled back; the requirement is mobile-friendliness, not an installable/offline app. Revisit only if an installable/offline experience becomes a confirmed requirement.
- Mobile-friendly responsive polish: in progress incrementally per surface (assessment wizard sticky bottom nav + large tap targets shipped May 15, 2026). See **UX Enhancements → Responsive Design**.
- iOS and Android native apps (future)

---

### 13. AI Help Chatbot

**Status:** Not Started
**Priority:** Low
**Effort:** 2-3 weeks

Following Vega's pattern:
- AI-powered help assistant grounded on User Guide
- Streaming responses for conversational experience
- Escalation to support ticket form
- Accessible from header toolbar

---

## UX ENHANCEMENTS

### Continuous Improvements

| Enhancement | Priority | Effort | Description |
|------------|----------|--------|-------------|
| Accessibility (WCAG) | Medium | Ongoing | ARIA labels, keyboard navigation, screen reader support |
| Responsive Design | Medium | 1 week | Mobile-optimized assessment experience |
| Loading States | Low | 3 days | Skeleton screens for all data-loading components |
| Error Boundaries | Low | 2 days | Graceful error handling with recovery options |
| Assessment Progress Bar | Low | 1 day | Visual progress indicator during assessments |

---

## KNOWN ISSUES & BUGS

| Issue | Severity | Status | Description |
|-------|----------|--------|-------------|
| None critical | - | - | No known critical issues |

---

## TECHNICAL DECISIONS

### Architecture Choices

| Decision | Rationale | Date |
|----------|-----------|------|
| Anthropic Claude over OpenAI | Better reasoning for nuanced maturity analysis, via Replit AI Integrations | Oct 2025 |
| PostgreSQL over NoSQL | Relational data model fits assessment structure; Neon-backed via Replit | Sep 2025 |
| SendGrid API over SMTP | Reliable transactional email with templates | Oct 2025 |
| Drizzle ORM over Prisma | Lighter weight, better TypeScript inference, simpler migrations | Sep 2025 |
| jsPDF over server-side PDF | Client-side generation reduces server load | Oct 2025 |
| 90-day AI cache | Balances freshness with cost; AI insights don't change frequently | Nov 2025 |
| Database sessions over in-memory | Production-ready SSO state management | Feb 2026 |
| PKCE for SSO | Security best practice for public client OAuth flows | Feb 2026 |

### Technical Debt

| Item | Priority | Notes |
|------|----------|-------|
| ExecAI import format | Low | One-off simple format for compatibility. Deprecate once all models migrated. |
| API versioning | Medium | Implement v1/v2 versioning before public API release |
| Connection pooling | Low | Add when traffic warrants optimization |
| Comprehensive logging | Medium | Structured logging with request correlation IDs |
| Error handling consistency | Medium | Standardize error response format across all endpoints |

---

## LEARNING COURSES MODULE — FOLLOW-UPS

The MVP slice (catalog, player, authoring, quizzes, attestations, enrollment tracking) shipped on May 2, 2026. Remaining follow-ups:

1. **SCORM 1.2 / 2004 import** — accept `.zip` uploads, parse `imsmanifest.xml`, store package in object storage, serve runtime that wires `cmi.*` → `lessonProgress.data`. Endpoints stubbed at `POST /api/scorm/import` (501).
2. **SCORM export** — generate a SCORM zip from a course's structure. Stub at `GET /api/courses/:id/scorm/export` (501).
3. ~~**Certificate PDF generation**~~ — **DONE.** `server/services/certificate-pdf.ts` renders a branded PDF via `pdf-lib`; `maybeIssueCertificate` stamps `certificateUrl` on enrollment completion. A `POST /api/courses/:id/certificate` re-issue endpoint exists for backfill.
4. **Attestation reminders/expirations** — scheduled email job (SendGrid) to nudge or re-collect expired attestations.
5. ~~**Assessment → course recommendation surface**~~ — **DONE.** Recommended-courses card renders on the Results page (driven by weak dimension scores) and a "Suggested for you" section on `/courses`, backed by `/api/assessments/:id/recommended-courses` and `/api/me/recommended-courses`.
6. ~~**Catalog filters/search**~~ — **DONE.** `/courses` supports keyword search (title/summary/description), tag chips, duration buckets (under 30 / 30–60 / over 60 min), and per-learner completion status (not started / in progress / completed). "Level" filter omitted — no `level` field exists on the `courses` schema; defer until a level taxonomy is scoped.
7. **Video transcoding/hosting** — currently stores raw URLs; consider Mux or Cloudflare Stream for adaptive playback.
8. **xAPI (Tin Can) statements** — emit statements for richer learning analytics.

---

## RICH COURSE SLIDES, NARRATION & POWERPOINT IMPORT (Orion Courses for Clients)

**Status:** Phases 0–4 complete (pending review / deploy-dependency provisioning)
**Priority:** High
**Branch:** `claude/orion-course-features-nax6bd`

### Background
Client demand to do more with Orion for courses: (1) author visually rich
screens at least as delightful as PowerPoint, optionally ingested from .pptx;
(2) per-slide narration (machine-generated or recorded) for accessibility;
(3) video on a slide within a module; (4) break a long recording into 8–10
separately playable modules; (5) private courses available to selected client
domains; (6) optionally close with a quiz to certify involvement.

### Assessment of existing platform (already built)
- Courses → Modules → Lessons with 7 lesson types (`slides`, `video`, `audio`,
  `rich_text`, `quiz`, `scorm`, `attestation`), enrollment + progress, SCORM
  import/export, certificates (`certificate-pdf.ts`), attestation records.
- Access control: `visibility` public/private, `ownerTenantId`, `courseTenants`
  sharing, and verified `tenantDomains` (email-domain → tenant mapping).
- Quiz grading (server-side), passing score, sequential gating, per-course
  certificate/attestation — **all present**.

### Confirmed product decisions
- **Slide authoring:** block/rich editor for native authoring; PowerPoint import
  is the high-fidelity escape hatch for complex decks (both required).
- **Narration:** machine TTS **and** recorded-audio upload, per slide. **TTS
  provider = Azure** (`@azure-rest/ai-inference` / Azure Speech). Captions not in
  v1 (transcript toggle is a cheap fast-follow; we already hold narration text).
- **Cert/quiz:** per-course (existing model) — no new work.
- **Access control (#5):** no build — reuse tenant ↔ verified-domain mapping;
  share a private course to the client's tenant.
- **Video (#3/#4):** no transcoding/segmentation build. Client pre-chunks the
  long recording into small hosted MP4s; we play them inline on slides. Each
  "module" is a lesson/slide pointing at its own MP4.
- **PPTX rendering:** LibreOffice headless (`soffice --convert-to`) renders each
  slide to an image (high fidelity); JS parsing extracts text + speaker notes.

### Architecture
- `lessons.content` is freeform JSONB → **no DB migration**. The `slides`
  payload evolves to a block model; legacy `{title, html, imageUrl}` slides are
  normalized on read (`normalizeSlide`) for backward compatibility.
- Shared, framework-agnostic slide model in `shared/slides.ts` (Zod schemas +
  types + `normalizeSlide`/`slideToHtml`) consumed by the client renderer/editor,
  the SCORM exporter, and (later) the PPTX importer.
- Slide content v2:
  - `slide = { id, blocks: Block[], narration?: { mode, text?, audioUrl?, voice?, status? } }`
  - `Block = heading | text | image | video | callout | image_slide`
- Media (images, recorded audio, MP4) reuse the existing Uppy + GCS upload path
  (`/api/objects/upload`, `ObjectUploader`).

### Phases
- **Phase 0 — Foundations (DONE):** shared slide v2 model + Zod; block renderer
  in `CourseDetail.tsx` (backward-compatible) with narration playback +
  transcript; SCORM export renders blocks; unit tests (`tests/unit/slides.test.ts`).
- **Phase 1 — Block slide editor (DONE):** `SlideEditor.tsx` — add/reorder/delete
  slides and blocks, rich-text fields, inline image/video upload, recorded-audio
  narration upload, transcript field; wired into `LessonEditorDialog` (replaces
  the JSON textarea for `slides`).
- **Phase 2 — Narration TTS (DONE):** Azure Speech REST TTS in
  `server/services/tts-service.ts`; endpoint `POST /api/courses/:id/narration/tts`
  (+ `GET /api/courses/tts/status`) generates an MP3, stores it via
  `ObjectStorageService.storeObjectBytes` (public ACL), returns `audioUrl`. The
  editor's "Generate narration (Azure TTS)" button is live; the client patches
  `narration.audioUrl` and saves the lesson. **Env:** `AZURE_SPEECH_KEY`,
  `AZURE_SPEECH_REGION` (or `AZURE_SPEECH_ENDPOINT`), optional `AZURE_SPEECH_VOICE`
  (default `en-US-JennyNeural`).
- **Phase 3 — PowerPoint import (DONE):** `server/services/pptx-import.ts` —
  `.pptx` → LibreOffice headless → PDF → `pdftoppm` per-slide PNGs
  (`image_slide` blocks) + OOXML text/speaker-notes extraction (seeds alt text +
  narration script, notes default to `mode: 'tts'`). Endpoint
  `POST /api/courses/:id/slides/pptx-import` (raw body) returns slides; the editor
  has an "Import PowerPoint" button that merges them in. Verified end-to-end
  (conversion + extraction) against a real 3-slide deck.
  **Deploy requirement:** the image must include `libreoffice-impress`
  (NOT just `libreoffice-core`) **and** `poppler-utils` (for `pdftoppm`).
  Overridable via `SOFFICE_BIN` / `PDFTOPPM_BIN`. Note: the unrelated `.pptx`
  block in `Admin.tsx` is for Knowledge-Base document uploads and was left as-is.
- **Phase 4 — Glue & hardening (DONE):**
  - Accessibility: learner slide view is a labelled carousel `group` with
    ArrowLeft/ArrowRight keyboard navigation, an `aria-live` region for block
    content, and labelled narration audio / video. Editor icon-only controls
    have `aria-label`s, the rich-text field is a labelled `textbox`, and image
    blocks warn when alt text is missing.
  - `/finalize` ACL audit: finalize now only accepts freshly-uploaded objects
    under the `uploads/` prefix, so an admin/modeler cannot flip an arbitrary
    existing object (e.g. a private certificate) to public via a known path.
  - Tests: unit coverage for the slide model, TTS config gating, and the PPTX
    OOXML text/entity extraction (`tests/unit/{slides,tts-service,pptx-import}.test.ts`).
  - Deferred to CI: component/E2E specs for the editor & player (no jsdom /
    Playwright runtime in this environment); the PPTX render pipeline was
    verified manually end-to-end against a real deck.

### Post-review follow-ups (sprint completion)
- **Slide content validation:** `POST`/`PUT` lessons now validate `slides`
  payloads against `slidesContentSchema` server-side (defense in depth).
- **Object GC:** narration MP3s / slide images are deleted when a lesson is
  removed or its content changes (regenerated TTS, replaced/removed media), via
  `ObjectStorageService.deleteObjectByPath` + `extractManagedObjectPaths` diff.
- **PPTX guards:** import rejects non-ZIP bodies (PK signature) and is capped at
  100 MB by the raw body limit.
- **Bulk narration + voice picker:** per-slide Azure voice selector plus a
  deck-level "Generate all narration" action (with a default voice) for slides
  that have a script but no audio.
- **TTS chunking:** long scripts are split (~3500-char chunks, sentence-aware)
  and the MP3s concatenated; total input bounded at 50k chars.
- **Narration auto-play / auto-advance:** learner toggle that auto-plays each
  slide's narration and advances when it ends.
- **Tests:** unit coverage for `splitTextForTts` + `extractManagedObjectPaths`,
  and route tests for finalize / TTS / PPTX-import / slide validation
  (`tests/integration/course-media.test.ts`).
- **Media ACL — gate by course access (Part D):** narration audio, imported
  slide images, and slide-editor-uploaded media are now stored **private** and
  served through a course-aware proxy `GET /api/courses/:id/media?path=…` that
  gates by course access. Managers stream any managed object (so the editor can
  preview unsaved media); other viewers must be able to view a *published*
  course AND the object must be referenced by one of its lessons (no open
  proxy). Anonymous viewers of public courses still work. Hero images are
  finalized separately (`PUT …/image`) and remain public for the catalog. The
  client rewrites media URLs via `courseMediaUrl()` in the player and editor.
  - *Perf note:* viewer requests load the course tree to validate the
    referenced-object set; fine for current course sizes, revisit with a cache
    or object→course index if decks grow large.

### Media finalize
Direct-to-storage Uppy uploads (inline images/video, recorded narration) are
normalized to stable `/objects/...` paths with a public ACL via
`POST /api/objects/finalize`, mirroring the course-hero-image flow.

### Files touched (Phases 0–3)
- NEW `shared/slides.ts`, `client/src/components/admin/SlideEditor.tsx`,
  `server/services/tts-service.ts`, `server/services/pptx-import.ts`,
  `tests/unit/slides.test.ts`, `tests/unit/tts-service.test.ts`
- MOD `client/src/pages/CourseDetail.tsx` (block renderer + narration),
  `client/src/components/admin/CourseManagement.tsx` (editor + PPTX import),
  `server/services/scorm-service.ts` (block-aware export),
  `server/objectStorage.ts` (`storeObjectBytes`),
  `server/routes/course-routes.ts` (TTS / PPTX / finalize endpoints)

---

## COMPLETED FEATURES

### February 2026
- SSO Profile Completion for new Microsoft users
- SSO Sign-Up tab with Microsoft button
- Secured SSO consent endpoints
- .model format reference in Import/Export panel
- Documentation overhaul (User Guide v2.0, Changelog, Backlog)

### January-February 2026
- Microsoft Entra ID SSO with PKCE flow
- Database-backed SSO state storage
- Azure AD tenant tracking and consent management
- reCAPTCHA for standard signup

### January 2026
- Share links and QR codes for models
- Model archiving with admin toggle
- AI analysis for individual vs. organizational assessments
- Anonymous AI access when enabled
- Flexible scoring engine (100-point averaging/sum, 500-point)
- Bulk demographic assignment
- Multi-format model import
- Model duplication
- Assessment filtering and reporting
- AI-powered cohort insights
- Security cleanup (credentials, logging)
- Performance indexes for assessment filtering

### November 2025
- OAuth 2.1 Identity Provider (OIDC, PKCE, RS256)
- Multi-tenant architecture (Phase 1)
- Knowledge Base system
- Assessment data import with batch tracking
- Assessment tagging system
- Proxy assessments
- Social sharing with OG previews
- AI content review workflow
- Benchmarking system
- User management with bulk import

### October 2025
- AI-powered insights (Claude Sonnet 4.5)
- PDF report generation and email delivery
- Anonymous user claiming
- Assessment wizard with autosave

### September 2025
- Core assessment engine
- Dynamic model routing
- CSV import/export
- ModelBuilder
- Admin console
- User authentication and RBAC
- Dark-mode-first UI

---

## DEPENDENCIES

| Dependency | Purpose | Status |
|------------|---------|--------|
| PostgreSQL (Neon) | Primary database | Active |
| Google Cloud Storage | Object storage for model images | Active |
| SendGrid | Email delivery (verification, passwords, reports) | Active |
| Anthropic Claude Sonnet 4.5 | AI insights via Replit AI Integrations | Active |
| HubSpot | Website tracking (Account ID: 49076134) | Active |
| jsPDF | PDF report generation | Active |
| Uppy | Frontend file uploader | Active |
| Stripe | Payment processing | Planned |

---

## METRICS FOR SUCCESS

- User engagement: Monthly active users and assessment completions
- Assessment completion rate: % of started assessments that finish
- AI insight generation rate: % of completed assessments that generate insights
- Tenant retention: Monthly active tenant rate
- API response times: < 200ms for core endpoints
- Uptime: 99.9% SLA target

---

## Galaxy Client Portal API — Deferred Endpoints

Task #40 shipped the v1 Galaxy contract (OAuth + per-tenant exposure policy + signed webhooks + audit log + admin UI + OpenAPI 3.1) covering everything Orion already has the underlying data model for: `/me`, `/artifacts`, `/assessments`, `/assessments/:id`, `/insights/me`. The endpoints below are intentionally deferred because the underlying entities or workflows do not exist in Orion yet. They are tracked here so they can be picked up without breaking the v1 contract.

| Endpoint | Reason deferred | Unblocked when |
|----------|-----------------|----------------|
| `POST /assessments` | Galaxy assessment-creation flow not yet defined; current Orion flow is in-app only. | Cross-product assessment-launch story is approved. |
| `POST /assessments/:id/responses` | Same as above. | — |
| `POST /assessments/:id/complete` | Same as above. | — |
| `GET /courses/:id`, `POST /courses/:id/progress`, `POST /courses/:id/quiz` | No `courses` table or progress tracking in Orion. | Learning module ships in Orion. |
| `POST /attestations/:id/sign` | No `attestations` table. | Attestation feature ships. |
| `GET /certificates/:id.pdf` | No certificate generator/storage. | Certificate generation feature ships. |
| `GET /admin/directory` (client_credentials) | Galaxy admin sync not yet scoped; client_credentials grant flow not exposed for this surface. | Admin directory sync story approved. |

The OpenAPI document at `/api/galaxy/v1/openapi.json` lists these under `x-deferred-endpoints`.

---

## TECH DEBT / DEFERRED ITEMS

| Item | Notes |
|------|-------|
| Academies `estimatedMinutes` field | Hidden from the AcademyOverview admin UI to reduce clutter. The DB column and schema remain in place. Restore the input when a duration-tracking story is scoped (e.g. for learner time estimates or Galaxy Portal exposure). |

---

## RELEASE SCHEDULE

| Quarter | Focus |
|---------|-------|
| Q1 2026 | Multi-tenant completion, SSO hardening, documentation |
| Q2 2026 | Individual assessments, Stripe billing, enhanced reporting |
| Q3 2026 | Advanced analytics, white-label, mobile optimization |
| Q4 2026 | Enterprise features, API marketplace, compliance |

---

## CONTACT

- Product Owner: Synozur Development Team
- Support: [ContactUs@synozur.com](mailto:ContactUs@synozur.com)
- Website: [www.synozur.com](https://www.synozur.com)
