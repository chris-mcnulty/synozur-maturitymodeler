import { db } from '../db.js';
import { tenants, tenantDomains, users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string | null {
  const match = email.match(/@(.+)$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Check if an email domain matches a verified tenant domain
 * Returns tenant info if match found, null otherwise
 */
export async function detectTenantFromEmail(email: string): Promise<{
  tenant: typeof tenants.$inferSelect;
  domain: typeof tenantDomains.$inferSelect;
} | null> {
  const emailDomain = extractDomain(email);
  if (!emailDomain) {
    return null;
  }

  // Look for a verified domain match
  const domainRecords = await db
    .select()
    .from(tenantDomains)
    .where(and(
      eq(tenantDomains.domain, emailDomain),
      eq(tenantDomains.verified, true)
    ))
    .limit(1);

  if (domainRecords.length === 0) {
    return null;
  }

  const domainRecord = domainRecords[0];

  // Get the tenant information
  const tenantRecords = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, domainRecord.tenantId))
    .limit(1);

  if (tenantRecords.length === 0) {
    return null;
  }

  return {
    tenant: tenantRecords[0],
    domain: domainRecord,
  };
}

/**
 * Assign user to tenant
 */
export async function assignUserToTenant(
  userId: string,
  tenantId: string
): Promise<void> {
  await db
    .update(users)
    .set({ tenantId })
    .where(eq(users.id, userId));
}

/**
 * Check if user should be auto-assigned to tenant after email verification
 * If autoCreateUsers is enabled for the tenant, assign the user
 */
export async function autoAssignUserToTenant(
  userId: string,
  email: string
): Promise<boolean> {
  const tenantMatch = await detectTenantFromEmail(email);

  if (!tenantMatch) {
    return false; // No matching tenant domain
  }

  // Check if tenant has autoCreateUsers enabled
  if (!tenantMatch.tenant.autoCreateUsers) {
    return false; // Manual assignment required
  }

  // Auto-assign user to tenant
  await assignUserToTenant(userId, tenantMatch.tenant.id);

  console.log(`Auto-assigned user ${userId} to tenant ${tenantMatch.tenant.name} (${tenantMatch.tenant.id})`);
  
  return true;
}
