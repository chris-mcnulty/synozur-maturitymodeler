import sgMail from '@sendgrid/mail';
import { db } from './db';
import { tenants } from '@shared/schema';
import { eq } from 'drizzle-orm';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key || !connectionSettings.settings.from_email)) {
    throw new Error('SendGrid not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, email: connectionSettings.settings.from_email};
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableSendGridClient() {
  const {apiKey, email} = await getCredentials();
  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: email
  };
}

/**
 * Build a SendGrid "from" value, optionally using the tenant's configured
 * emailFromName as the display name. Falls back to "Synozur" when there's
 * no tenant or no configured name.
 *
 * Returns either a string (just an email) or { email, name } object — both
 * forms are accepted by SendGrid's `from` field.
 */
export async function buildEmailFrom(
  fromEmail: string,
  tenantId?: string | null
): Promise<string | { email: string; name: string }> {
  let displayName: string | null = null;
  if (tenantId) {
    try {
      const [t] = await db
        .select({ emailFromName: tenants.emailFromName, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (t) {
        displayName = t.emailFromName || t.name || null;
      }
    } catch (err) {
      console.error('Failed to resolve tenant emailFromName:', err);
    }
  }
  const name = displayName || 'Synozur';
  return { email: fromEmail, name };
}
