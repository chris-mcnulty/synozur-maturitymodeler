# Multi-Tenant Architecture Specification

## Executive Summary

This document outlines the transformation of Orion from a single-tenant maturity assessment platform into a comprehensive multi-tenant identity and assessment ecosystem. The platform will serve as the central identity provider for all Synozur applications (Orion, Nebula, Vega) while maintaining backward compatibility with existing non-tenant users.

## Key Objectives

1. **Centralized Identity Management**: Orion becomes the OAuth 2.0 provider for the entire Synozur ecosystem
2. **Multi-Tenant Support**: Organizations can have their own branded space with private models
3. **Flexible Model Distribution**: Models can be published publicly or privately to specific tenants
4. **Application Entitlements**: Per-tenant access control to different Synozur applications
5. **Individual Assessments**: Support for personal/skills-based assessments within organizations

## Architecture Overview

### User Structure
- Users can exist **with or without** tenant association
- Existing users remain independent until administratively moved
- Global admins (master admins) have system-wide access
- Tenant admins manage users within their organization

### Tenant Features
- **Domain mapping**: Email domains map to tenants (e.g., @acme.com → Acme tenant)
- **Auto-creation**: Configurable automatic tenant creation on first user registration (initially disabled)
- **Custom branding**: Logo, primary color, secondary color for tenant-specific content
- **Future subdomain support**: Premium feature for custom subdomains (acme.orion.synozur.com)

## Database Schema

### New Tables

```sql
-- Tenants table
CREATE TABLE tenants (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  domain VARCHAR UNIQUE NOT NULL, -- e.g., 'acme.com'
  logo_url VARCHAR,
  primary_color VARCHAR, -- hex color
  secondary_color VARCHAR, -- hex color
  auto_create_users BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Application entitlements
CREATE TABLE tenant_entitlements (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR REFERENCES tenants(id),
  application VARCHAR NOT NULL, -- 'orion', 'nebula', 'vega'
  enabled BOOLEAN DEFAULT true,
  features JSONB, -- specific feature flags
  created_at TIMESTAMP DEFAULT NOW()
);

-- Model tenant visibility
CREATE TABLE model_tenants (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id VARCHAR REFERENCES models(id),
  tenant_id VARCHAR REFERENCES tenants(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(model_id, tenant_id)
);

-- OAuth clients for external apps
CREATE TABLE oauth_clients (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR UNIQUE NOT NULL,
  client_secret VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  redirect_uris TEXT[], -- array of allowed redirect URIs
  created_at TIMESTAMP DEFAULT NOW()
);

-- OAuth tokens
CREATE TABLE oauth_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(id),
  client_id VARCHAR REFERENCES oauth_clients(id),
  access_token VARCHAR UNIQUE NOT NULL,
  refresh_token VARCHAR UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  scopes TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Schema Modifications

```sql
-- Users table additions
ALTER TABLE users ADD COLUMN tenant_id VARCHAR REFERENCES tenants(id);
ALTER TABLE users ADD COLUMN tenant_role VARCHAR; -- 'admin', 'user'
CREATE INDEX idx_users_tenant ON users(tenant_id);

-- Models table additions
ALTER TABLE models ADD COLUMN owner_tenant_id VARCHAR REFERENCES tenants(id);
ALTER TABLE models ADD COLUMN visibility VARCHAR DEFAULT 'public'; -- 'public', 'private', 'individual'
ALTER TABLE models ADD COLUMN model_class VARCHAR DEFAULT 'organizational'; -- 'organizational', 'individual'

-- Assessments table additions
ALTER TABLE assessments ADD COLUMN tenant_id VARCHAR REFERENCES tenants(id);
CREATE INDEX idx_assessments_tenant ON assessments(tenant_id);
```

## OAuth 2.0 Implementation

### Endpoints

#### Authorization Endpoint
`GET /oauth/authorize`
- Parameters: client_id, redirect_uri, response_type, scope, state
- Shows Synozur-branded login if not authenticated
- Returns authorization code

#### Token Endpoint
`POST /oauth/token`
- Exchange authorization code for access token
- Support refresh token flow
- Returns: access_token, refresh_token, expires_in, token_type

#### UserInfo Endpoint
`GET /oauth/userinfo`
- Requires valid access token
- Returns user profile including tenant information
- Includes application entitlements

### Scopes
- `profile`: Basic user information
- `email`: User email address
- `tenant`: Tenant information and role
- `entitlements`: Application access rights

### Example OAuth Flow Response
```json
{
  "sub": "user-uuid",
  "email": "john@acme.com",
  "name": "John Doe",
  "tenant": {
    "id": "tenant-uuid",
    "name": "Acme Corporation",
    "role": "user"
  },
  "entitlements": {
    "orion": true,
    "nebula": true,
    "vega": false
  }
}
```

## Model Visibility System

### Model Types
1. **Public Organizational Models**: Visible to all users (current default)
2. **Private Tenant Models**: Visible only to specific tenants
3. **Individual Models**: Personal/skills assessments for individuals within organizations

### Distribution Rules
- Master admins can publish any model to any tenant
- Models can be published to multiple tenants simultaneously
- Individual models use different scoring (100 or 500 points vs 100-500 for organizational)
- Tenant admins (future) can manage their private models

### Access Control
```typescript
// Model visibility logic
function canUserAccessModel(user, model) {
  // Public models are always accessible
  if (model.visibility === 'public') return true;
  
  // User must have a tenant for private/individual models
  if (!user.tenant_id) return false;
  
  // Check if model is published to user's tenant
  return modelTenants.includes(user.tenant_id);
}
```

## Branding System

### Mixed Branding Strategy
- **Tenant Branding**: Applied to private/tenant-specific content
- **Synozur Branding**: Applied to public content and authentication
- **Conditional Rendering**: Based on content ownership and context

### Branding Applications
| Context | Branding |
|---------|----------|
| Public model assessment | Synozur |
| Private tenant model | Tenant (if configured) |
| Login/OAuth pages | Synozur |
| PDF reports (private) | Mixed (tenant logo + Synozur) |
| Email notifications | Synozur |
| Admin console | Synozur |

### Implementation
```typescript
// Determine branding context
function getBranding(context) {
  if (context.model?.owner_tenant_id && context.tenant?.logo_url) {
    return {
      logo: context.tenant.logo_url,
      primaryColor: context.tenant.primary_color,
      secondaryColor: context.tenant.secondary_color,
      showPoweredBy: true // "Powered by Orion by Synozur"
    };
  }
  return defaultSynozurBranding;
}
```

## Tenant Management

### Admin Interface Features
- Create/edit tenants
- Configure domain mapping
- Upload logo and set colors
- Enable/disable auto-creation
- Manage application entitlements
- Assign tenant admins
- View tenant statistics

### Tenant Admin Capabilities (Phase 2)
- Manage users within tenant
- View tenant assessments and analytics
- Configure available public models
- Export tenant data
- Future: Create/manage private models

## User Registration Flow

### With Tenant Auto-Creation (When Enabled)
1. User signs up with email (e.g., john@acme.com)
2. System checks if tenant exists for domain
3. If not, creates tenant automatically
4. User receives verification email
5. Upon verification, user is associated with tenant

### Without Auto-Creation (Default)
1. User signs up with email
2. User is created without tenant association
3. Master admin can manually assign to tenant
4. Or tenant can be pre-created with domain mapping

## Migration Strategy

### Phase 1: Foundation
1. Implement database schema changes
2. Maintain backward compatibility
3. Existing users remain tenant-less
4. Current admin becomes global admin

### Phase 2: OAuth Provider
1. Implement OAuth 2.0 endpoints
2. Create client management interface
3. Test with mock external application
4. Document API for external apps

### Phase 3: Tenant Features
1. Build tenant management UI
2. Implement model visibility system
3. Add branding capabilities
4. Create tenant admin role

### Phase 4: Advanced Features
1. Individual assessment models
2. Tenant analytics dashboard
3. Billing integration (Stripe)
4. Subdomain support

## Security Considerations

1. **Data Isolation**: Strict tenant data separation using tenant_id filtering
2. **Authentication**: Centralized OAuth 2.0 with secure token management
3. **Authorization**: Role-based access control (global admin > tenant admin > user)
4. **Audit Logging**: Track all tenant admin actions
5. **Domain Verification**: Validate email domains before auto-creation

## API Changes

### New Endpoints
- `/api/tenants` - CRUD operations for tenants
- `/api/tenants/:id/users` - Manage tenant users
- `/api/tenants/:id/models` - Manage tenant models
- `/api/tenants/:id/entitlements` - Configure app access
- `/oauth/*` - OAuth 2.0 provider endpoints

### Modified Endpoints
- `/api/auth/register` - Support tenant detection
- `/api/models` - Filter by tenant visibility
- `/api/assessments` - Include tenant context
- `/api/admin/*` - Add tenant filtering options

## Testing Strategy

1. **Unit Tests**: OAuth flows, tenant isolation, model visibility
2. **Integration Tests**: Cross-tenant data isolation, OAuth token exchange
3. **E2E Tests**: Complete registration flow, tenant branding application
4. **Security Tests**: Token validation, unauthorized access attempts
5. **Performance Tests**: Multi-tenant query optimization

## Future Considerations

1. **Billing Integration**: Stripe for tenant subscriptions
2. **Advanced Analytics**: Per-tenant benchmarking and reporting
3. **White-Label Options**: Full custom domains and email
4. **API Rate Limiting**: Per-tenant usage quotas
5. **Data Export**: Tenant data portability compliance

## Success Metrics

- Successful OAuth authentication from external apps
- Zero data leakage between tenants
- Maintain current performance with 10x tenant growth
- Seamless experience for both tenant and non-tenant users
- Clean separation of branded vs Synozur content

## Implementation Tasks

This feature is broken down into the following implementation tasks:

1. **Database Schema**: Design and implement multi-tenant tables and relationships
2. **Tenant Management**: Create admin interface for tenant CRUD operations
3. **OAuth Provider**: Implement OAuth 2.0 authorization server
4. **Model Visibility**: Add tenant-based model access control
5. **Branding System**: Implement conditional branding based on content ownership
6. **Application Entitlements**: Per-tenant app access management
7. **Tenant Admin Role**: New permission level between user and global admin
8. **Individual Models**: Support for personal/skills assessments
9. **Authentication Flow**: Update registration for tenant detection
10. **Testing & Validation**: Comprehensive testing of multi-tenant isolation

## References

- Current Orion architecture: See `PLATFORM_OVERVIEW.md`
- User guides: See `USER_GUIDE.md` and `ADMIN_GUIDE.md`
- Product backlog: See `PRODUCT_BACKLOG.md`
- OAuth 2.0 RFC: https://tools.ietf.org/html/rfc6749
- OpenID Connect: https://openid.net/connect/

---

*Last Updated: November 2025*
*Status: Pending Implementation*
*Owner: Synozur Development Team*