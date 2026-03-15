import { ConfidentialClientApplication } from '@azure/msal-node';

export interface PlannerCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

const msalCache = new Map<string, { instance: ConfidentialClientApplication; secretHash: string }>();

function hashSecret(secret: string): string {
  return secret.slice(0, 4) + ':' + secret.length;
}

function getMsalInstance(creds: PlannerCredentials): ConfidentialClientApplication {
  const cacheKey = `${creds.tenantId}:${creds.clientId}`;
  const currentHash = hashSecret(creds.clientSecret);
  const cached = msalCache.get(cacheKey);
  if (cached && cached.secretHash === currentHash) return cached.instance;

  const instance = new ConfidentialClientApplication({
    auth: {
      clientId: creds.clientId,
      authority: `https://login.microsoftonline.com/${creds.tenantId}`,
      clientSecret: creds.clientSecret,
    },
  });

  msalCache.set(cacheKey, { instance, secretHash: currentHash });
  return instance;
}

async function getAccessToken(creds: PlannerCredentials): Promise<string> {
  const msal = getMsalInstance(creds);
  const result = await msal.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });

  if (!result?.accessToken) {
    throw new Error('Failed to acquire Graph API access token');
  }

  return result.accessToken;
}

export async function graphFetch(url: string, creds: PlannerCredentials, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken(creds);

  const response = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph API error ${response.status}: ${errorText}`);
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json();
  }
  return null;
}

export function getGlobalCredentials(): PlannerCredentials | null {
  const tenantId = process.env.PLANNER_TENANT_ID;
  const clientId = process.env.PLANNER_CLIENT_ID;
  const clientSecret = process.env.PLANNER_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) return null;

  return { tenantId, clientId, clientSecret };
}

export function isPlannerConfigured(): boolean {
  return !!getGlobalCredentials();
}
