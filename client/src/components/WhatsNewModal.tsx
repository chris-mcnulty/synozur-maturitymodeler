import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Shield, Zap, Users, Settings, Brain, Star } from "lucide-react";

const ICON_MAP: Record<string, any> = {
  sparkles: Sparkles,
  shield: Shield,
  zap: Zap,
  users: Users,
  settings: Settings,
  brain: Brain,
  star: Star,
};

interface WhatsNewData {
  showModal: boolean;
  version: string;
  summary: string;
  highlights: Array<{ icon: string; title: string; description: string }>;
}

export function WhatsNewModal() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data } = useQuery<WhatsNewData>({
    queryKey: ["/api/changelog/whats-new"],
    enabled: !!user,
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/changelog/dismiss", "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/changelog/whats-new"] });
    },
  });

  if (!data?.showModal) return null;

  const handleDismiss = () => {
    dismissMutation.mutate();
  };

  const handleViewChangelog = () => {
    dismissMutation.mutate();
    setLocation("/changelog");
  };

  return (
    <Dialog open={data.showModal} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent className="sm:max-w-lg" data-testid="modal-whats-new">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-whats-new-title">
            <Sparkles className="h-5 w-5 text-primary" />
            What's New in v{data.version}
          </DialogTitle>
        </DialogHeader>

        {data.summary && (
          <p className="text-sm text-muted-foreground" data-testid="text-whats-new-summary">
            {data.summary}
          </p>
        )}

        {data.highlights && data.highlights.length > 0 && (
          <div className="space-y-3 my-2">
            {data.highlights.map((h, i) => {
              const IconComponent = ICON_MAP[h.icon] || Sparkles;
              return (
                <div key={i} className="flex items-start gap-3" data-testid={`highlight-${i}`}>
                  <div className="mt-0.5 p-1.5 rounded-md bg-primary/10">
                    <IconComponent className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{h.title}</p>
                    <p className="text-xs text-muted-foreground">{h.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleViewChangelog} data-testid="button-view-changelog">
            View Full Changelog
          </Button>
          <Button onClick={handleDismiss} data-testid="button-dismiss-whats-new">
            Got It
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
