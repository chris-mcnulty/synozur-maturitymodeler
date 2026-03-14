import { ConfidentialClientApplication } from '@azure/msal-node';

let msalInstance: ConfidentialClientApplication | null = null;

function getMsalInstance(): ConfidentialClientApplication {
  if (msalInstance) return msalInstance;

  const tenantId = process.env.PLANNER_TENANT_ID;
  const clientId = process.env.PLANNER_CLIENT_ID;
  const clientSecret = process.env.PLANNER_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Planner credentials not configured: PLANNER_TENANT_ID, PLANNER_CLIENT_ID, PLANNER_CLIENT_SECRET required');
  }

  msalInstance = new ConfidentialClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
  });

  return msalInstance;
}

async function getAccessToken(): Promise<string> {
  const msal = getMsalInstance();
  const result = await msal.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });

  if (!result?.accessToken) {
    throw new Error('Failed to acquire Graph API access token');
  }

  return result.accessToken;
}

export async function graphFetch(url: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();

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

export function isPlannerConfigured(): boolean {
  return !!(process.env.PLANNER_TENANT_ID && process.env.PLANNER_CLIENT_ID && process.env.PLANNER_CLIENT_SECRET);
}
