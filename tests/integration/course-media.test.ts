import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ----- Mocks for the service layer the course routes depend on -----
const course = { id: 'c1', title: 'C', status: 'published', visibility: 'public', ownerTenantId: null };

const courseSvcMock = {
  getCourseById: vi.fn(async () => course),
  userCanManageCourse: vi.fn(() => true),
  userCanViewCourse: vi.fn(async () => true),
  getCourseForModule: vi.fn(async () => course),
  createLesson: vi.fn(async (data: any) => ({ id: 'l1', ...data })),
  getCourseFull: vi.fn(async () => ({
    modules: [{ lessons: [{ content: { slides: [{ id: 's', blocks: [{ id: 'b', type: 'image_slide', url: '/objects/slides/known.png' }] }] } }] }],
  })),
};

const ttsMock = {
  synthesizeNarration: vi.fn(async () => ({ audioUrl: '/objects/narration/x.mp3', voice: 'en-US-JennyNeural' })),
  isTtsConfigured: vi.fn(() => true),
};

const pptxMock = {
  importPptx: vi.fn(async () => ({ slides: [{ id: 's1', blocks: [], narration: { mode: 'none' } }] })),
};

const objectStorageMock = {
  ObjectStorageService: class {
    normalizeObjectEntityPath(url: string) {
      // Mimic stripping the GCS host + private dir down to /objects/<entityId>.
      return url.replace('https://storage.googleapis.com/bucket/private', '/objects');
    }
    async trySetObjectEntityAclPolicy(url: string) {
      return this.normalizeObjectEntityPath(url);
    }
    async getObjectEntityFile(p: string) { return { path: p }; }
    async downloadObject(_file: any, res: any) { res.status(200).send('BINARY'); }
    async canAccessObjectEntity() { return objectAclAllows; }
  },
  ObjectNotFoundError: class extends Error {},
};
// Toggled per-test to simulate the object's own ACL granting/denying the user.
let objectAclAllows = true;

vi.mock('../../server/services/course-service', () => courseSvcMock);
vi.mock('../../server/services/tts-service', () => ttsMock);
vi.mock('../../server/services/pptx-import', () => pptxMock);
vi.mock('../../server/objectStorage', () => objectStorageMock);
vi.mock('../../server/db', () => ({ db: {}, pool: {} }));
vi.mock('../../server/storage', () => ({ storage: {} }));
vi.mock('../../server/permissions', () => ({
  checkIsGlobalAdmin: (u: any) => u?.role === 'global_admin',
  getAccessibleTenantIds: () => null,
  canManageModels: () => true,
}));

async function buildApp(role: string | null = 'global_admin') {
  const { buildTestApp } = await import('./helpers/app');
  const { registerCourseRoutes } = await import('../../server/routes/course-routes');
  const app = buildTestApp({
    user: role ? { id: 'u', username: 'a', password: 'x', role, tenantId: null } : null,
  });
  registerCourseRoutes(app);
  return app;
}

describe('course media + narration + import routes', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /api/objects/finalize', () => {
    it('rejects a path outside the uploads/ prefix', async () => {
      const app = await buildApp();
      const res = await request(app)
        .post('/api/objects/finalize')
        .send({ url: 'https://storage.googleapis.com/bucket/private/certificates/secret.pdf' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/freshly uploaded/i);
    });

    it('finalizes a freshly-uploaded object', async () => {
      const app = await buildApp();
      const res = await request(app)
        .post('/api/objects/finalize')
        .send({ url: 'https://storage.googleapis.com/bucket/private/uploads/abc' });
      expect(res.status).toBe(200);
      expect(res.body.url).toBe('/objects/uploads/abc');
    });

    it('requires admin/modeler', async () => {
      const app = await buildApp('user');
      const res = await request(app).post('/api/objects/finalize').send({ url: 'x' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/courses/:id/narration/tts', () => {
    it('400s without text', async () => {
      const app = await buildApp();
      const res = await request(app).post('/api/courses/c1/narration/tts').send({});
      expect(res.status).toBe(400);
    });

    it('returns the synthesized audio url', async () => {
      const app = await buildApp();
      const res = await request(app).post('/api/courses/c1/narration/tts').send({ text: 'Hello' });
      expect(res.status).toBe(200);
      expect(res.body.audioUrl).toBe('/objects/narration/x.mp3');
      expect(ttsMock.synthesizeNarration).toHaveBeenCalledOnce();
    });
  });

  describe('POST /api/courses/:id/slides/pptx-import', () => {
    it('rejects a body that is not a ZIP/OOXML container', async () => {
      const app = await buildApp();
      const res = await request(app)
        .post('/api/courses/c1/slides/pptx-import')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('not a zip'));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/pptx/i);
    });

    it('imports slides from a ZIP-signed body', async () => {
      const app = await buildApp();
      const pk = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
      const res = await request(app)
        .post('/api/courses/c1/slides/pptx-import')
        .set('Content-Type', 'application/octet-stream')
        .send(pk);
      expect(res.status).toBe(200);
      expect(res.body.slides).toHaveLength(1);
      expect(pptxMock.importPptx).toHaveBeenCalledOnce();
    });
  });

  describe('GET /api/courses/:id/media (course-aware proxy)', () => {
    beforeEach(() => { objectAclAllows = true; });

    it('400s on a path outside managed prefixes', async () => {
      const app = await buildApp();
      const res = await request(app).get('/api/courses/c1/media').query({ path: '/objects/certificates/secret.pdf' });
      expect(res.status).toBe(400);
    });

    it('lets a manager preview unsaved media the object ACL grants them', async () => {
      courseSvcMock.userCanManageCourse.mockReturnValueOnce(true);
      objectAclAllows = true; // uploader owns the freshly-uploaded object
      const app = await buildApp();
      const res = await request(app).get('/api/courses/c1/media').query({ path: '/objects/narration/unsaved.mp3' });
      expect(res.status).toBe(200);
    });

    it('blocks a manager from streaming an unreferenced object they cannot access (cross-course/tenant)', async () => {
      courseSvcMock.userCanManageCourse.mockReturnValueOnce(true);
      objectAclAllows = false; // another course/tenant's private object
      const app = await buildApp();
      const res = await request(app).get('/api/courses/c1/media').query({ path: '/objects/narration/foreign.mp3' });
      expect(res.status).toBe(404);
    });

    it('lets a viewer fetch an object referenced by the course', async () => {
      courseSvcMock.userCanManageCourse.mockReturnValueOnce(false);
      courseSvcMock.userCanViewCourse.mockResolvedValueOnce(true);
      const app = await buildApp('user');
      const res = await request(app).get('/api/courses/c1/media').query({ path: '/objects/slides/known.png' });
      expect(res.status).toBe(200);
    });

    it('404s when a viewer requests an unreferenced object the ACL also denies', async () => {
      courseSvcMock.userCanManageCourse.mockReturnValueOnce(false);
      courseSvcMock.userCanViewCourse.mockResolvedValueOnce(true);
      objectAclAllows = false;
      const app = await buildApp('user');
      const res = await request(app).get('/api/courses/c1/media').query({ path: '/objects/slides/other.png' });
      expect(res.status).toBe(404);
    });

    it('403s a viewer who cannot view the course', async () => {
      courseSvcMock.userCanManageCourse.mockReturnValueOnce(false);
      courseSvcMock.userCanViewCourse.mockResolvedValueOnce(false);
      const app = await buildApp('user');
      const res = await request(app).get('/api/courses/c1/media').query({ path: '/objects/slides/known.png' });
      expect(res.status).toBe(403);
    });
  });

  describe('slide content validation', () => {
    it('rejects a slides lesson with a malformed content payload', async () => {
      const app = await buildApp();
      const res = await request(app)
        .post('/api/course-modules/m1/lessons')
        .send({ title: 'Bad', type: 'slides', content: { slides: [{ blocks: 'not-an-array' }] } });
      expect(res.status).toBe(400);
    });

    it('accepts a well-formed slides lesson', async () => {
      const app = await buildApp();
      const res = await request(app)
        .post('/api/course-modules/m1/lessons')
        .send({
          title: 'Good',
          type: 'slides',
          content: { slides: [{ id: 's1', blocks: [{ id: 'b1', type: 'heading', level: 2, text: 'Hi' }] }] },
        });
      expect(res.status).toBe(200);
      expect(courseSvcMock.createLesson).toHaveBeenCalledOnce();
    });
  });
});
