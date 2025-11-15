# Orion Product Backlog

## Overview

This document tracks major features and enhancements planned for the Orion platform. Features are organized by priority and implementation status.

## Status Definitions

- **🔵 Planned**: Specified but not started
- **🟡 In Progress**: Currently being developed
- **🟢 Completed**: Fully implemented and deployed
- **🔴 On Hold**: Temporarily paused

## High Priority Features

### 1. Multi-Tenant Architecture [🔵 Planned]
**Specification**: [MULTI_TENANT_ARCHITECTURE.md](./MULTI_TENANT_ARCHITECTURE.md)

Transform Orion into a multi-tenant platform with:
- OAuth 2.0 identity provider for Synozur ecosystem
- Tenant-specific branding and models
- Cross-application user management
- Application entitlements (Orion, Nebula, Vega)

**Key Deliverables**:
- [ ] Database schema for multi-tenancy
- [ ] OAuth 2.0 provider implementation
- [ ] Tenant management interface
- [ ] Model visibility per tenant
- [ ] Tenant branding system

### 2. Individual Assessment Models [🔵 Planned]
Support for personal/skills-based assessments within organizations:
- Different scoring system (100 or 500 points)
- Individual-focused questions and recommendations
- Tenant-level reporting for HR/management
- Skills progression tracking

### 3. Billing & Subscriptions [🔵 Planned]
Implement monetization through Stripe:
- Tenant-level subscriptions
- Feature entitlements
- Usage tracking
- Payment management portal

## Medium Priority Features

### 4. Enhanced Admin Results View [🟢 Completed]
**Completed**: November 2025

Admin assessment results with:
- Date range filtering (default: last 30 days)
- Status filtering (completed, in progress, abandoned)
- Results grouped by date with subtotals
- Export capabilities

### 5. Custom Subdomains [🔵 Planned]
Premium feature for tenant-specific URLs:
- tenant.orion.synozur.com routing
- SSL certificate management
- DNS configuration interface

### 6. Advanced Analytics [🔵 Planned]
Enhanced reporting capabilities:
- Tenant-specific dashboards
- Cross-model comparisons
- Trend analysis over time
- Custom report builder

### 7. API Rate Limiting [🔵 Planned]
Per-tenant usage controls:
- Request quotas
- Bandwidth limits
- Usage monitoring
- Overage handling

### 8. Dedicated Tenant Visibility Manager [🔵 Planned]
Advanced UI for managing model-to-tenant assignments:
- Dedicated "Manage Model Visibility" button in admin console
- Dialog/modal showing all tenants with visual indicators
- Bulk tenant assignment operations
- Visual representation of tenant access
- Quick search/filter for tenants
- Assignment history/audit log

**Note**: Currently implemented with multi-select dropdown (Option B). This would provide a more comprehensive management interface.

## Low Priority Features

### 8. White-Label Options [🔵 Planned]
Complete branding customization:
- Custom domains
- Email sender configuration
- Remove Synozur branding (premium)

### 9. Data Export Compliance [🔵 Planned]
GDPR and data portability:
- Bulk data export for tenants
- User data deletion workflows
- Audit trail exports

### 10. Mobile Applications [🔵 Planned]
Native mobile experience:
- iOS application
- Android application
- Offline assessment capability

## Recently Completed Features

### Social Sharing [🟢 Completed]
- Multiple platform support
- Open Graph meta tags
- Model-specific previews

### Proxy Assessments [🟢 Completed]
- Admin/modeler can create assessments for prospects
- Profile data stored in assessment
- Visible in results and exports

### Anonymous User Claiming [🟢 Completed]
- Anonymous users can claim assessments after signup
- Seamless auth flow preservation

### Knowledge Base System [🟢 Completed]
- Document upload (PDF, DOCX, TXT, MD)
- AI grounding for better recommendations
- Model-specific and global documents

## Continuous Improvements

### Performance Optimization
- Query optimization for large datasets
- Caching strategy improvements
- Frontend bundle size reduction

### User Experience
- Accessibility improvements (WCAG compliance)
- Responsive design enhancements
- Loading state improvements

### Security
- Regular security audits
- Penetration testing
- Compliance certifications

## Feature Request Process

1. **Submission**: Features can be requested through support@synozur.com
2. **Review**: Product team evaluates impact and feasibility
3. **Prioritization**: Based on customer value and strategic alignment
4. **Planning**: Detailed specification created (like MULTI_TENANT_ARCHITECTURE.md)
5. **Implementation**: Development in phases with testing
6. **Release**: Staged rollout with monitoring

## Release Schedule

- **Q4 2025**: Multi-tenant foundation (Phase 1-2)
- **Q1 2026**: OAuth provider and tenant features (Phase 3)
- **Q2 2026**: Individual assessments and billing
- **Q3 2026**: Advanced analytics and white-label

## Technical Debt

### To Address
- [ ] Migrate from in-memory session storage to Redis
- [ ] Implement comprehensive API versioning
- [ ] Add database connection pooling
- [ ] Improve error handling consistency
- [ ] Add comprehensive logging system

### Addressed
- [x] CSV import/export functionality
- [x] Email template system
- [x] AI caching mechanism

## Dependencies

- **Database**: PostgreSQL (Neon)
- **Object Storage**: Google Cloud Storage
- **Email**: SendGrid
- **AI**: Azure OpenAI GPT-4o mini
- **Payment Processing**: Stripe (planned)
- **Authentication**: Passport.js → OAuth 2.0 (planned)

## Metrics for Success

- User engagement: Monthly active users
- Assessment completion rates
- Tenant retention rates
- API response times < 200ms
- 99.9% uptime SLA

## Contact

- Product Owner: Synozur Development Team
- Technical Lead: Engineering Team
- Support: support@synozur.com

---

*Last Updated: November 2025*
*Next Review: December 2025*