# Threat Model

## Project Overview

Orion is a public internet-facing multi-tenant maturity assessment platform and OAuth/OIDC identity provider built with a React/Vite frontend, an Express/TypeScript backend, PostgreSQL/Drizzle, session-based authentication, Microsoft Entra ID SSO, and several privileged outbound integrations (SendGrid, Google Cloud Storage, Azure AI, Microsoft Graph/Planner, HubSpot). Production traffic is reachable from the public internet, so public routes, login flows, OAuth/OIDC endpoints, portal-key APIs, and tenant-scoped content delivery are all in scope.

This scan treats development-only sandboxes and mockup environments as out of scope unless production reachability is demonstrated. In production, TLS is provided by the platform, so the main concerns are application-layer authorization, redirect handling, data isolation, untrusted content handling, and control of privileged integrations.

## Assets

- **User accounts and sessions** — local passwords, authenticated sessions, SSO-linked identities, and profile state. Compromise enables impersonation across tenant content, results, courses, and support features.
- **OAuth/OIDC credentials** — OAuth clients, authorization codes, refresh/access tokens, consent records, PKCE state, and redirect URI registrations. Compromise affects both Orion users and downstream relying parties.
- **Tenant-isolated business data** — assessment responses, maturity results, models, courses, academies, certificates, attestations, support tickets, and traffic analytics. Cross-tenant exposure would break contractual isolation.
- **Administrative controls** — tenant management, portal keys, OAuth client management, model/course publishing, SSO consent status, and support/planner settings. Unauthorized changes can widen access or misroute external trust.
- **Privileged integration secrets and capabilities** — database credentials, session secret, Azure app credentials, SendGrid, GCS, AI provider credentials, and Planner/Graph access. Abuse could leak data or perform actions in third-party systems.
- **Authored rich content and exported artifacts** — course rich text, generated PDFs, email templates, imported files, and public-facing content. These are attacker-adjacent because admins/modelers can author content that is later rendered to other users.

## Trust Boundaries

- **Browser ↔ Express API** — all client input is untrusted, including query parameters used for redirects, IDs, filters, and content-editing payloads.
- **Unauthenticated ↔ authenticated ↔ admin/modeler** — Orion has public pages, normal user actions, tenant-admin/modeler actions, and global-admin controls. Server-side role enforcement must be authoritative.
- **Tenant ↔ tenant** — models, results, courses, portal exposure, and support data must remain scoped to the correct tenant even when global tables or shared content are involved.
- **OAuth/OIDC relying parties ↔ Orion identity provider** — redirect URIs, consent, authorization codes, token exchange, and portal/API keys cross an external trust boundary and must not trust client-supplied destinations or identifiers.
- **Express API ↔ PostgreSQL** — route handlers and services hold broad DB privileges, so injection or missing filters can become full data-compromise issues.
- **Express API ↔ external services** — SSO, Planner, SendGrid, AI providers, HubSpot, and GCS are privileged outbound integrations. Callback and provisioning flows must verify origin/state before mutating local security state.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, `server/auth.ts`, `server/oauth-routes.ts`, `server/routes/galaxy/*`, `server/routes-support.ts`, `server/routes/course-routes.ts`, `server/routes/model-routes.ts`.
- **Highest-risk areas:** auth/session setup, Microsoft SSO provisioning, OAuth/OIDC provider endpoints, Galaxy bearer-token and portal-key APIs, tenant-scoped content/resource delivery, support/planner integration, rich-content rendering/export.
- **Surface split:** public (`/auth`, SSO, OAuth authorize/consent, public model/course/help pages, portal-key APIs), authenticated user APIs (assessments, results, courses, support), admin/modeler APIs (tenant/model/course/user management, analytics, portal keys). The Galaxy portal `GET /api/galaxy/v1/portal/traffic` endpoint is an intentional app-wide analytics surface for central reporting; future scans should not flag its global aggregation behavior by itself unless key issuance or authentication broadens beyond that intended trust model.
- **Usually dev-only / lower-priority:** sample assets, screenshots, docs, migrations, tests, and experimental/mockup content unless a production route or import path consumes them.

## Threat Categories

### Spoofing

Orion accepts identities from local username/password, Microsoft Entra ID, OAuth clients, and Galaxy API consumers. The system must prove who is calling before creating sessions, issuing OAuth codes/tokens, or marking organization-level consent state. OAuth clients and portal keys must only act within their registered identity and scope. SSO and admin-consent callbacks must be bound to verified state so third parties cannot spoof successful security events.

### Tampering

The application lets privileged users manage tenants, models, courses, support settings, OAuth clients, and portal keys. Query parameters, callback parameters, and admin-authored content are all attacker-adjacent inputs. Orion must reject unregistered redirect targets, prevent unauthorized mutation of tenant security flags, and ensure client-supplied identifiers cannot alter data outside the caller's tenant or role.

### Information Disclosure

The platform stores multi-tenant assessment data, traffic analytics, support content, user profiles, and OAuth-related records. Every API response must be scoped to the authenticated user, client, tenant, or portal key policy that justified access. Public or key-authenticated endpoints must not return app-wide analytics, cross-tenant aggregates, or privileged metadata unless that access is explicitly intended and narrowly authorized. For this codebase, `/api/galaxy/v1/portal/traffic` is an explicitly intended central-reporting exception; the security question there is whether portal keys are issued and constrained appropriately, not whether the endpoint aggregates globally.

### Denial of Service

Public login, OAuth, SSO, and support-adjacent routes are reachable from the internet and some flows perform DB work or outbound calls. Orion must avoid unauthenticated paths that trigger unbounded expensive work, large file processing, or repeated token/provisioning churn. This matters most for auth flows, imports, AI-backed helpers, and file-processing utilities.

### Elevation of Privilege

The project has clear privilege tiers (`user`, `tenant_modeler`, `tenant_admin`, `global_admin`) plus external-client trust levels (OAuth clients, portal keys, Galaxy scopes). Server-side authorization must enforce both role and tenant boundaries on every route. A vulnerability is especially important here if it lets a low-privilege user, a public caller, or a tenant-scoped key gain broader tenant, admin, or app-wide access.
