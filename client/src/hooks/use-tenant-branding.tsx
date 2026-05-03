import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Tenant } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

/**
 * Convert a hex color string (#RRGGBB or #RGB) to "H S% L%" form
 * (the format used by our Tailwind CSS variables in index.css).
 * Returns null for invalid input.
 */
export function hexToHsl(hex: string): string | null {
  if (!hex || !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex)) return null;
  let r: number, g: number, b: number;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break;
      case gN: h = (bN - rN) / d + 2; break;
      case bN: h = (rN - gN) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Public branding fields exposed by /api/branding/by-domain/:domain.
 * Intentionally a subset of the Tenant type — only safe-to-show fields.
 */
export type PublicTenantBranding = {
  id: string;
  name: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
};

type BrandingInput = Pick<
  Tenant,
  "primaryColor" | "accentColor" | "faviconUrl"
> | null | undefined;

/**
 * Apply tenant branding (CSS variables, favicon) to the document.
 * Returns a cleanup function that restores defaults.
 */
function applyBranding(branding: BrandingInput): () => void {
  const root = document.documentElement;
  const setVars: string[] = [];

  if (branding?.primaryColor) {
    const hsl = hexToHsl(branding.primaryColor);
    if (hsl) {
      root.style.setProperty("--primary", hsl);
      setVars.push("--primary");
    }
  }

  if (branding?.accentColor) {
    const hsl = hexToHsl(branding.accentColor);
    if (hsl) {
      root.style.setProperty("--accent", hsl);
      setVars.push("--accent");
    }
  }

  let faviconLink: HTMLLinkElement | null = null;
  let originalFavicon: string | null = null;
  if (branding?.faviconUrl) {
    faviconLink = document.querySelector('link[rel="icon"]');
    if (faviconLink) {
      originalFavicon = faviconLink.href;
      faviconLink.href = branding.faviconUrl;
    }
  }

  return () => {
    for (const v of setVars) {
      root.style.removeProperty(v);
    }
    if (faviconLink && originalFavicon !== null) {
      faviconLink.href = originalFavicon;
    }
  };
}

/**
 * Apply tenant branding (CSS variables, favicon) to the document at runtime.
 * Falls back to Synozur defaults defined in index.css / index.html when no
 * tenant context exists.
 */
export function useTenantBranding(): {
  tenant: Tenant | null | undefined;
  isLoading: boolean;
} {
  const { user } = useAuth();

  const { data: tenant, isLoading } = useQuery<Tenant | null>({
    queryKey: ["/api/user/tenant"],
    enabled: !!user,
  });

  useEffect(() => {
    return applyBranding(tenant ?? null);
  }, [tenant?.primaryColor, tenant?.accentColor, tenant?.faviconUrl]);

  return { tenant: tenant ?? null, isLoading };
}

/** Extract the lowercase domain portion of an email address, or null. */
export function extractEmailDomain(email: string): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 0 || at === trimmed.length - 1) return null;
  const domain = trimmed.slice(at + 1);
  // Must contain a dot and only valid domain chars.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return null;
  return domain;
}

/**
 * Look up tenant branding by email domain and apply it live to the document.
 * Used on the login page so users see their tenant's branding as they type
 * their email — before authenticating. Falls back to Synozur defaults when
 * the domain doesn't match any tenant.
 */
export function useDomainBranding(email: string): {
  branding: PublicTenantBranding | null;
  isLoading: boolean;
} {
  const domain = useMemo(() => extractEmailDomain(email), [email]);
  const [debouncedDomain, setDebouncedDomain] = useState<string | null>(domain);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedDomain(domain), 300);
    return () => clearTimeout(t);
  }, [domain]);

  const { data, isLoading } = useQuery<PublicTenantBranding | null>({
    queryKey: ["/api/branding/by-domain", debouncedDomain],
    queryFn: async () => {
      if (!debouncedDomain) return null;
      const res = await fetch(
        `/api/branding/by-domain/${encodeURIComponent(debouncedDomain)}`,
        { credentials: "omit" },
      );
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw new Error("Failed to fetch branding");
      return (await res.json()) as PublicTenantBranding;
    },
    enabled: !!debouncedDomain,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    return applyBranding(data ?? null);
  }, [data?.primaryColor, data?.accentColor, data?.faviconUrl]);

  return { branding: data ?? null, isLoading };
}
