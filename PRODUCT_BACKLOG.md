# Orion Platform Master Backlog

**Last Updated:** February 14, 2026 (Documentation overhaul, SSO profile completion)

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

## LOWER PRIORITY / FUTURE FEATURES

### 8. Custom Subdomains (Premium)

**Status:** Not Started
**Priority:** Low
**Effort:** 2-3 weeks

Premium feature for tenant-specific URLs:
- tenant.orion.synozur.com routing
- SSL certificate management
- DNS configuration interface

---

### 9. White-Label Options

**Status:** Not Started
**Priority:** Low
**Effort:** 3-4 weeks

Complete branding customization:
- Custom domains
- Email sender configuration
- Remove Synozur branding (premium tier)
- Custom landing pages

---

### 10. Data Export Compliance (GDPR)

**Status:** Not Started
**Priority:** Low
**Effort:** 2 weeks

- Bulk data export for tenants
- User data deletion workflows
- Audit trail exports
- Data retention policies

---

### 11. Mobile Applications

**Status:** Not Started
**Priority:** Low
**Effort:** 8-12 weeks

- Progressive Web App (PWA) first
- iOS and Android native apps (future)
- Offline assessment capability

---

### 12. AI Help Chatbot

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
