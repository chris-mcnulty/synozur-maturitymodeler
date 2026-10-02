import type { User } from "@shared/schema";

// Pre-registered accounts must be claimed through the tenant's configured
// Entra organization, even when that tenant disables automatic provisioning.
export function canClaimPreprovisionedMicrosoftAccount(
  user: Pick<User, "email" | "tenantId">,
  organizationId: string | null | undefined,
  identity: { email: string; ssoTenantId?: string },
): boolean {
  return Boolean(user.tenantId && organizationId && identity.ssoTenantId &&
    organizationId.toLowerCase() === identity.ssoTenantId.toLowerCase() &&
    user.email?.trim().toLowerCase() === identity.email.trim().toLowerCase());
}