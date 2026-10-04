export interface AdminResultsFilters {
  startDate: string;
  endDate: string;
  status: string;
  modelId: string;
  isProxy: string;
  tagId: string;
}

export function adminResultsQueryOptions(filters: AdminResultsFilters) {
  const { startDate, endDate, status, modelId, isProxy, tagId } = filters;
  return {
    queryKey: ['/api/admin/results', startDate, endDate, status, modelId, isProxy, tagId],
    // Results change as learners finish. Never treat an earlier empty model
    // query as permanently fresh or show a different filter's previous rows.
    staleTime: 0,
    placeholderData: undefined,
    queryFn: async (): Promise<any[]> => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (status) params.set('status', status);
      if (modelId && modelId !== 'all') params.set('modelId', modelId);
      if (isProxy && isProxy !== 'all') params.set('isProxy', isProxy);
      if (tagId && tagId !== 'all') params.set('tagId', tagId);
      const response = await fetch(`/api/admin/results?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch results');
      return response.json();
    },
  };
}