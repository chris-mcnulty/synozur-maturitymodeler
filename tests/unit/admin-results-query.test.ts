import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { adminResultsQueryOptions, type AdminResultsFilters } from '../../client/src/lib/admin-results-query';

const base: AdminResultsFilters = {
  startDate: '', endDate: '', status: 'completed',
  modelId: 'all', isProxy: 'all', tagId: 'all',
};

afterEach(() => vi.unstubAllGlobals());

describe('admin results filter queries', () => {
  it('sends model and date filters together and omits All Models', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
    await adminResultsQueryOptions({
      ...base, modelId: 'model-a', startDate: '2026-10-01', endDate: '2026-10-04',
    }).queryFn();
    const url = new URL(fetchMock.mock.calls[0][0], 'https://example.test');
    expect(url.searchParams.get('modelId')).toBe('model-a');
    expect(url.searchParams.get('startDate')).toBe('2026-10-01');
    expect(url.searchParams.get('endDate')).toBe('2026-10-04');
    await adminResultsQueryOptions(base).queryFn();
    expect(fetchMock.mock.calls[1][0]).not.toContain('modelId');
  });

  it('refreshes an earlier empty model when switching back, despite global infinite freshness', async () => {
    let modelResults: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => modelResults,
    })));
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    const model = adminResultsQueryOptions({ ...base, modelId: 'model-a' });
    const observer = new QueryObserver(client, model);
    const unsubscribe = observer.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
      expect(observer.getCurrentResult().data).toEqual([]);
      observer.setOptions(adminResultsQueryOptions(base));
      await vi.waitFor(() => expect(observer.getCurrentResult().isFetching).toBe(false));
      modelResults = [{ assessmentId: 'new-result', modelId: 'model-a' }];
      observer.setOptions(model);
      await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual(modelResults));
    } finally {
      unsubscribe();
      client.clear();
    }
  });

  it('does not display the previous model rows while a different model is loading', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('modelId=model-b')) return new Promise(() => {});
      return { ok: true, json: async () => [{ modelId: 'model-a' }] };
    }));
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    const observer = new QueryObserver(client, adminResultsQueryOptions({ ...base, modelId: 'model-a' }));
    const unsubscribe = observer.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
      observer.setOptions(adminResultsQueryOptions({ ...base, modelId: 'model-b' }));
      expect(observer.getCurrentResult().data).toBeUndefined();
      expect(observer.getCurrentResult().isPending).toBe(true);
    } finally {
      unsubscribe();
      client.clear();
    }
  });
});