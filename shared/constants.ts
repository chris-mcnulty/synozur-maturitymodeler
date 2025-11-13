/**
 * Shared constants for role-based access control
 */

export const USER_ROLES = {
  USER: 'user',
  TENANT_MODELER: 'tenant_modeler',
  TENANT_ADMIN: 'tenant_admin',
  GLOBAL_ADMIN: 'global_admin',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// Valid role values array for validation
export const VALID_ROLES: UserRole[] = Object.values(USER_ROLES);

// Roles that require tenant assignment
export const TENANT_SCOPED_ROLES: UserRole[] = [
  USER_ROLES.TENANT_MODELER,
  USER_ROLES.TENANT_ADMIN,
];

// Admin roles
export const ADMIN_ROLES: UserRole[] = [
  USER_ROLES.GLOBAL_ADMIN,
  USER_ROLES.TENANT_ADMIN,
];

// Helper functions for role checking
export function isGlobalAdmin(role: string): boolean {
  return role === USER_ROLES.GLOBAL_ADMIN;
}

export function isTenantAdmin(role: string): boolean {
  return role === USER_ROLES.TENANT_ADMIN;
}

export function isTenantModeler(role: string): boolean {
  return role === USER_ROLES.TENANT_MODELER;
}

export function isAnyAdmin(role: string): boolean {
  return ADMIN_ROLES.includes(role as UserRole);
}

export function requiresTenant(role: string): boolean {
  return TENANT_SCOPED_ROLES.includes(role as UserRole);
}

export function isValidRole(role: string): boolean {
  return VALID_ROLES.includes(role as UserRole);
}

// Get display name for role
export function getRoleDisplayName(role: string): string {
  const displayNames: Record<string, string> = {
    [USER_ROLES.USER]: 'User',
    [USER_ROLES.TENANT_MODELER]: 'Tenant Modeler',
    [USER_ROLES.TENANT_ADMIN]: 'Tenant Admin',
    [USER_ROLES.GLOBAL_ADMIN]: 'Global Admin',
  };
  return displayNames[role] || role;
}

// Roles that a given role can assign to others
export function getAssignableRoles(currentRole: string): UserRole[] {
  if (currentRole === USER_ROLES.GLOBAL_ADMIN) {
    // Global admins can assign any role
    return [...VALID_ROLES];
  }
  if (currentRole === USER_ROLES.TENANT_ADMIN) {
    // Tenant admins can only assign user and tenant_modeler
    return [USER_ROLES.USER, USER_ROLES.TENANT_MODELER];
  }
  // Other roles cannot assign roles
  return [];
}
