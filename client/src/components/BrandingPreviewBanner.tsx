import { useLocation } from "wouter";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBrandingPreview } from "@/hooks/use-tenant-branding";
import { clearBrandingPreview } from "@/lib/branding-preview";

export function BrandingPreviewBanner() {
  const preview = useBrandingPreview();
  const [location, setLocation] = useLocation();

  if (!preview) return null;

  const onAdminBranding = location.startsWith("/admin");

  const goToBranding = () => {
    setLocation("/admin");
    if (typeof window !== "undefined") {
      if (window.location.hash !== "#branding") {
        window.location.hash = "branding";
      }
    }
  };

  return (
    <div
      className="sticky top-0 z-[100] w-full border-b bg-primary text-primary-foreground"
      data-testid="banner-branding-preview"
      role="status"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4" />
          <span className="font-medium">
            Branding preview active — only visible to you. Navigate the app to verify, then return to Branding settings to save.
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!onAdminBranding && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goToBranding}
              data-testid="button-go-to-branding"
              className="bg-background/10 border-primary-foreground/30 text-primary-foreground backdrop-blur-sm"
            >
              Go to Branding
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => clearBrandingPreview()}
            data-testid="button-exit-preview-banner"
            className="bg-background/10 border-primary-foreground/30 text-primary-foreground backdrop-blur-sm"
          >
            <X className="h-4 w-4 mr-1" /> Exit preview
          </Button>
        </div>
      </div>
    </div>
  );
}
