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
  getOrCreateEnrollment: vi.fn(async () => ({ id: 'enrollment-1', courseId: 'c1', userId: 'u' })),
  getCourseFull: vi.fn(async () => ({
    modules: [{ lessons: [{ content: { slides: [{ id: 's', blocks: [{ id: 'b', type: 'image_slide', url: '/objects/slides/known.png' }] }] } }] }],
  })),
};

const ttsMock = {
  synthesizeNarration: vi.fn(async () => ({ audioUrl: '/objects/narration/x.mp3', voice: 'en-US-JennyNeural' })),
  getAzureConfig: vi.fn(async () => ({
    key: 'configured',
    region: 'eastus',
    endpoint: 'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1',
    voice: 'en-US-JennyNeural',
  })),
};

const pptxMock = {
  importPptx: vi.fn(async () => ({ slides: [{ id: 's1', blocks: [], narration: { mode: 'none' } }] })),
  reviewPptx: vi.fn(async () => ({
    slides: [
      {
        sourceIndex: 0,
        title: 'Getting Started',
        text: 'Getting Started\nWelcome',
        notes: '',
        previewImageUrl: '/objects/slides/preview/one.png',
        recommendation: 'cover',
        includedDefault: true,
        rationale: 'Opening cover',
        narrationScript: 'Welcome to the course.',
      },
      {
        sourceIndex: 1,
        title: 'Section',
        text: 'Section',
        notes: '',
        previewImageUrl: '/objects/slides/preview/two.png',
        recommendation: 'divider',
        includedDefault: false,
        rationale: 'Section divider',
        narrationScript: 'Next section.',
      },
    ],
    suggestedGroups: [
      { startIndex: 0, suggestedTitle: 'Introduction' },
      { startIndex: 1, suggestedTitle: 'Section' },
    ],
  })),
  buildFaithfulBlocks: vi.fn(({ imageUrl, title }: any) => [
    { id: 'faithful', type: 'image_slide', url: imageUrl, alt: title },
  ]),
  buildEnhancedBlocks: vi.fn(({ title }: any) => [
    { id: 'enhanced', type: 'heading', level: 2, text: title },
  ]),
};

const courseIEMock = {
  exportCourse: vi.fn(),
  validateCourseExportDoc: vi.fn(),
  importCourse: vi.fn(async (doc: any) => ({
    course: { id: 'created-course', ...doc.course, status: 'draft', visibility: 'private' },
    moduleCount: doc.course.modules.length,
    lessonCount: doc.course.modules.reduce((sum: number, module: any) => sum + module.lessons.length, 0),
    tagCount: 0,
    restoredAssetCount: 0,
  })),
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
vi.mock('../../server/services/course-import-export', () => courseIEMock);
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
    it('reports Azure as the only configured narration provider', async () => {
      const app = await buildApp();
      const res = await request(app).get('/api/courses/tts/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        configured: true,
        provider: 'azure',
        requiredProvider: 'azure',
        openAiFallbackSupported: false,
      });
    });

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

  describe('POST /api/courses/:id/enroll', () => {
    it('allows a course manager to enroll for a draft preview', async () => {
      const originalStatus = course.status;
      course.status = 'draft';
      const app = await buildApp();
      const res = await request(app).post('/api/courses/c1/enroll');
      course.status = originalStatus;

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('enrollment-1');
      expect(courseSvcMock.getOrCreateEnrollment).toHaveBeenCalledOnce();
    });

    it('still blocks non-managers from enrolling in drafts', async () => {
      const originalStatus = course.status;
      course.status = 'draft';
      courseSvcMock.userCanManageCourse.mockReturnValueOnce(false);
      const app = await buildApp('user');
      const res = await request(app).post('/api/courses/c1/enroll');
      course.status = originalStatus;

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/not available/i);
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

  describe('course-level PowerPoint review and commit', () => {
    it('reviews every source slide and keeps cleanup recommendations reversible', async () => {
      const app = await buildApp();
      const pk = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
      const res = await request(app)
        .post('/api/courses/pptx/review')
        .set('Content-Type', 'application/octet-stream')
        .send(pk);

      expect(res.status).toBe(200);
      expect(res.body.review.slides).toHaveLength(2);
      expect(res.body.review.slides[1]).toMatchObject({
        classification: 'divider',
        include: false,
      });
      expect(res.body.review.groups).toHaveLength(2);
      expect(pptxMock.reviewPptx).toHaveBeenCalledOnce();
    });

    it('creates a private draft from author overrides using enhanced blocks only', async () => {
      const app = await buildApp();
      const res = await request(app)
        .post('/api/courses/pptx/commit')
        .send({
          title: 'Imported course',
          slug: 'imported-course',
          summary: 'Summary',
          description: 'Description',
          estimatedMinutes: 20,
          treatment: 'enhanced',
          slides: [
            {
              id: 'source-1',
              sourceIndex: 0,
              index: 1,
              title: 'Welcome',
              text: 'Welcome\nUseful body',
              previewImageUrl: '/objects/slides/preview/one.png',
              narrationScript: 'A useful transcript.',
              include: true,
              groupId: 'group-1',
            },
            {
              id: 'source-2',
              sourceIndex: 1,
              index: 2,
              title: 'Divider',
              text: 'Divider',
              previewImageUrl: '/objects/slides/preview/two.png',
              narrationScript: 'Next section.',
              include: false,
              groupId: 'group-1',
            },
          ],
          groups: [{
            id: 'group-1',
            name: 'Introduction',
            moduleTitle: 'Introduction module',
            lessonTitle: 'Welcome lesson',
            slides: [{ id: 'source-1' }, { id: 'source-2' }],
          }],
        });

      expect(res.status).toBe(201);
      expect(res.body.course).toMatchObject({ id: 'created-course', status: 'draft', visibility: 'private' });
      const doc = courseIEMock.importCourse.mock.calls[0][0];
      expect(doc.course.modules[0].title).toBe('Introduction module');
      expect(doc.course.modules[0].lessons[0].title).toBe('Welcome lesson');
      expect(doc.course.modules[0].lessons[0].content.slides).toHaveLength(1);
      expect(doc.course.modules[0].lessons[0].content.slides[0].blocks).toEqual([
        expect.objectContaining({ type: 'heading' }),
      ]);
      expect(pptxMock.buildFaithfulBlocks).not.toHaveBeenCalled();
    });

    it('rejects commit plans that exclude every source slide', async () => {
      const app = await buildApp();
      const res = await request(app)
        .post('/api/courses/pptx/commit')
        .send({
          title: 'Empty course',
          slug: 'empty-course',
          treatment: 'faithful',
          slides: [{
            id: 'source-1',
            index: 1,
            title: 'Only slide',
            text: '',
            previewImageUrl: '/objects/slides/preview/one.png',
            narrationScript: '',
            include: false,
            groupId: 'group-1',
          }],
          groups: [{ id: 'group-1', name: 'Empty', slides: [{ id: 'source-1' }] }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/include at least one slide/i);
    });

    it('does not let a faithful import publish a preview the author cannot access', async () => {
      objectAclAllows = false;
      const app = await buildApp();
      const res = await request(app)
        .post('/api/courses/pptx/commit')
        .send({
          title: 'Faithful course',
          slug: 'faithful-course',
          treatment: 'faithful',
          slides: [{
            id: 'source-1',
            index: 1,
            title: 'Only slide',
            text: 'Content',
            previewImageUrl: '/objects/slides/preview/one.png',
            narrationScript: 'Content.',
            include: true,
            groupId: 'group-1',
          }],
          groups: [{ id: 'group-1', name: 'Introduction', slides: [{ id: 'source-1' }] }],
        });
      expect(res.status).toBe(404);
      expect(courseIEMock.importCourse).not.toHaveBeenCalled();
      objectAclAllows = true;
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
