import { db } from "./db";
import { settings } from "@shared/schema";
import { eq } from "drizzle-orm";

// Feature flag keys
export const FEATURE_FLAGS = {
  MULTI_TENANT: "feature_multi_tenant",
} as const;

// Cache for feature flags to avoid DB hits on every request
const featureFlagCache = new Map<string, boolean>();
let cacheExpiry = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Check if a feature flag is enabled
 */
export async function isFeatureEnabled(flag: string): Promise<boolean> {
  const now = Date.now();
  
  // Return from cache if not expired
  if (now < cacheExpiry && featureFlagCache.has(flag)) {
    return featureFlagCache.get(flag)!;
  }
  
  // Refresh cache
  const setting = await db
    .select()
    .from(settings)
    .where(eq(settings.key, flag))
    .limit(1);
  
  const enabled = setting.length > 0 && setting[0].value === true;
  
  // Update cache
  featureFlagCache.set(flag, enabled);
  cacheExpiry = now + CACHE_TTL;
  
  return enabled;
}

/**
 * Set a feature flag value
 */
export async function setFeatureFlag(flag: string, enabled: boolean): Promise<void> {
  const existing = await db
    .select()
    .from(settings)
    .where(eq(settings.key, flag))
    .limit(1);
  
  if (existing.length > 0) {
    await db
      .update(settings)
      .set({ value: enabled, updatedAt: new Date() })
      .where(eq(settings.key, flag));
  } else {
    await db
      .insert(settings)
      .values({ key: flag, value: enabled });
  }
  
  // Invalidate cache
  featureFlagCache.delete(flag);
}

/**
 * Express middleware to check feature flag
 */
export function requireFeature(flag: string) {
  return async (req: any, res: any, next: any) => {
    const enabled = await isFeatureEnabled(flag);
    
    if (!enabled) {
      return res.status(403).json({ 
        error: "Feature not enabled",
        message: `The ${flag} feature is not currently enabled` 
      });
    }
    
    next();
  };
}