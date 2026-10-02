import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";

export function useRequiredTraining() {
  const { user } = useAuth();
  const query = useQuery<{ hasRequiredTraining: boolean }>({
    queryKey: ["/api/me/required-training-availability", user?.id, user?.tenantId],
    queryFn: () => apiRequest("/api/me/required-training-availability", "GET"),
    enabled: Boolean(user?.tenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  return {
    ...query,
    hasRequiredTraining: Boolean(user?.tenantId && query.data?.hasRequiredTraining),
  };
}