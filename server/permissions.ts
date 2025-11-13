/**
 * Permission helper functions for role-based access control
 */

import { USER_ROLES, isGlobalAdmin, isTenantAdmin, isAnyAdmin } from '@shared/constants';
import type { User } from '@shared/schema';

export interface PermissionContext {
  user: User;
  targetTenantId?: string | null;
}

/**
 * Check if user is a global admin
 */
export function checkIsGlobalAdmin(user: User): boolean {
  return isGlobalAdmin(user.role);
}

/**
 * Check if user is a tenant admin for a specific tenant
 */
export function checkIsTenantAdmin(user: User, tenantId?: string | null): boolean {
  if (!isTenantAdmin(user.role)) {
    return false;
  }
  
  // Must be assigned to the tenant
  if (!user.tenantId || !tenantId) {
    return false;
  }
  
  return user.tenantId === tenantId;
}

/**
 * Check if user can access a specific tenant's data
 * Global admins can access any tenant
 * Tenant admins/modelers can only access their assigned tenant
 */
export function canAccessTenant(user: User, targetTenantId: string | null): boolean {
  // Global admin can access everything
  if (isGlobalAdmin(user.role)) {
    return true;
  }
  
  // For tenant-scoped roles, must match their assigned tenant
  if (isTenantAdmin(user.role) || user.role === USER_ROLES.TENANT_MODELER) {
    // If no target tenant (global resource), tenant-scoped users cannot access
    if (!targetTenantId) {
      return false;
    }
    
    // Must be assigned to a tenant and it must match
    return user.tenantId === targetTenantId;
  }
  
  // Regular users don't have admin access
  return false;
}

/**
 * Check if user can manage other users
 * Global admins can manage all users
 * Tenant admins can manage users in their tenant
 */
export function canManageUsers(user: User, targetUserTenantId?: string | null): boolean {
  // Global admin can manage any user
  if (isGlobalAdmin(user.role)) {
    return true;
  }
  
  // Tenant admin can manage users in their tenant
  if (isTenantAdmin(user.role) && user.tenantId) {
    // If target user has no tenant, tenant admin cannot manage them
    if (!targetUserTenantId) {
      return false;
    }
    return user.tenantId === targetUserTenantId;
  }
  
  return false;
}

/**
 * Check if user can create/edit models
 */
export function canManageModels(user: User, modelTenantId?: string | null): boolean {
  // Global admin can manage any model
  if (isGlobalAdmin(user.role)) {
    return true;
  }
  
  // Tenant admin and tenant modeler can manage models in their tenant
  if ((isTenantAdmin(user.role) || user.role === USER_ROLES.TENANT_MODELER) && user.tenantId) {
    // If model has no tenant (global model), only global admin can manage
    if (!modelTenantId) {
      return false;
    }
    return user.tenantId === modelTenantId;
  }
  
  return false;
}

/**
 * Check if user can assign a specific role to others
 */
export function canAssignRole(user: User, targetRole: string): boolean {
  // Global admin can assign any role
  if (isGlobalAdmin(user.role)) {
    return true;
  }
  
  // Tenant admin can only assign 'user' or 'tenant_modeler'
  if (isTenantAdmin(user.role)) {
    return targetRole === USER_ROLES.USER || targetRole === USER_ROLES.TENANT_MODELER;
  }
  
  // Other roles cannot assign roles
  return false;
}

/**
 * Get list of tenants a user can access
 * Global admin: all tenants (returns null to indicate "all")
 * Tenant admin/modeler: only their assigned tenant
 */
export function getAccessibleTenantIds(user: User): string[] | null {
  if (isGlobalAdmin(user.role)) {
    return null; // null means "all tenants"
  }
  
  if ((isTenantAdmin(user.role) || user.role === USER_ROLES.TENANT_MODELER) && user.tenantId) {
    return [user.tenantId];
  }
  
  return []; // No tenant access
}

/**
 * Validate that a user with a tenant-scoped role has a tenant assignment
 */
export function validateTenantAssignment(user: User): { valid: boolean; error?: string } {
  const needsTenant = user.role === USER_ROLES.TENANT_ADMIN || user.role === USER_ROLES.TENANT_MODELER;
  
  if (needsTenant && !user.tenantId) {
    return {
      valid: false,
      error: `Users with role '${user.role}' must be assigned to a tenant`,
    };
  }
  
  return { valid: true };
}

/**
 * Check if user has any admin privileges
 */
export function hasAdminAccess(user: User): boolean {
  return isAnyAdmin(user.role);
}
