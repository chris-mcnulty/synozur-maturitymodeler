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
  const branding = await getEmailBranding(tenantId);
  return { email: fromEmail, name: branding.brandName };
}

const SYNOZUR_PRIMARY = '#810FFB';
const SYNOZUR_BRAND = 'Synozur';

export interface EmailBranding {
  /** Hex color (e.g. #810FFB) used for headings, CTA buttons, and accents. */
  primaryColor: string;
  /** Fully-qualified URL to the brand logo, or null if none configured. */
  logoUrl: string | null;
  /** Display name used in headers/footers (tenant emailFromName, name, or "Synozur"). */
  brandName: string;
  /** Pre-rendered HTML header block (logo banner or color band). */
  headerHtml: string;
  /** Pre-rendered HTML footer block (brand name + copyright). */
  footerHtml: string;
}

function escapeAttr(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function resolveLogoUrl(logoUrl: string | null | undefined, baseUrl?: string | null): string | null {
  if (!logoUrl) return null;
  // Reject URLs containing control chars, quotes, angle brackets, or whitespace
  // (which could break out of an HTML attribute) before any further handling.
  if (/[\s"'<>`]/.test(logoUrl) || /[\u0000-\u001f\u007f]/.test(logoUrl)) return null;
  if (/^https?:\/\//i.test(logoUrl)) return logoUrl;
  // Disallow other schemes (javascript:, data:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(logoUrl)) return null;
  if (!baseUrl) return null;
  return logoUrl.startsWith('/') ? `${baseUrl}${logoUrl}` : `${baseUrl}/${logoUrl}`;
}

/**
 * Resolve tenant branding for outgoing emails. Falls back to Synozur defaults
 * when there's no tenant or no configured branding fields. The returned
 * `headerHtml` and `footerHtml` are ready to drop into email templates.
 */
export async function getEmailBranding(
  tenantId?: string | null,
  baseUrl?: string | null
): Promise<EmailBranding> {
  let primaryColor = SYNOZUR_PRIMARY;
  let rawLogo: string | null = null;
  let brandName = SYNOZUR_BRAND;

  if (tenantId) {
    try {
      const [t] = await db
        .select({
          emailFromName: tenants.emailFromName,
          name: tenants.name,
          logoUrl: tenants.logoUrl,
          primaryColor: tenants.primaryColor,
        })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (t) {
        if (t.primaryColor && /^#[0-9a-fA-F]{6}$/.test(t.primaryColor)) {
          primaryColor = t.primaryColor;
        }
        rawLogo = t.logoUrl || null;
        brandName = t.emailFromName || t.name || SYNOZUR_BRAND;
      }
    } catch (err) {
      console.error('Failed to resolve tenant branding for email:', err);
    }
  }

  const logoUrl = resolveLogoUrl(rawLogo, baseUrl);
  const safeName = escapeAttr(brandName);

  let headerHtml: string;
  if (logoUrl) {
    const safeLogoUrl = escapeAttr(logoUrl);
    headerHtml = `<div style="padding: 28px 30px; background: #ffffff; border-bottom: 4px solid ${primaryColor}; text-align: left;"><img src="${safeLogoUrl}" alt="${safeName}" style="max-height: 56px; max-width: 260px; height: auto; display: block;" /></div>`;
  } else if (tenantId && brandName !== SYNOZUR_BRAND) {
    // Tenant with no logo: render a branded color band with their name.
    headerHtml = `<div style="padding: 32px 30px; background: ${primaryColor}; color: #ffffff;"><h1 style="margin: 0; font-size: 22px; font-weight: 600; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${safeName}</h1></div>`;
  } else if (baseUrl) {
    // Default Synozur header image.
    headerHtml = `<img src="${baseUrl}/email-header.jpg" alt="${safeName}" style="width: 100%; height: auto; display: block;" />`;
  } else {
    headerHtml = `<div style="padding: 32px 30px; background: ${primaryColor}; color: #ffffff;"><h1 style="margin: 0; font-size: 22px; font-weight: 600;">${safeName}</h1></div>`;
  }

  const footerHtml = `<div style="text-align: center; padding: 30px; background: #f9f9f9; color: #666; font-size: 14px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;"><p style="margin: 0 0 6px;">— The ${safeName} Team</p><p style="margin: 0;">© ${new Date().getFullYear()} ${safeName}</p></div>`;

  return { primaryColor, logoUrl, brandName, headerHtml, footerHtml };
}
