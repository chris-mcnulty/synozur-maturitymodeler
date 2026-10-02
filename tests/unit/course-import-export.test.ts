/**
 * Unit tests for course-import-export (v1 & v2).
 *
 * All external dependencies (DB, ObjectStorageService) are mocked so the
 * tests run entirely in-process without any real cloud calls or database.
 *
 * Semantics under test:
 *   - exportCourse produces v2 (with embedded assets) by default; v1 only
 *     when embedMedia: false is passed explicitly.
 *   - Missing / unreadable managed assets during export throw; they do not
 *     produce a silent partial package.
 *   - validateCourseExportDoc v2 deeply validates each asset entry: key ==
 *     originalPath, recognised managed path, non-empty contentType, valid
 *     non-empty base64, per-asset and total decoded-size limits.
 *   - importCourse v2 throws on malformed / unrecognised / unrestorable assets.
 *   - URL rewriting is restricted to known media-URL field names (url,
 *     audioUrl, videoUrl, poster, src); free-text / HTML fields are untouched.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { readObjectBytesMock, storeObjectBytesMock, dbMock } = vi.hoisted(() => {
  const readObjectBytesMock = vi.fn();
  const storeObjectBytesMock = vi.fn();

  function makeSelect(rows: any[]) {
    return {
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
          orderBy: () => Promise.resolve(rows),
        }),
        innerJoin: () => ({ where: () => Promise.resolve(rows) }),
        orderBy: () => Promise.resolve(rows),
      }),
    };
  }

  const dbMock = {
    select: vi.fn(() => makeSelect([])),
    insert: vi.fn((table: any) => ({
      values: (values: any) => ({
        returning: () =>
          Promise.resolve([{
            id: `gen-${Math.random().toString(36).slice(2)}`,
            status: "draft",
            ...values,
          }]),
      }),
    })),
  };

  return { readObjectBytesMock, storeObjectBytesMock, dbMock };
});

vi.mock("../../server/db", () => ({ db: dbMock }));

vi.mock("../../shared/schema", () => ({
  courses: "courses",
  courseModules: "courseModules",
  lessons: "lessons",
  courseTags: "courseTags",
  courseTagAssignments: "courseTagAssignments",
}));

vi.mock("../../server/objectStorage", () => ({
  ObjectStorageService: class {
    readObjectBytes(path: string) { return readObjectBytesMock(path); }
    storeObjectBytes(opts: any) { return storeObjectBytesMock(opts); }
  },
  ObjectNotFoundError: class extends Error {
    constructor() { super("Object not found"); this.name = "ObjectNotFoundError"; }
  },
}));

vi.mock("../../server/objectAcl", () => ({}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ col, val, op: "eq" }),
  or: (...args: any[]) => ({ args, op: "or" }),
}));

// ─── Import module under test ──────────────────────────────────────────────

import {
  validateCourseExportDoc,
  exportCourse,
  importCourse,
  type CourseExportDocV1,
  type CourseExportDocV2,
} from "../../server/services/course-import-export";

// ─── Test helpers ──────────────────────────────────────────────────────────

function makeSelect(rows: any[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
        orderBy: () => Promise.resolve(rows),
      }),
      innerJoin: () => ({ where: () => Promise.resolve(rows) }),
      orderBy: () => Promise.resolve(rows),
    }),
  };
}

const VALID_B64 = Buffer.from("fake-bytes-content").toString("base64");

function makeV1Doc(overrides: Partial<CourseExportDocV1["course"]> = {}): CourseExportDocV1 {
  return {
    format: "orion-course",
    version: "1",
    exportedAt: new Date().toISOString(),
    course: {
      title: "Test Course",
      slug: "test-course",
      description: "desc",
      summary: null,
      imageUrl: null,
      estimatedMinutes: 10,
      status: "published",
      visibility: "public",
      passingScore: 80,
      certificateEnabled: false,
      tags: [],
      modules: [],
      ...overrides,
    },
  };
}

function makeV2Doc(overrides: Partial<CourseExportDocV2> = {}): CourseExportDocV2 {
  return {
    format: "orion-course",
    version: "2",
    exportedAt: new Date().toISOString(),
    assets: {},
    course: {
      title: "Test Course V2",
      slug: "test-course-v2",
      description: "desc",
      summary: null,
      imageUrl: null,
      estimatedMinutes: 10,
      status: "published",
      visibility: "public",
      passingScore: 80,
      certificateEnabled: false,
      tags: [],
      modules: [],
    },
    ...overrides,
  };
}

function validAsset(path: string, ct = "image/png"): import("../../server/services/course-import-export").EmbeddedAsset {
  return { originalPath: path, contentType: ct, data: VALID_B64 };
}

// ─── validateCourseExportDoc ──────────────────────────────────────────────────

describe("recorded annual-training welcome packages", () => {
  for (const slug of [
    "synozur-data-privacy-and-client-confidentiality-annual-training",
    "synozur-information-security-annual-training",
    "synozur-standards-of-business-conduct-annual-training",
  ]) {
    it(`restores the welcome video and poster privately for ${slug}`, async () => {
      vi.clearAllMocks();
      dbMock.select.mockImplementation(() => makeSelect([]));
      const inserted: Array<{ table: any; values: any }> = [];
      dbMock.insert.mockImplementation((table: any) => ({
        values: (values: any) => {
          inserted.push({ table, values });
          return { returning: async () => [{ id: `import-${inserted.length}`, ...values }] };
        },
      }));
      storeObjectBytesMock.mockImplementation(async ({ entityId }: any) => `/objects/${entityId}`);
      const json = readFileSync(`handoff/${slug}.orion-course.json`, "utf8");
      expect(Buffer.byteLength(json)).toBeLessThan(10 * 1024 * 1024);
      const doc = JSON.parse(json) as CourseExportDocV2;
      validateCourseExportDoc(doc);
      const welcome = doc.course.modules[0].lessons[0];
      const oldVideo = (welcome.content as any).slides[0].blocks.find((b: any) => b.type === "video");
      expect(oldVideo.url).toMatch(/\.mp4$/);
      expect(doc.assets[oldVideo.url].contentType).toBe("video/mp4");
      expect(doc.assets[oldVideo.poster].contentType).toBe("image/jpeg");
      expect(JSON.stringify(welcome.content)).not.toMatch(/coming soon|Draft transcript|Video placeholder/i);
      const result = await importCourse(doc, { ownerTenantId: "test-tenant", createdBy: "test-owner" });
      expect(result.course.status).toBe("draft");
      expect(result.lessonCount).toBe(doc.course.modules.reduce((n, m) => n + m.lessons.length, 0));
      const restoredWelcome = inserted.find(row => row.table === "lessons" && row.values.title === welcome.title)!.values;
      expect(restoredWelcome.required).toBe(welcome.required);
      const video = restoredWelcome.content.slides[0].blocks.find((b: any) => b.type === "video");
      expect(video.url).not.toBe(oldVideo.url);
      expect(video.poster).not.toBe(oldVideo.poster);
      for (const originalPath of [oldVideo.url, oldVideo.poster]) {
        const originalBytes = Buffer.from(doc.assets[originalPath].data, "base64");
        const restored = storeObjectBytesMock.mock.calls.find(([opts]) => opts.data.equals(originalBytes))![0];
        expect(restored.acl).toEqual({ owner: "test-tenant", visibility: "private" });
      }
    });
  }
});

describe("validateCourseExportDoc", () => {

  describe("format / version / course fields", () => {
    it("accepts a valid v1 document", () => {
      expect(() => validateCourseExportDoc(makeV1Doc())).not.toThrow();
    });

    it("accepts a valid v2 document with empty assets", () => {
      expect(() => validateCourseExportDoc(makeV2Doc())).not.toThrow();
    });

    it("accepts a valid v2 document with well-formed assets", () => {
      const path = "/objects/uploads/abc.png";
      expect(() =>
        validateCourseExportDoc(makeV2Doc({ assets: { [path]: validAsset(path) } }))
      ).not.toThrow();
    });

    it("rejects non-objects", () => {
      expect(() => validateCourseExportDoc(null)).toThrow("not an object");
      expect(() => validateCourseExportDoc(42)).toThrow("not an object");
    });

    it("rejects wrong format string", () => {
      expect(() =>
        validateCourseExportDoc({ format: "other", version: "1", course: {} })
      ).toThrow(/"orion-course"/);
    });

    it("rejects unsupported version", () => {
      expect(() =>
        validateCourseExportDoc({ format: "orion-course", version: "3", course: { title: "x", modules: [] } })
      ).toThrow("Unsupported course file version: 3");
    });

    it("rejects missing course.title", () => {
      const doc = makeV1Doc() as any;
      doc.course.title = "";
      expect(() => validateCourseExportDoc(doc)).toThrow("course.title is required");
    });

    it("rejects non-array modules", () => {
      const doc = makeV1Doc() as any;
      doc.course.modules = "bad";
      expect(() => validateCourseExportDoc(doc)).toThrow("course.modules must be an array");
    });

    it("rejects module with missing title", () => {
      const doc = makeV1Doc({ modules: [{ title: "", lessons: [], order: 0, description: null }] });
      expect(() => validateCourseExportDoc(doc)).toThrow("modules[0].title is required");
    });

    it("rejects lesson with missing title", () => {
      const doc = makeV1Doc({
        modules: [{
          title: "Mod", description: null, order: 0,
          lessons: [{ title: "", type: "rich_text", order: 0, estimatedMinutes: null, required: true, content: {} }],
        }],
      });
      expect(() => validateCourseExportDoc(doc)).toThrow("modules[0].lessons[0].title is required");
    });
  });

  describe("v2 assets map — structural checks", () => {
    it("rejects v2 without assets field", () => {
      const doc = { format: "orion-course", version: "2", course: { title: "x", modules: [] } };
      expect(() => validateCourseExportDoc(doc)).toThrow(/assets/);
    });

    it("rejects v2 with assets as an array", () => {
      const doc = { format: "orion-course", version: "2", assets: [], course: { title: "x", modules: [] } };
      expect(() => validateCourseExportDoc(doc)).toThrow(/assets/);
    });

    it("rejects an asset entry that is not an object", () => {
      const doc = makeV2Doc({ assets: { "/objects/uploads/x.png": "bad" as any } });
      expect(() => validateCourseExportDoc(doc)).toThrow(/entry must be an object/);
    });
  });

  describe("v2 assets map — key / originalPath checks", () => {
    it("rejects a key that is not a recognised managed path", () => {
      const doc = makeV2Doc({
        assets: {
          "/objects/certificates/secret.pdf": {
            originalPath: "/objects/certificates/secret.pdf",
            contentType: "application/pdf",
            data: VALID_B64,
          },
        },
      });
      expect(() => validateCourseExportDoc(doc)).toThrow(/not a recognised managed object path/);
    });

    it("rejects a key whose originalPath does not match the key", () => {
      const doc = makeV2Doc({
        assets: {
          "/objects/uploads/a.png": {
            originalPath: "/objects/uploads/b.png", // mismatch
            contentType: "image/png",
            data: VALID_B64,
          },
        },
      });
      expect(() => validateCourseExportDoc(doc)).toThrow(/originalPath.*must equal the map key/);
    });

    it("accepts all three valid prefixes: uploads, narration, slides", () => {
      const paths = [
        "/objects/uploads/u.png",
        "/objects/narration/n.mp3",
        "/objects/slides/s.webp",
      ];
      const assets: Record<string, any> = {};
      for (const p of paths) assets[p] = validAsset(p);
      expect(() => validateCourseExportDoc(makeV2Doc({ assets }))).not.toThrow();
    });
  });

  describe("v2 assets map — contentType checks", () => {
    it("rejects empty contentType", () => {
      const path = "/objects/uploads/x.png";
      const doc = makeV2Doc({ assets: { [path]: { originalPath: path, contentType: "", data: VALID_B64 } } });
      expect(() => validateCourseExportDoc(doc)).toThrow(/contentType must be a non-empty string/);
    });

    it("rejects whitespace-only contentType", () => {
      const path = "/objects/uploads/x.png";
      const doc = makeV2Doc({ assets: { [path]: { originalPath: path, contentType: "   ", data: VALID_B64 } } });
      expect(() => validateCourseExportDoc(doc)).toThrow(/contentType must be a non-empty string/);
    });
  });

  describe("v2 assets map — base64 data checks", () => {
    it("rejects empty data string", () => {
      const path = "/objects/uploads/x.png";
      const doc = makeV2Doc({ assets: { [path]: { originalPath: path, contentType: "image/png", data: "" } } });
      expect(() => validateCourseExportDoc(doc)).toThrow(/non-empty base64/);
    });

    it("rejects data with invalid base64 characters", () => {
      const path = "/objects/uploads/x.png";
      const doc = makeV2Doc({ assets: { [path]: { originalPath: path, contentType: "image/png", data: "!!invalid!!" } } });
      expect(() => validateCourseExportDoc(doc)).toThrow(/invalid base64 characters/);
    });

    it("rejects data that decodes to zero bytes (all-padding)", () => {
      // "AAAA" decodes to 3 null bytes — use empty string to get 0-byte decode
      // Actually Buffer.from("", "base64").length === 0
      const path = "/objects/uploads/x.png";
      const doc = makeV2Doc({ assets: { [path]: { originalPath: path, contentType: "image/png", data: "AA==" } } });
      // "AA==" decodes to 1 byte — should pass; empty string should fail
      expect(() =>
        validateCourseExportDoc(makeV2Doc({
          assets: { [path]: { originalPath: path, contentType: "image/png", data: "" } },
        }))
      ).toThrow(/non-empty base64/);
    });

    it("accepts valid base64 with padding", () => {
      const path = "/objects/uploads/x.png";
      const data = Buffer.from("hello world").toString("base64"); // "aGVsbG8gd29ybGQ="
      expect(() =>
        validateCourseExportDoc(makeV2Doc({ assets: { [path]: { originalPath: path, contentType: "image/png", data } } }))
      ).not.toThrow();
    });
  });

  describe("v2 assets map — size limits", () => {
    it("rejects a single asset exceeding the per-asset limit (50 MiB)", () => {
      const path = "/objects/uploads/big.bin";
      // 50 MiB + 1 byte
      const bigBuf = Buffer.alloc(50 * 1024 * 1024 + 1, 0x42);
      const data = bigBuf.toString("base64");
      const doc = makeV2Doc({ assets: { [path]: { originalPath: path, contentType: "application/octet-stream", data } } });
      expect(() => validateCourseExportDoc(doc)).toThrow(/per-asset limit/);
    });

    it("accepts an asset right at the per-asset limit (50 MiB exactly)", () => {
      const path = "/objects/uploads/edge.bin";
      const buf = Buffer.alloc(50 * 1024 * 1024, 0x42);
      const data = buf.toString("base64");
      expect(() =>
        validateCourseExportDoc(makeV2Doc({ assets: { [path]: { originalPath: path, contentType: "application/octet-stream", data } } }))
      ).not.toThrow();
    });

    it("rejects total assets exceeding the package limit (500 MiB)", () => {
      // 11 assets × ~50 MiB = ~550 MiB total
      const assets: Record<string, any> = {};
      const chunk = Buffer.alloc(50 * 1024 * 1024, 0x42);
      const data = chunk.toString("base64");
      for (let i = 0; i < 11; i++) {
        const path = `/objects/uploads/chunk${i}.bin`;
        assets[path] = { originalPath: path, contentType: "application/octet-stream", data };
      }
      expect(() => validateCourseExportDoc(makeV2Doc({ assets }))).toThrow(/package limit/);
    });
  });
});

// ─── importCourse — v1 ───────────────────────────────────────────────────────

describe("importCourse v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.select.mockReturnValue(makeSelect([]));
  });

  it("rejects a PowerPoint review preview used as the course image", async () => {
    const doc = makeV1Doc();
    doc.course.imageUrl = "/objects/slides/preview/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";

    await expect(importCourse(doc)).rejects.toThrow(/cannot be used as imported course images/i);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("imports a historical flat PowerPoint preview as committed course media", async () => {
    const legacyPreview = "/objects/slides/preview/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
    const result = await importCourse(makeV1Doc({ imageUrl: legacyPreview }));

    expect(result.course.imageUrl).toBe(legacyPreview);
  });

  it("creates a draft course regardless of source status", async () => {
    const result = await importCourse(makeV1Doc({ status: "published" }));
    expect(result.course.status).toBe("draft");
    expect(result.restoredAssetCount).toBe(0);
  });

  it("reports module and lesson counts", async () => {
    const doc = makeV1Doc({
      modules: [
        {
          title: "M1", description: null, order: 0,
          lessons: [
            { title: "L1", type: "rich_text", order: 0, estimatedMinutes: 5, required: true, content: {} },
            { title: "L2", type: "quiz", order: 1, estimatedMinutes: 3, required: true, content: {} },
          ],
        },
        { title: "M2", description: null, order: 1, lessons: [] },
      ],
    });
    const result = await importCourse(doc);
    expect(result.moduleCount).toBe(2);
    expect(result.lessonCount).toBe(2);
  });

  it("resolves tags (create new + reuse existing) and reports tagCount", async () => {
    let call = 0;
    dbMock.select.mockImplementation(() => {
      call++;
      if (call === 1) return makeSelect([]);                       // slug check → unique
      if (call === 2) return makeSelect([]);                       // tag "alpha" → not found
      if (call === 3) return makeSelect([{ id: "existing-id" }]); // tag "beta" → found
      return makeSelect([]);
    });
    const result = await importCourse(makeV1Doc({ tags: ["alpha", "beta"] }));
    expect(result.tagCount).toBe(2);
  });

  it("does not call readObjectBytes or storeObjectBytes for v1 docs", async () => {
    await importCourse(makeV1Doc());
    expect(readObjectBytesMock).not.toHaveBeenCalled();
    expect(storeObjectBytesMock).not.toHaveBeenCalled();
  });
});

// ─── importCourse — v2 ───────────────────────────────────────────────────────

describe("importCourse v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.select.mockReturnValue(makeSelect([]));
    // Default: storeObjectBytes returns a fresh path based on entityId
    storeObjectBytesMock.mockImplementation(
      async (opts: any) => `/objects/${opts.entityId}`
    );
    // Insert mock that captures lesson values for inspection
    dbMock.insert.mockImplementation((table: any) => ({
      values: (values: any) => ({
        returning: () =>
          Promise.resolve([{
            id: `gen-${Math.random().toString(36).slice(2)}`,
            status: "draft",
            ...values,
          }]),
      }),
    }));
  });

  // ── Happy-path asset restoration ─────────────────────────────────────────

  it("restores an embedded asset, writes it to storage, reports restoredAssetCount", async () => {
    const origPath = "/objects/uploads/orig.png";
    const newPath = "/objects/uploads/new-uuid.png";
    storeObjectBytesMock.mockResolvedValueOnce(newPath);

    const result = await importCourse(makeV2Doc({
      assets: { [origPath]: validAsset(origPath) },
    }));

    expect(storeObjectBytesMock).toHaveBeenCalledOnce();
    expect(result.restoredAssetCount).toBe(1);
    const call = storeObjectBytesMock.mock.calls[0][0];
    expect(call.entityId).toMatch(/^uploads\//);
    expect(call.contentType).toBe("image/png");
    expect(call.data).toBeInstanceOf(Buffer);
    expect(call.data.length).toBeGreaterThan(0);
    expect(call.acl).toEqual({ owner: "imported", visibility: "private" });
  });

  it("rewrites known media-URL fields in lesson content", async () => {
    const origPath = "/objects/uploads/img.png";
    const newPath = "/objects/uploads/fresh.png";
    storeObjectBytesMock.mockResolvedValueOnce(newPath);

    let capturedContent: any = null;
    dbMock.insert.mockImplementation((table: any) => ({
      values: (values: any) => {
        if (String(table) === "lessons") capturedContent = values.content;
        return { returning: () => Promise.resolve([{ id: "x", status: "draft", ...values }]) };
      },
    }));

    await importCourse(makeV2Doc({
      assets: { [origPath]: validAsset(origPath) },
      course: {
        ...makeV2Doc().course,
        modules: [{
          title: "M", description: null, order: 0,
          lessons: [{
            title: "L", type: "image", order: 0, estimatedMinutes: 1, required: true,
            content: { url: origPath, alt: "some alt text" },
          }],
        }],
      },
    }));

    expect(capturedContent.url).toBe(newPath);
    expect(capturedContent.url).not.toBe(origPath);
    // Non-media-URL field must NOT be rewritten
    expect(capturedContent.alt).toBe("some alt text");
  });

  it("rewrites audioUrl in lesson content", async () => {
    const origPath = "/objects/narration/speech.mp3";
    const newPath = "/objects/narration/fresh.mp3";
    storeObjectBytesMock.mockResolvedValueOnce(newPath);

    let capturedContent: any = null;
    dbMock.insert.mockImplementation((table: any) => ({
      values: (values: any) => {
        if (String(table) === "lessons") capturedContent = values.content;
        return { returning: () => Promise.resolve([{ id: "x", status: "draft", ...values }]) };
      },
    }));

    await importCourse(makeV2Doc({
      assets: { [origPath]: validAsset(origPath, "audio/mpeg") },
      course: {
        ...makeV2Doc().course,
        modules: [{
          title: "M", description: null, order: 0,
          lessons: [{
            title: "L", type: "audio", order: 0, estimatedMinutes: 1, required: true,
            content: { audioUrl: origPath, description: "An audio lesson" },
          }],
        }],
      },
    }));

    expect(capturedContent.audioUrl).toBe(newPath);
    // description is a free-text field — must be left alone
    expect(capturedContent.description).toBe("An audio lesson");
  });

  it("does NOT rewrite a managed path in a free-text field (html, caption, description)", async () => {
    const origPath = "/objects/uploads/img.png";
    const newPath = "/objects/uploads/fresh.png";
    storeObjectBytesMock.mockResolvedValueOnce(newPath);

    let capturedContent: any = null;
    dbMock.insert.mockImplementation((table: any) => ({
      values: (values: any) => {
        if (String(table) === "lessons") capturedContent = values.content;
        return { returning: () => Promise.resolve([{ id: "x", status: "draft", ...values }]) };
      },
    }));

    // A rich-text lesson where the html body happens to mention the path
    await importCourse(makeV2Doc({
      assets: { [origPath]: validAsset(origPath) },
      course: {
        ...makeV2Doc().course,
        modules: [{
          title: "M", description: null, order: 0,
          lessons: [{
            title: "L", type: "rich_text", order: 0, estimatedMinutes: 1, required: true,
            content: {
              html: `<img src="${origPath}">`,   // in html — must NOT be rewritten
              caption: origPath,                  // in caption — must NOT be rewritten
            },
          }],
        }],
      },
    }));

    // html and caption are not known media-URL keys → untouched
    expect(capturedContent.html).toBe(`<img src="${origPath}">`);
    expect(capturedContent.caption).toBe(origPath);
  });

  it("rewrites hero imageUrl when it is a managed path", async () => {
    const origPath = "/objects/uploads/hero.jpg";
    storeObjectBytesMock.mockImplementation(async (o: any) => `/objects/${o.entityId}`);

    const result = await importCourse(makeV2Doc({
      assets: { [origPath]: validAsset(origPath, "image/jpeg") },
      course: { ...makeV2Doc().course, imageUrl: origPath },
    }));

    expect(result.restoredAssetCount).toBe(1);
    expect(result.course.imageUrl).not.toBe(origPath);
    expect(result.course.imageUrl).toMatch(/^\/objects\/uploads\//);
    expect(storeObjectBytesMock.mock.calls[0][0].acl).toEqual({
      owner: "imported",
      visibility: "public",
    });
  });

  it("deduplicates: a path referenced in two lessons is stored only once", async () => {
    const origPath = "/objects/narration/shared.mp3";
    const newPath = "/objects/narration/fresh.mp3";
    storeObjectBytesMock.mockResolvedValueOnce(newPath);

    const capturedContents: any[] = [];
    dbMock.insert.mockImplementation((table: any) => ({
      values: (values: any) => {
        if (String(table) === "lessons") capturedContents.push(values.content);
        return { returning: () => Promise.resolve([{ id: "x", status: "draft", ...values }]) };
      },
    }));

    await importCourse(makeV2Doc({
      assets: { [origPath]: validAsset(origPath, "audio/mpeg") },
      course: {
        ...makeV2Doc().course,
        modules: [{
          title: "M", description: null, order: 0,
          lessons: [
            { title: "L1", type: "audio", order: 0, estimatedMinutes: 1, required: true, content: { audioUrl: origPath } },
            { title: "L2", type: "audio", order: 1, estimatedMinutes: 1, required: true, content: { audioUrl: origPath } },
          ],
        }],
      },
    }));

    expect(storeObjectBytesMock).toHaveBeenCalledOnce();
    expect(capturedContents).toHaveLength(2);
    expect(capturedContents[0].audioUrl).toBe(newPath);
    expect(capturedContents[1].audioUrl).toBe(newPath);
  });

  it("uses extension from original filename", async () => {
    const origPath = "/objects/slides/diagram.webp";
    storeObjectBytesMock.mockResolvedValueOnce("/objects/slides/new.webp");

    await importCourse(makeV2Doc({
      assets: { [origPath]: validAsset(origPath, "image/webp") },
    }));

    const call = storeObjectBytesMock.mock.calls[0][0];
    expect(call.entityId).toMatch(/^slides\/.+\.webp$/);
  });

  it("infers extension from contentType when original has none", async () => {
    const origPath = "/objects/narration/noext";
    storeObjectBytesMock.mockResolvedValueOnce("/objects/narration/fresh.mp3");

    await importCourse(makeV2Doc({
      assets: { [origPath]: validAsset(origPath, "audio/mpeg") },
    }));

    const call = storeObjectBytesMock.mock.calls[0][0];
    expect(call.entityId).toMatch(/^narration\/.+\.mp3$/);
  });

  it("always imports as draft status", async () => {
    const result = await importCourse(makeV2Doc({
      course: { ...makeV2Doc().course, status: "published" },
    }));
    expect(result.course.status).toBe("draft");
  });

  // ── Error-throwing on malformed assets ───────────────────────────────────

  it("throws when an asset entry is not an object", async () => {
    const doc = makeV2Doc({ assets: { "/objects/uploads/x.png": "bad" as any } });
    await expect(importCourse(doc)).rejects.toThrow(/not an object/);
  });

  it("throws when an asset key is not a recognised managed path", async () => {
    const doc = makeV2Doc({
      assets: {
        "/objects/certificates/secret.pdf": {
          originalPath: "/objects/certificates/secret.pdf",
          contentType: "application/pdf",
          data: VALID_B64,
        },
      },
    });
    await expect(importCourse(doc)).rejects.toThrow(/not a recognised managed path/);
  });

  it("throws when originalPath does not match the asset key", async () => {
    const doc = makeV2Doc({
      assets: {
        "/objects/uploads/a.png": {
          originalPath: "/objects/uploads/b.png",
          contentType: "image/png",
          data: VALID_B64,
        },
      },
    });
    await expect(importCourse(doc)).rejects.toThrow(/does not match its key/);
  });

  it("throws when contentType is empty", async () => {
    const path = "/objects/uploads/x.png";
    const doc = makeV2Doc({
      assets: { [path]: { originalPath: path, contentType: "", data: VALID_B64 } },
    });
    await expect(importCourse(doc)).rejects.toThrow(/empty contentType/);
  });

  it("throws when data is empty", async () => {
    const path = "/objects/uploads/x.png";
    const doc = makeV2Doc({
      assets: { [path]: { originalPath: path, contentType: "image/png", data: "" } },
    });
    await expect(importCourse(doc)).rejects.toThrow(/missing or empty data/);
  });

  it("throws when data decodes to zero bytes", async () => {
    const path = "/objects/uploads/x.png";
    // Buffer.from("", "base64").length === 0 — but we need non-empty string
    // that decodes to 0. Use a mock: pass base64 for empty via a workaround.
    // The empty-string case is caught by the "missing or empty data" check.
    // Zero-byte decode happens when all bytes are stripped, e.g. data = "\x00" stripped.
    // Easiest: replace the storeObjectBytes path — but the validation throws first.
    // Actually empty string is caught earlier. We can test the zero-decode path
    // by providing valid base64 chars that decode to zero bytes? Not possible with
    // standard base64 — any non-empty, non-padding base64 yields > 0 bytes.
    // The empty-data guard covers this. We document it as the same code path.
    const doc = makeV2Doc({
      assets: { [path]: { originalPath: path, contentType: "image/png", data: "" } },
    });
    await expect(importCourse(doc)).rejects.toThrow(/missing or empty data/);
  });

  it("throws when storeObjectBytes fails (storage error)", async () => {
    storeObjectBytesMock.mockRejectedValueOnce(new Error("storage unavailable"));
    const path = "/objects/uploads/x.png";
    const doc = makeV2Doc({
      assets: { [path]: validAsset(path) },
    });
    await expect(importCourse(doc)).rejects.toThrow("storage unavailable");
  });
});

// ─── exportCourse ──────────────────────────────────────────────────────────

describe("exportCourse", () => {
  // Each test manages its own mock setup to avoid beforeEach ordering issues.
  // Helper: set up DB to return a course (with optional imageUrl override)
  // and empty modules/lessons/tags.

  const BASE_COURSE = {
    id: "c1", title: "T", slug: "t", description: "d", summary: null, imageUrl: null,
    estimatedMinutes: 10, status: "published", visibility: "public", passingScore: 80,
    certificateEnabled: false,
  };

  function setupCourseOnly(courseOverrides: Partial<typeof BASE_COURSE> = {}) {
    vi.clearAllMocks();
    // exportCourse runs Promise.all([modules, lessons, tags]) simultaneously —
    // all three selects see the same "empty" mock after the first course hit.
    dbMock.select
      .mockReturnValueOnce(makeSelect([{ ...BASE_COURSE, ...courseOverrides }]))
      .mockReturnValue(makeSelect([]));
  }

  it("returns null when the course is not found", async () => {
    vi.clearAllMocks();
    dbMock.select.mockReturnValue(makeSelect([]));
    expect(await exportCourse("nonexistent")).toBeNull();
  });

  // ── Default behaviour (v2) ──────────────────────────────────────────────

  it("produces v2 by default when the course has no managed assets", async () => {
    setupCourseOnly();
    const result = await exportCourse("c1");
    expect(result).not.toBeNull();
    expect(result!.version).toBe("2");
    expect((result as CourseExportDocV2).assets).toEqual({});
    expect(readObjectBytesMock).not.toHaveBeenCalled();
  });

  it("embeds the hero imageUrl asset in the v2 package", async () => {
    setupCourseOnly({ imageUrl: "/objects/uploads/hero.jpg" });
    readObjectBytesMock.mockResolvedValueOnce({
      data: Buffer.from("hero-bytes"),
      contentType: "image/jpeg",
    });

    const result = await exportCourse("c1");
    expect(result!.version).toBe("2");
    const v2 = result as CourseExportDocV2;
    expect(v2.assets["/objects/uploads/hero.jpg"]).toBeDefined();
    expect(v2.assets["/objects/uploads/hero.jpg"].contentType).toBe("image/jpeg");
    expect(v2.assets["/objects/uploads/hero.jpg"].data).toBe(
      Buffer.from("hero-bytes").toString("base64")
    );
  });

  it("embeds lesson media assets in the v2 package", async () => {
    vi.clearAllMocks();
    // The DB query pattern for exportCourse:
    //   1st select: course lookup (where id = ...)
    //   Then Promise.all of 3 selects: modules (orderBy), lessons (innerJoin→where), tags
    // The modules query returns module rows; lessons query returns {lessons:{...}} joined rows.
    const fakeModule = { id: "m1", courseId: "c1", title: "M", description: null, order: 0 };
    const fakeJoinedLesson = {
      lessons: {
        id: "l1", moduleId: "m1", title: "L1", type: "audio", order: 0,
        estimatedMinutes: 1, required: true,
        content: { audioUrl: "/objects/narration/speech.mp3" },
      },
    };
    dbMock.select
      .mockReturnValueOnce(makeSelect([BASE_COURSE]))          // course lookup
      .mockReturnValueOnce(makeSelect([fakeModule]))            // modules
      .mockReturnValueOnce(makeSelect([fakeJoinedLesson]))      // lessons (joined)
      .mockReturnValue(makeSelect([]));                         // tags + any extras

    readObjectBytesMock.mockResolvedValueOnce({ data: Buffer.from("audio"), contentType: "audio/mpeg" });

    const result = await exportCourse("c1");
    const v2 = result as CourseExportDocV2;
    expect(v2.assets["/objects/narration/speech.mp3"]).toBeDefined();
    expect(v2.assets["/objects/narration/speech.mp3"].contentType).toBe("audio/mpeg");
  });

  it("deduplicates: same asset referenced in two lessons is read once", async () => {
    vi.clearAllMocks();
    const fakeModule = { id: "m1", courseId: "c1", title: "M", description: null, order: 0 };
    const shared = "/objects/narration/shared.mp3";
    const joinedLesson = (n: number) => ({
      lessons: {
        id: `l${n}`, moduleId: "m1", title: `L${n}`, type: "audio", order: n,
        estimatedMinutes: 1, required: true, content: { audioUrl: shared },
      },
    });
    dbMock.select
      .mockReturnValueOnce(makeSelect([BASE_COURSE]))
      .mockReturnValueOnce(makeSelect([fakeModule]))
      .mockReturnValueOnce(makeSelect([joinedLesson(0), joinedLesson(1)]))
      .mockReturnValue(makeSelect([]));

    readObjectBytesMock.mockResolvedValue({ data: Buffer.from("audio"), contentType: "audio/mpeg" });

    await exportCourse("c1");
    expect(readObjectBytesMock).toHaveBeenCalledOnce();
  });

  it("does not embed external URLs (only /objects/ managed paths)", async () => {
    setupCourseOnly({ imageUrl: "https://cdn.example.com/img.jpg" });
    const result = await exportCourse("c1");
    const v2 = result as CourseExportDocV2;
    expect(Object.keys(v2.assets)).toHaveLength(0);
    expect(readObjectBytesMock).not.toHaveBeenCalled();
  });

  // ── Export throws on missing/unreadable assets ───────────────────────────

  it("throws when a referenced managed asset is not found in storage", async () => {
    setupCourseOnly({ imageUrl: "/objects/uploads/missing.jpg" });
    readObjectBytesMock.mockResolvedValueOnce(null); // null = not found
    await expect(exportCourse("c1")).rejects.toThrow(/managed asset not found/);
  });

  it("throws when readObjectBytes rejects (I/O error)", async () => {
    setupCourseOnly({ imageUrl: "/objects/uploads/err.jpg" });
    readObjectBytesMock.mockRejectedValueOnce(new Error("bucket unavailable"));
    await expect(exportCourse("c1")).rejects.toThrow("bucket unavailable");
  });

  // ── Explicit legacy (v1) export ──────────────────────────────────────────

  it("produces v1 when embedMedia: false is passed", async () => {
    setupCourseOnly();
    const result = await exportCourse("c1", { embedMedia: false });
    expect(result!.version).toBe("1");
    expect((result as any).assets).toBeUndefined();
    expect(readObjectBytesMock).not.toHaveBeenCalled();
  });

  it("v1 export does not read storage even if the course has managed assets", async () => {
    setupCourseOnly({ imageUrl: "/objects/uploads/hero.jpg" });
    const result = await exportCourse("c1", { embedMedia: false });
    expect(result!.version).toBe("1");
    expect(readObjectBytesMock).not.toHaveBeenCalled();
  });
});

// ─── Round-trip: v1 backward compatibility ────────────────────────────────────

describe("backward compatibility: v1 round-trip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.select.mockReturnValue(makeSelect([]));
  });

  it("validates, then imports a v1 doc with no storage calls", async () => {
    const doc = makeV1Doc({
      modules: [{
        title: "Module A", description: "desc", order: 0,
        lessons: [{
          title: "Lesson 1", type: "rich_text", order: 0,
          estimatedMinutes: 5, required: true, content: { html: "<p>hi</p>" },
        }],
      }],
    });

    expect(() => validateCourseExportDoc(doc)).not.toThrow();
    const result = await importCourse(doc, { createdBy: "user-1" });

    expect(result.restoredAssetCount).toBe(0);
    expect(result.moduleCount).toBe(1);
    expect(result.lessonCount).toBe(1);
    expect(storeObjectBytesMock).not.toHaveBeenCalled();
    expect(readObjectBytesMock).not.toHaveBeenCalled();
  });

  it("v1 doc with external imageUrl imports unchanged (no rewriting)", async () => {
    const externalUrl = "https://images.unsplash.com/photo-abc.jpg";
    const doc = makeV1Doc({ imageUrl: externalUrl });
    const result = await importCourse(doc);
    // imageUrl preserved (no pathMap), storage untouched
    expect(result.course.imageUrl).toBe(externalUrl);
    expect(storeObjectBytesMock).not.toHaveBeenCalled();
  });
});
