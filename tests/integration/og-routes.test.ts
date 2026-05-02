import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Track what the mocked db returns from the routes' single-model lookup.
const dbMock = {
  modelBySlug: null as any,
};

vi.mock('../../server/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (dbMock.modelBySlug ? [dbMock.modelBySlug] : []),
        }),
      }),
    }),
  },
}));

describe('GET /api/og/:modelSlug', () => {
  beforeEach(() => {
    dbMock.modelBySlug = null;
  });

  it('renders an HTML share page with OpenGraph metadata when the model exists', async () => {
    dbMock.modelBySlug = {
      id: 'model-1',
      slug: 'ai-readiness',
      name: 'AI Readiness',
      description: 'Assess your AI readiness across the org',
    };

    const { buildTestApp } = await import('./helpers/app');
    const { registerOgRoutes } = await import('../../server/routes/og-routes');

    const app = buildTestApp();
    registerOgRoutes(app);

    const res = await request(app).get('/api/og/ai-readiness');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<meta property="og:title"');
    expect(res.text).toContain('AI Readiness');
    expect(res.text).toContain('window.location.replace');
  });

  it('escapes user-controlled HTML in the model description', async () => {
    dbMock.modelBySlug = {
      id: 'm',
      slug: 'xss-test',
      name: 'XSS <Test>',
      description: '<script>alert(1)</script>',
    };

    const { buildTestApp } = await import('./helpers/app');
    const { registerOgRoutes } = await import('../../server/routes/og-routes');
    const app = buildTestApp();
    registerOgRoutes(app);

    const res = await request(app).get('/api/og/xss-test');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;');
  });

  it('redirects to the homepage when the model is unknown', async () => {
    dbMock.modelBySlug = null;

    const { buildTestApp } = await import('./helpers/app');
    const { registerOgRoutes } = await import('../../server/routes/og-routes');
    const app = buildTestApp();
    registerOgRoutes(app);

    const res = await request(app).get('/api/og/does-not-exist');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});
