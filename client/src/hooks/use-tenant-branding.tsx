import { useEffect } from "react";
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
    const root = document.documentElement;

    // Track the variables we set so we can clear only ours on cleanup.
    const setVars: string[] = [];

    if (tenant?.primaryColor) {
      const hsl = hexToHsl(tenant.primaryColor);
      if (hsl) {
        root.style.setProperty("--primary", hsl);
        setVars.push("--primary");
      }
    }

    if (tenant?.accentColor) {
      const hsl = hexToHsl(tenant.accentColor);
      if (hsl) {
        root.style.setProperty("--accent", hsl);
        setVars.push("--accent");
      }
    }

    // Favicon — replace existing icon links with the tenant's favicon.
    let faviconLink: HTMLLinkElement | null = null;
    let originalFavicon: string | null = null;
    if (tenant?.faviconUrl) {
      faviconLink = document.querySelector('link[rel="icon"]');
      if (faviconLink) {
        originalFavicon = faviconLink.href;
        faviconLink.href = tenant.faviconUrl;
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
  }, [tenant?.primaryColor, tenant?.accentColor, tenant?.faviconUrl]);

  return { tenant: tenant ?? null, isLoading };
}
