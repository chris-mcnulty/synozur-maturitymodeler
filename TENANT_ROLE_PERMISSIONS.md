# Tenant-Scoped Role Permissions

## Role Hierarchy

### 1. Global Admin (`global_admin`)
- **Scope**: Entire platform (all tenants)
- **Description**: Platform administrator with unrestricted access
- **Permissions**:
  - Manage all tenants (create, edit, delete)
  - Manage all users across all tenants
  - Assign users to any tenant
  - Assign any role to any user
  - Manage all models (published and draft) across all tenants
  - View all assessment results across all tenants
  - Manage benchmarks globally
  - Import/export data for any tenant
  - Access AI usage analytics
  - Manage knowledge base documents for all tenants
  - Configure global platform settings

### 2. Tenant Admin (`tenant_admin`)
- **Scope**: Single tenant (must be assigned to a tenant)
- **Description**: Organization administrator with tenant-scoped access
- **Permissions**:
  - View and manage users **only within their tenant**
  - Assign users to their tenant (cannot remove from tenant or assign to other tenants)
  - Assign roles to users within their tenant (user, tenant_modeler only - cannot create tenant_admin or global_admin)
  - Manage models **owned by their tenant** (create, edit, delete)
  - View assessment results **only for their tenant's models**
  - Configure benchmarks for their tenant's models
  - Import/export data for their tenant
  - Manage knowledge base documents scoped to their tenant
  - View AI usage for their tenant
- **Restrictions**:
  - Cannot access tenant management UI
  - Cannot see users from other tenants
  - Cannot access global models (unless explicitly shared)
  - Cannot create other tenant_admin users

### 3. Tenant Modeler (`tenant_modeler`)
- **Scope**: Single tenant (must be assigned to a tenant)
- **Description**: Model builder/content creator for a specific organization
- **Permissions**:
  - Create and edit models **owned by their tenant**
  - Manage dimensions, questions, and answer options for their models
  - Set model status (draft/published) for their models
  - View assessment results for their tenant's models (read-only)
  - Upload/manage knowledge documents for their tenant
- **Restrictions**:
  - Cannot manage users
  - Cannot manage benchmarks
  - Cannot import/export data
  - Cannot access global platform settings
  - Cannot see models from other tenants

### 4. User (`user`)
- **Scope**: Platform-wide (can be assigned to a tenant or unassigned)
- **Description**: Standard end user taking assessments
- **Permissions**:
  - Take assessments on published models
  - View their own assessment results
  - Manage their own profile
  - View their organization info (if assigned to tenant)
- **Restrictions**:
  - Cannot access admin features
  - Cannot create or edit models
  - Cannot view other users' results

## Permission Matrix

| Feature | Global Admin | Tenant Admin | Tenant Modeler | User |
|---------|--------------|--------------|----------------|------|
| **Tenant Management** |
| Create/Edit/Delete Tenants | ✓ | ✗ | ✗ | ✗ |
| View All Tenants | ✓ | Own Only | Own Only | Own Only |
| Manage Tenant Domains | ✓ | ✗ | ✗ | ✗ |
| **User Management** |
| View Users (All) | ✓ | Own Tenant | ✗ | Self Only |
| Create/Edit/Delete Users | ✓ | Own Tenant | ✗ | Edit Self |
| Assign Tenant (Any) | ✓ | Own Tenant | ✗ | ✗ |
| Assign Role (Any) | ✓ | Limited* | ✗ | ✗ |
| **Model Management** |
| Create Models | ✓ | ✓ | ✓ | ✗ |
| Edit Models (All) | ✓ | Own Tenant | Own Tenant | ✗ |
| Delete Models | ✓ | Own Tenant | Own Tenant | ✗ |
| Publish Models | ✓ | ✓ | ✓ | ✗ |
| Manage Dimensions/Questions | ✓ | ✓ | ✓ | ✗ |
| **Results & Analytics** |
| View All Results | ✓ | Own Tenant | Own Tenant** | Self Only |
| Export Results | ✓ | Own Tenant | ✗ | ✗ |
| View Benchmarks | ✓ | Own Tenant | Own Tenant | ✗ |
| Configure Benchmarks | ✓ | ✓ | ✗ | ✗ |
| **Content Management** |
| Manage Knowledge Base | ✓ | Own Tenant | Own Tenant | ✗ |
| AI Review Queue | ✓ | Own Tenant | Own Tenant | ✗ |
| **Data Operations** |
| Import Assessment Data | ✓ | Own Tenant | ✗ | ✗ |
| Export CSV Reports | ✓ | Own Tenant | ✗ | ✗ |
| View Audit Log | ✓ | Own Tenant | ✗ | ✗ |
| **AI & Settings** |
| View AI Usage Stats | ✓ | Own Tenant | ✗ | ✗ |
| Configure Global Settings | ✓ | ✗ | ✗ | ✗ |

\* Tenant Admin can only assign `user` or `tenant_modeler` roles  
\*\* Tenant Modeler has read-only access to results

## Model Ownership

Models will have a `tenant_id` field (nullable):
- **Global Models** (`tenant_id = NULL`): Accessible to all users, manageable only by global_admin
- **Tenant Models** (`tenant_id = <specific tenant>`): Accessible to tenant members, manageable by tenant_admin and tenant_modeler of that tenant

## Implementation Notes

### Database Changes
1. Update `users.role` enum: `'user' | 'tenant_modeler' | 'tenant_admin' | 'global_admin'`
2. Add `models.tenant_id` (nullable foreign key to tenants table)
3. Constraint: `tenant_admin` and `tenant_modeler` MUST have a tenant_id assigned

### Backend Middleware
- `ensureGlobalAdmin()` - Only global_admin
- `ensureTenantAdmin()` - global_admin OR (tenant_admin + valid tenant)
- `ensureModelAccess(modelId)` - Check if user can access specific model based on tenant
- `ensureAnyAdmin()` - Any admin role (global_admin, tenant_admin)

### Migration Strategy
1. Existing `admin` users → `global_admin`
2. Existing `modeler` users → Keep as `user` (manual upgrade required)
3. All existing models → `tenant_id = NULL` (global models)

## Security Considerations
- Tenant admins cannot escalate privileges (cannot create other tenant_admins)
- Users cannot be assigned tenant_admin/tenant_modeler without a tenant assignment
- Cross-tenant data access is strictly prevented at the database query level
- Global admins always bypass tenant scoping
