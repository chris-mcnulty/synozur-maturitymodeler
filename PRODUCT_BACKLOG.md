# Orion Platform Master Backlog

**Last Updated:** September 3, 2026 (Version 3.2 status reconciliation)

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
8. [Learning Courses Status & Follow-Ups](#learning-courses-module--status--follow-ups)
9. [Rich Course Slides, Narration & PowerPoint](#rich-course-slides-narration--powerpoint-import-orion-courses-for-clients)
10. [Completed Features](#completed-features)
11. [Dependencies](#dependencies)
12. [Metrics for Success](#metrics-for-success)
13. [Galaxy API Status & Deferred Work](#galaxy-client-portal-api--status--deferred-work)
14. [Tech Debt & Deferred Items](#tech-debt--deferred-items)

---

## EXECUTIVE SUMMARY & PRIORITY SEQUENCE

### Current Status Assessment (Version 3.2 — September 2026)

| Item | Status | Notes |
|------|--------|-------|
| **Core Assessment Engine** | Complete | Multi-model, flexible scoring (100/500-point), auto-save, anonymous access |
| **AI-Powered Insights** | Complete | Azure AI Foundry GPT-5.4, configurable provider/model, caching, content review |
| **Benchmarking** | Complete | Industry, company size, country, combined segments with min thresholds |
| **PDF Reports & Email** | Complete | jsPDF generation, SendGrid delivery |
| **Model Management** | Complete | CSV + .model JSON import/export, ModelBuilder, archiving, duplication |
| **User Management** | Complete | CRUD, bulk import, roles, email verification, password resets |
| **RBAC** | Complete | Four-tier: global_admin, tenant_admin, tenant_modeler, user |
| **Knowledge Base** | Complete | Document upload for AI grounding, model-specific scoping |
| **Assessment Tagging** | Complete | Custom tags with colors and tenant-safe bulk assignment/removal |
| **Social Sharing** | Complete | LinkedIn, Twitter, Facebook, email with OG previews, QR codes |
| **Proxy Assessments** | Complete | Admin-created assessments for prospects |
| **OAuth 2.1 Identity Provider** | Complete | OIDC endpoints, PKCE, RS256 JWT, client management |
| **Microsoft Entra ID SSO** | Complete | PKCE, auto-provisioning, tenant-bound consent, separate SSO and Planner approval |
| **SSO Profile Completion** | Complete | Required profile fields for new SSO users |
| **Multi-Tenant Architecture** | ~85% | Isolation, branding, verified-domain mapping, SSO, and tenant administration shipped; custom hostnames and full entitlement gating remain |
| **Data Import** | Complete | Anonymized assessment data with validation and batch tracking |
| **Traffic Analytics** | Complete | Visit tracking, engagement metrics, CSV export |
| **Cross-Model Insights** | Complete | Personal and tenant trends, comparisons, AI narrative, PDF export |
| **Type/Propensity Assessments** | Complete | Archetype authoring, scoring, tie handling, results, imagery, population insights |
| **Learning Courses** | Complete (MVP+) | Catalog, authoring, progress, quizzes, attestations, certificates, recommendations, SCORM |
| **PowerPoint & Narrated Slides** | Complete | Review-first PPTX intake, structured editing, Azure narration, private media |
| **Monthly Insights Digest** | Complete (MVP) | Opt-out, tenant controls, duplicate prevention, run status/reset; monitoring follow-ups open |
| **Galaxy Client Portal API** | Complete (v1) | Tenant policy, assessments, Insights, courses, progress, certificates, attestations |
| **In-App Help** | Complete | User/admin guides, changelog, What's New, contextual support chat |
| **Documentation** | Updated for 3.2 | User/admin guides, changelog, and reconciled product backlog |

### Recommended Priority Sequence

```
NOW: Reliability and operational visibility
├── Digest run history and health monitoring
├── Automatic stale-run recovery
├── CI automation for digest tests
└── Continue tenant-isolation and accessibility regression checks

NEXT: Commercial and enterprise readiness
├── Stripe billing and subscriptions
├── Usage-based tenant entitlements
├── Custom subdomain/domain mapping
└── GDPR export, deletion, and retention workflows

LATER: Learning and engagement expansion
├── Reassessment reminders
├── Attestation reminders and expirations
├── xAPI and externally portable SCORM media
└── Video transcoding and native/PWA applications
```

---

## HIGH PRIORITY FEATURES

### 1. Multi-Tenant Architecture Completion

**Status:** ~85% Complete
**Priority:** High
**Effort:** 2-4 weeks remaining

**What's Built:**
- Tenant-private model visibility with `canAccessModel()` enforcement
- Model-to-tenant assignment (multi-select)
- OAuth client management per tenant
- Microsoft Entra ID SSO with auto-provisioning by domain/Azure AD tenant ID
- Tenant Management UI with Azure AD tenant tracking and consent status
- Four-tier RBAC with tenant scoping
- Tenant-specific logos, colors, and branded sign-in presentation
- Verified email-domain mapping and tenant-aware user provisioning
- Tenant-scoped course visibility, assessment results, tagging, and Galaxy policy
- Separate Microsoft sign-in and Planner consent status

**Remaining Work:**

| Feature | Effort | Description |
|---------|--------|-------------|
| **Custom Hostnames** | 2-3 weeks | Route and provision tenant-owned domains or subdomains |
| **Tenant Entitlements** | 1-2 weeks | Complete feature gating based on subscription tier |
| **Isolation Regression Coverage** | Ongoing | Continue automated checks as new tenant-aware surfaces are added |
| **Full White Label** | 2-3 weeks | Custom sender identity, domain presentation, and optional Synozur-brand removal |

---

### 2. In-App Documentation & What's New

**Status:** Complete
**Priority:** Maintain
**Effort:** Ongoing content maintenance

**Overview:**
Following Vega and Constellation patterns, surface platform documentation directly within the app. Users should be able to access the User Guide, see what's changed, and find help without leaving the application.

| Feature | Description |
|---------|-------------|
| **In-App User Guide** | Complete — browsable help content is available in the application |
| **In-App Admin Guide** | Complete — administrative documentation is role-aware |
| **What's New Modal** | Complete — release updates display based on changelog version |
| **Dismiss Logic** | Complete — users do not see the same release repeatedly |
| **Help Sidebar/Page** | Complete — contextual support and AI-assisted help are available |
| **Changelog Page** | Complete — the changelog is browsable in-app |
| **Footer/Header Links** | Complete — documentation is linked from application navigation |

**Maintenance Note:** Keep `CHANGELOG.md`, user guidance, and the displayed release version synchronized for every release.

---

### 3. Type, Propensity & Individual Assessments

**Status:** Type/Propensity Complete; Individual Skills Scope Open
**Priority:** Medium
**Effort:** 3-4 weeks for remaining individual-skills scope

**Overview:**
Orion now supports scored maturity assessments and non-numeric type/propensity assessments. A separate HR-oriented individual-skills product remains future work.

| Feature | Description |
|---------|-------------|
| **Type/Propensity Mode** | Complete — answer voting maps respondents to archetypes or champion types |
| **Type Results** | Complete — tie handling, type imagery, result history, and population insights |
| **Individual Scoring** | Open — scoring optimized for personal skills and proficiency |
| **Individual Questions** | Open — self-evaluation, frequency, and proficiency question types |
| **Tenant Reporting** | HR/management dashboards showing team skill distribution |
| **Skills Progression** | Track individual improvement over repeated assessments |
| **Privacy Controls** | Individual results visible only to the user and designated managers |

**Remaining Approach:** Scope individual-skills privacy, role-based benchmarks, manager visibility, and progression separately from the shipped type/propensity mode.

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

**Status:** Partially Complete
**Priority:** Medium
**Effort:** 2-3 weeks for remaining items

| Feature | Description |
|---------|-------------|
| **Tenant Dashboards** | Complete — tenant-scoped Insights and assessment analytics |
| **Cross-Model Comparisons** | Complete — compare maturity across different models |
| **Trend Analysis** | Complete — track score changes across repeat assessments |
| **Insights PDF** | Complete — export personal and tenant Insights |
| **Custom Report Builder** | Open — admin-configurable report templates |
| **Assessment PowerPoint Export** | Open — presentation-ready slides from assessment results |

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

**Status:** Partially Complete
**Priority:** Medium
**Effort:** 1-2 weeks for platform-wide enforcement

| Feature | Description |
|---------|-------------|
| **Galaxy Policy Limits** | Complete — tenant administrators can configure Galaxy requests per minute |
| **Platform-Wide Quotas** | Open — request limits based on subscription tier |
| **Usage Monitoring** | Open — real-time quota dashboard |
| **Overage Handling** | Open — graceful degradation or upgrade prompts |
| **Rate Limit Headers** | Complete for Galaxy; open for other public API surfaces |

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

**Status:** Complete
**Priority:** Maintain
**Effort:** Ongoing knowledge and quality maintenance

- AI-powered help assistant grounded in Orion guidance
- Streaming conversational responses
- Support escalation and ticket workflow
- Accessible from the application help experience

---

## UX ENHANCEMENTS

### Continuous Improvements

| Enhancement | Priority | Effort | Description |
|------------|----------|--------|-------------|
| Accessibility (WCAG) | Medium | Ongoing | Section 508/WCAG 2.1 AA pass shipped; maintain regression coverage |
| Responsive Design | Medium | Ongoing | Mobile assessment navigation shipped; continue surface-by-surface polish |
| Loading States | Low | Ongoing | Shared loading and empty-state patterns are implemented; fill remaining gaps |
| Error Boundaries | Low | Ongoing | Application-level recovery exists; standardize remaining route/API errors |
| Assessment Progress Bar | Complete | — | Visual progress and mobile navigation are implemented |

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
| Azure AI Foundry as primary AI provider | Enterprise-hosted GPT-5.4 is the production default; provider/model remain admin-configurable | Sep 2026 |
| Anthropic as alternate provider | Claude remains available as an alternate rather than the production default | Sep 2026 |
| PostgreSQL over NoSQL | Relational data model fits assessment structure; Neon-backed via Replit | Sep 2025 |
| SendGrid API over SMTP | Reliable transactional email with templates | Oct 2025 |
| Drizzle ORM over Prisma | Lighter weight, better TypeScript inference, simpler migrations | Sep 2025 |
| jsPDF over server-side PDF | Client-side generation reduces server load | Oct 2025 |
| 90-day AI cache | Balances freshness with cost; AI insights don't change frequently | Nov 2025 |
| Database sessions over in-memory | Production-ready SSO state management | Feb 2026 |
| PKCE for SSO | Security best practice for public client OAuth flows | Feb 2026 |
| Structured JSON for native course slides | Supports accessible editing, validation, narration, and portability; raw JSON remains an advanced escape hatch | Aug 2026 |
| Azure Speech for narration | Keeps course narration on the Microsoft stack and separate from assessment LLM selection | Aug 2026 |
| Server-side lesson completion rules | Required submissions and skip rules must not rely on browser-only enforcement | Aug 2026 |

### Technical Debt

| Item | Priority | Notes |
|------|----------|-------|
| ExecAI import format | Low | One-off simple format for compatibility. Deprecate once all models migrated. |
| API versioning beyond Galaxy | Medium | Galaxy has a versioned v1 contract; standardize remaining APIs before broader external exposure |
| Connection pooling | Low | Add when traffic warrants optimization |
| Comprehensive logging | Medium | Structured logging with request correlation IDs |
| Error handling consistency | Medium | Standardize error response format across all endpoints |

---

## LEARNING COURSES MODULE — STATUS & FOLLOW-UPS

The MVP and subsequent course-authoring expansion are implemented: catalog, player, authoring, quizzes, assignments, resources, attestations, enrollment/progress, certificates, assessment recommendations, SCORM, structured slides, narration, and PowerPoint intake. Remaining follow-ups:

1. **SCORM media portability** — package referenced private media inside exported SCORM archives and rewrite URLs for external LMS use.
2. **Attestation reminders/expirations** — scheduled email job to nudge or re-collect expired attestations.
3. **Video transcoding/hosting** — consider adaptive streaming for large course video libraries.
4. **xAPI (Tin Can) statements** — emit statements for richer learning analytics.
5. **Course level taxonomy** — define a level field before adding a catalog level filter.

---

## RICH COURSE SLIDES, NARRATION & POWERPOINT IMPORT (Orion Courses for Clients)

**Status:** Implemented in Version 3.2
**Priority:** Maintain and extend

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
- Media (images, recorded audio, MP4) reuse the managed Replit Object Storage
  upload path (`/api/objects/upload`, `ObjectUploader`).

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
  - Access is gated in two layers: a course-level check (managers, else a
    published course the user can view), then an object-level check (the object
    must be referenced by one of the course's lessons, else it falls back to the
    object's own ACL). The reference scan only reads known media-URL keys, not
    free text/HTML, so it can't be spoofed by an /objects path in slide text.
  - *Perf note:* requests load the course tree to validate the referenced-object
    set; fine for current course sizes, revisit with a cache or object→course
    index if decks grow large.
  - **Follow-up — SCORM export media:** the SCORM export still emits `/objects/…`
    URLs for slide images and narration. Those don't resolve inside an offline
    SCORM ZIP running in an external LMS (true even before this change, since the
    URLs are server-relative; now also private). Proper fix: copy referenced
    managed objects into the package and rewrite to relative asset paths.

### Media handling
Direct-to-storage uploads are normalized to stable managed-object paths. Course
hero images are public for catalog display; lesson slides, narration, and other
course media remain private behind course-aware authorization.

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

### September 2026 — Version 3.2
- Type/propensity assessments with archetype authoring, scoring, imagery, and population Insights
- Cross-model personal and tenant Insights with PDF export
- Structured course slide editor, assignments, resources, required submissions, and skip enforcement
- Review-first PowerPoint-to-course intake with editable extracted content
- Azure Speech narration, voice selection, transcripts, bulk generation, and auto-advance
- Private course-media authorization, validation, and managed-object cleanup
- SCORM import, playback, and export
- Monthly Insights digest with tenant controls, opt-out, concurrency protection, status, and reset
- Tenant-safe bulk assessment-result tagging
- Section 508/WCAG 2.1 AA accessibility pass
- Microsoft SSO and optional Planner consent separation with tenant-bound callback state
- Azure AI Foundry GPT-5.4 as the active production AI model
- Expanded Galaxy course, progress, certificate, and attestation APIs
- Assessment-to-course recommendations and production course package workflows

### May–August 2026
- Course catalog search, filtering, certificates, and recommendations
- Mobile-friendly assessment navigation
- Microsoft 365 maturity scoring and numeric-question compatibility fixes
- Configurable suppression of numeric scores and detailed narratives
- Result filtering, model import previews, and admin analytics refinements
- OAuth/SSO redirect hardening, tenant-isolation fixes, dependency remediation, and security scanning

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
| Replit Object Storage | Private/public managed media and generated files | Active |
| SendGrid | Email delivery (verification, passwords, reports) | Active |
| Azure AI Foundry GPT-5.4 | Production AI summaries, recommendations, and Insights | Active |
| Anthropic Claude Sonnet 4.5 | Alternate AI provider | Available |
| Azure Speech | Course slide narration | Active when configured |
| LibreOffice + Poppler | PowerPoint rendering and slide-image extraction | Active |
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

## Galaxy Client Portal API — Status & Deferred Work

The Galaxy v1 contract includes OAuth, per-tenant exposure policy, signed webhooks, audit logging, admin management, OpenAPI 3.1, assessments, results, Insights, courses, course progress, certificates, and attestations. This supersedes the limited May 2026 contract that exposed empty placeholders for learning entities. Remaining deferred operations require additional cross-product workflow decisions.

| Endpoint | Reason deferred | Unblocked when |
|----------|-----------------|----------------|
| `POST /assessments` | Galaxy assessment-creation flow not yet defined; current Orion flow is in-app only. | Cross-product assessment-launch story is approved. |
| `POST /assessments/:id/responses` | Same as above. | — |
| `POST /assessments/:id/complete` | Same as above. | — |
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
| Q3 2026 | Version 3.2 stabilization, digest operations, accessibility and tenant-isolation regression coverage |
| Q4 2026 | Billing/entitlements, custom domains, compliance workflows, reassessment reminders |
| 2027 | Learning interoperability, adaptive video, broader enterprise APIs, native/PWA evaluation |

---

## CONTACT

- Product Owner: Synozur Development Team
- Support: [ContactUs@synozur.com](mailto:ContactUs@synozur.com)
- Website: [www.synozur.com](https://www.synozur.com)
