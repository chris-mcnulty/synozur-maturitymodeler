import { ConfidentialClientApplication } from '@azure/msal-node';

const msalCache = new Map<string, { instance: ConfidentialClientApplication; secretHash: string }>();

function hashSecret(secret: string): string {
  return secret.slice(0, 4) + ':' + secret.length;
}

function getMsalInstance(azureTenantId: string): ConfidentialClientApplication {
  const clientId = process.env.AZURE_CLIENT_ID!;
  const clientSecret = process.env.AZURE_CLIENT_SECRET!;

  const cacheKey = `${azureTenantId}:${clientId}`;
  const currentHash = hashSecret(clientSecret);
  const cached = msalCache.get(cacheKey);
  if (cached && cached.secretHash === currentHash) return cached.instance;

  const instance = new ConfidentialClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${azureTenantId}`,
      clientSecret,
    },
  });

  msalCache.set(cacheKey, { instance, secretHash: currentHash });
  return instance;
}

async function getAccessToken(azureTenantId: string): Promise<string> {
  const msal = getMsalInstance(azureTenantId);
  const result = await msal.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });

  if (!result?.accessToken) {
    throw new Error('Failed to acquire Graph API access token');
  }

  return result.accessToken;
}

export async function graphFetch(url: string, azureTenantId: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken(azureTenantId);

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

export function isSsoAppConfigured(): boolean {
  return !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
}
