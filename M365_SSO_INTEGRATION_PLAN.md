# Microsoft 365 SSO Integration & Identity Enrichment Plan

## Executive Summary
Enable Microsoft 365 (M365) Single Sign-On for Orion, allowing enterprise users to authenticate with their corporate M365 credentials and automatically inherit tenant alignment and application-specific RBAC across the Synozur ecosystem (Orion, Nebula, Vega).

**Priority**: Medium (no active customer requests)
**Complexity**: High
**Business Value**: Enterprise sales enablement, reduced IT friction

## Architecture Overview

### Identity Flow
```
Microsoft 365 → Orion (Identity Enrichment) → Nebula/Vega/Other Apps
```

### Dual Role System
1. **Orion as Identity Provider** (Current): Authenticates Nebula/Vega users
2. **Orion as OAuth Client** (New): Accepts M365 authentication

## Core Components

### 1. Database Schema Extensions

#### New Tables
```typescript
// External identity provider configurations
externalIdentityProviders: {
  id: varchar (UUID)
  name: 'microsoft' | 'google' | 'okta'
  tenant_id: varchar // Orion tenant
  client_id: varchar
  client_secret_encrypted: varchar
  authorization_endpoint: varchar
  token_endpoint: varchar
  userinfo_endpoint: varchar
  jwks_uri: varchar
  enabled: boolean
  created_at: timestamp
  updated_at: timestamp
}

// Link users to external identities
userExternalIdentities: {
  id: varchar (UUID)
  user_id: varchar // Orion user
  provider: 'microsoft' | 'google' | 'okta'
  external_id: varchar // M365 user ID
  external_email: varchar
  external_tenant_id: varchar // M365 tenant
  external_groups: text[] // M365 groups/roles
  linked_at: timestamp
  last_sync: timestamp
}

// M365 tenant to Orion tenant mapping
tenantMappings: {
  id: varchar (UUID)
  orion_tenant_id: varchar
  external_tenant_id: varchar // M365 tenant ID
  external_provider: 'microsoft'
  mapping_type: 'domain' | 'tenant_id' | 'manual'
  mapping_rules: json // Domain patterns, group rules, etc.
  auto_provision_users: boolean
  default_role: varchar
  created_at: timestamp
  updated_at: timestamp
}

// Track M365 admin consent per tenant
tenantIntegrations: {
  id: varchar (UUID)
  tenant_id: varchar // Orion tenant
  service_type: 'microsoft_365' | 'salesforce' | 'google_workspace'
  external_tenant_id: varchar
  admin_consent_granted: boolean
  consent_granted_at: timestamp
  consent_granted_by: varchar // user_id
  scopes: text[] // Approved OAuth scopes
  configuration: json // Service-specific settings
  expires_at: timestamp // Consent expiration if applicable
}

// Application-specific role mappings
roleTransformationRules: {
  id: varchar (UUID)
  tenant_id: varchar
  source_provider: 'microsoft'
  source_group: varchar // M365 group name
  target_application: 'orion' | 'nebula' | 'vega'
  target_role: varchar
  priority: integer // For conflict resolution
  enabled: boolean
}
```

#### Extended Tables
```typescript
// Extend tenants table
tenants: {
  // ... existing fields ...
  
  // M365 Integration
  m365_enabled: boolean
  m365_tenant_id: varchar
  m365_admin_consent_url: varchar
  m365_allowed_domains: text[]
  m365_auto_provision: boolean
  m365_default_role: varchar
  
  // Identity provider preferences
  primary_idp: 'native' | 'microsoft' | 'google'
  allowed_idps: text[]
  
  // Feature flags
  enabled_applications: text[] // ['orion', 'nebula', 'vega']
  vega_m365_integration: boolean // Excel/Outlook access
}

// Extend oauthTokens for external tokens
oauthTokens: {
  // ... existing fields ...
  
  // External service tokens
  external_provider: varchar // 'microsoft', null for Orion tokens
  external_access_token: varchar // Encrypted M365 access token
  external_refresh_token: varchar // Encrypted M365 refresh token
  external_token_expires: timestamp
  external_scopes: text[]
}
```

## Identity Enrichment System

### Tenant Assignment Strategies

#### 1. Domain-Based Mapping
```typescript
// Auto-assign tenant based on email domain
function assignTenantByDomain(email: string): string {
  const domain = email.split('@')[1];
  const mapping = await db.query.tenantMappings.findFirst({
    where: and(
      eq(tenantMappings.mapping_type, 'domain'),
      sql`${tenantMappings.mapping_rules}->>'domain' = ${domain}`
    )
  });
  return mapping?.orion_tenant_id || 'default';
}
```

#### 2. M365 Tenant ID Mapping
```typescript
// Direct M365 tenant to Orion tenant mapping
function assignTenantByM365Id(m365TenantId: string): string {
  const mapping = await db.query.tenantMappings.findFirst({
    where: and(
      eq(tenantMappings.external_tenant_id, m365TenantId),
      eq(tenantMappings.mapping_type, 'tenant_id')
    )
  });
  return mapping?.orion_tenant_id;
}
```

#### 3. Group-Based Rules
```typescript
// Assign based on M365 group membership
function assignTenantByGroups(m365Groups: string[]): string {
  const rules = await db.query.roleTransformationRules.findMany({
    where: inArray(roleTransformationRules.source_group, m365Groups),
    orderBy: desc(roleTransformationRules.priority)
  });
  // Apply highest priority rule
  return rules[0]?.tenant_id;
}
```

### Role Transformation Engine

```typescript
interface M365User {
  id: string;
  email: string;
  displayName: string;
  tenant: string;
  groups: string[];
  roles: string[];
}

interface EnrichedIdentity {
  // M365 Identity
  external_id: string;
  external_email: string;
  external_tenant: string;
  external_provider: 'microsoft';
  
  // Orion Identity
  orion_user_id: string;
  orion_tenant: string;
  orion_global_role: string;
  
  // Application Roles
  application_roles: {
    orion: string;
    nebula?: string;
    vega?: string;
  };
  
  // Permissions
  permissions: string[];
  
  // Metadata
  last_sync: Date;
  token_expires: Date;
}

async function enrichM365Identity(m365User: M365User): Promise<EnrichedIdentity> {
  // 1. Determine Orion tenant
  const tenant = await assignTenant(m365User);
  
  // 2. Get/Create Orion user
  const orionUser = await findOrCreateUser(m365User, tenant);
  
  // 3. Apply role transformation rules
  const roles = await transformRoles(m365User.groups, tenant);
  
  // 4. Calculate permissions
  const permissions = await calculatePermissions(roles, tenant);
  
  return {
    external_id: m365User.id,
    external_email: m365User.email,
    external_tenant: m365User.tenant,
    external_provider: 'microsoft',
    orion_user_id: orionUser.id,
    orion_tenant: tenant,
    orion_global_role: roles.global,
    application_roles: roles.applications,
    permissions,
    last_sync: new Date(),
    token_expires: new Date(Date.now() + 3600000)
  };
}
```

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Create database schema for external identity providers
- [ ] Implement JWT token handling for M365 tokens
- [ ] Build basic M365 OAuth client service
- [ ] Add environment configuration for M365 endpoints

### Phase 2: Authentication Flow (Weeks 3-4)
- [ ] Implement "Sign in with Microsoft" button
- [ ] Build M365 OAuth authorization flow
- [ ] Handle token exchange and storage
- [ ] Create user provisioning logic

### Phase 3: Identity Enrichment (Weeks 5-6)
- [ ] Build tenant mapping engine
- [ ] Implement role transformation rules
- [ ] Create permission calculation system
- [ ] Add group-to-role mapping

### Phase 4: Admin Controls (Weeks 7-8)
- [ ] Create admin UI for tenant mappings
- [ ] Build role transformation rule editor
- [ ] Add M365 admin consent workflow
- [ ] Implement audit logging

### Phase 5: Token Pass-Through (Weeks 9-10)
- [ ] Extend OAuth tokens to include M365 tokens
- [ ] Build secure token pass-through for Vega
- [ ] Implement token refresh chain
- [ ] Add token revocation handling

### Phase 6: Testing & Hardening (Weeks 11-12)
- [ ] End-to-end testing with test M365 tenant
- [ ] Security audit and penetration testing
- [ ] Performance optimization
- [ ] Documentation and training materials

## Security Considerations

### Token Security
- Encrypt M365 tokens at rest
- Implement token rotation
- Secure token pass-through to downstream apps
- Handle token revocation events

### Tenant Isolation
- Strict tenant boundary enforcement
- No cross-tenant data leakage
- Audit all cross-tenant operations
- Implement rate limiting per tenant

### Compliance
- Support M365 Conditional Access policies
- Honor M365 MFA requirements
- Implement session timeout policies
- Support GDPR data portability

## Configuration Examples

### Tenant Mapping Rules
```json
{
  "tenant_id": "acme_corp",
  "rules": [
    {
      "type": "domain",
      "pattern": "*.acme.com",
      "auto_provision": true,
      "default_role": "user"
    },
    {
      "type": "group",
      "source_group": "SynozurAdmins@acme.com",
      "target_role": "tenant_admin",
      "target_app": "orion"
    },
    {
      "type": "group", 
      "source_group": "FinanceTeam@acme.com",
      "target_role": "finance_user",
      "target_app": "nebula"
    }
  ]
}
```

### Application Entitlements
```json
{
  "tenant_id": "enterprise_customer",
  "applications": {
    "orion": {
      "enabled": true,
      "max_users": 500,
      "features": ["advanced_analytics", "api_access"]
    },
    "nebula": {
      "enabled": true,
      "max_users": 100
    },
    "vega": {
      "enabled": true,
      "m365_integration": true,
      "allowed_services": ["excel", "outlook", "planner"]
    }
  }
}
```

## User Experience

### First-Time Flow
1. User clicks "Sign in with Microsoft" on Orion
2. Redirected to Microsoft login
3. Authenticates with corporate credentials
4. Microsoft prompts for consent (first time only)
5. Redirected back to Orion
6. Orion creates/updates user account
7. User sees tenant-specific dashboard
8. Can access Nebula/Vega without re-authentication

### Returning User Flow
1. User goes to any Synozur app
2. Clicks "Sign in with Microsoft"
3. If M365 session active, automatic redirect
4. Lands directly in the application
5. Roles and permissions already configured

## Benefits

### For Enterprises
- **Single Identity**: One login for all Synozur apps
- **IT Control**: Manage through familiar M365 admin center
- **Compliance**: M365 policies automatically applied
- **Reduced Risk**: No separate passwords to manage

### For Synozur
- **Enterprise Ready**: Meet enterprise SSO requirements
- **Reduced Support**: No password reset tickets
- **Faster Adoption**: IT departments prefer M365 SSO
- **Competitive Advantage**: Seamless Microsoft integration

### For End Users
- **One Password**: Use existing corporate credentials
- **Seamless Access**: Move between apps without re-auth
- **Familiar Experience**: Standard Microsoft login flow
- **Better Security**: Enterprise MFA and policies

## Success Metrics
- User adoption rate via M365 SSO vs native auth
- Reduction in password reset requests
- Time from first login to productive use
- Number of enterprises adopting SSO
- User satisfaction scores

## Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| M365 service outage | Users can't login | Maintain native auth as fallback |
| Token expiration issues | Users logged out | Implement robust refresh logic |
| Complex tenant mappings | Configuration errors | Provide mapping validation tools |
| Performance degradation | Slow login | Cache enriched identities |
| Security breach | Data exposure | Regular security audits |

## Future Enhancements
- Support for other identity providers (Google, Okta)
- SCIM provisioning for automatic user lifecycle
- Advanced group sync with M365
- Real-time permission updates
- Federated GraphQL for cross-app queries

## Documentation Requirements
- Admin guide for M365 configuration
- Tenant mapping best practices
- Troubleshooting guide
- Security whitepaper
- API documentation for token pass-through

## Estimated Timeline
**Total Duration**: 12 weeks
**Team Size**: 2-3 engineers
**Priority**: Medium (implement when customer demand emerges)

## Dependencies
- Current OAuth implementation must be stable
- Tenant system must be fully operational
- Admin UI framework must be in place
- Security review process established

## Notes
- No active customer requests yet
- Will become critical for enterprise sales
- Consider pilot program with friendly customer
- May accelerate if competitor offers this