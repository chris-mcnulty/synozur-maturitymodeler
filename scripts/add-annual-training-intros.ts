/**
 * Attach the recorded welcomes to the existing development drafts and produce
 * self-contained import packages compatible with the live 10 MiB JSON parser.
 * Originals are never modified. No courses are created or published.
 *
 * NODE_ENV=development npx tsx scripts/add-annual-training-intros.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import * as schema from "../shared/schema";
import { ObjectStorageService } from "../server/objectStorage";
import { exportCourse, validateCourseExportDoc } from "../server/services/course-import-export";
import { assertDevelopmentWorkspace } from "../courseware/annual-training/shared/dev-guard";

const run = promisify(execFile);
const topics = [
  { key: "data-privacy", slug: "synozur-data-privacy-and-client-confidentiality-annual-training",
    file: "riverside_edit_02_-_privacy_chris_mcnulty's_stu_1790970268015.mp4" },
  { key: "information-security", slug: "synozur-information-security-annual-training",
    file: "riverside_edit_-_info_security_chris_mcnulty's_stu_1790970268017.mp4" },
  { key: "business-conduct", slug: "synozur-standards-of-business-conduct-annual-training",
    file: "riverside_edit_03_-_sbc_chris_mcnulty's_stu_1790970268017.mp4" },
];
const MAX_JSON_BYTES = 10 * 1024 * 1024;

async function prepare(topic: typeof topics[number]) {
  const [course] = await db.select().from(schema.courses).where(eq(schema.courses.slug, topic.slug));
  if (!course || course.status !== "draft") throw new Error(`Expected existing draft: ${topic.slug}`);
  const modules = await db.select().from(schema.courseModules)
    .where(eq(schema.courseModules.courseId, course.id)).orderBy(schema.courseModules.order);
  const lessons = await db.select().from(schema.lessons)
    .where(eq(schema.lessons.moduleId, modules[0].id)).orderBy(schema.lessons.order);
  const lesson = lessons[0];
  if (lesson?.title !== "Welcome from Chris McNulty" || lesson.type !== "slides") {
    throw new Error(`Unexpected opening lesson in ${topic.slug}`);
  }
  const before = JSON.parse(await fs.readFile(`handoff/${topic.slug}.orion-course.json`, "utf8"));
  const beforeLesson = before.course.modules[0].lessons[0];
  if (JSON.stringify(beforeLesson.content) !== JSON.stringify(lesson.content)) {
    throw new Error(`Draft and saved opening lesson differ in ${topic.slug}; inspect before updating`);
  }
  const dir = path.join("handoff", "annual-training", topic.key);
  await fs.mkdir(dir, { recursive: true });
  const videoFile = path.join(dir, "welcome-video.mp4");
  const posterFile = path.join(dir, "welcome-video-poster.jpg");
  const original = path.join("attached_assets", topic.file);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", original,
    "-map", "0:v:0", "-map", "0:a:0", "-c:v", "libx264", "-preset", "medium",
    "-crf", "25", "-maxrate", "800k", "-bufsize", "1600k", "-threads", "2",
    "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", videoFile,
  ], { maxBuffer: 1024 * 1024 });
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", "0.5", "-i", videoFile,
    "-frames:v", "1", "-q:v", "3", posterFile,
  ]);
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height",
    "-of", "json", videoFile,
  ]);
  const probe = JSON.parse(stdout);
  if (!probe.streams.some((s: any) => s.codec_name === "h264" && s.width === 1920 && s.height === 1080) ||
      !probe.streams.some((s: any) => s.codec_name === "aac")) {
    throw new Error(`Invalid encoded video for ${topic.key}`);
  }
  const encoded = await fs.readFile(videoFile);
  // Account for base64 expansion before making any database changes.
  if (Buffer.byteLength(JSON.stringify(before)) + Math.ceil(encoded.length / 3) * 4 + 500_000 >= MAX_JSON_BYTES) {
    throw new Error(`Video package would exceed the live import limit: ${topic.key}`);
  }
  return { topic, course, lesson, videoFile, posterFile, encoded, duration: Number(probe.format.duration) };
}

async function main() {
  assertDevelopmentWorkspace();
  const prepared = await Promise.all(topics.map(prepare));
  const storage = new ObjectStorageService();
  const uploaded: string[] = [];
  let committed = false;
  try {
    const updates = [];
    for (const item of prepared) {
      const acl = { owner: item.course.ownerTenantId ?? item.course.createdBy ?? "annual-training", visibility: "private" as const };
      const videoUrl = await storage.storeObjectBytes({
        entityId: `uploads/${randomUUID()}.mp4`, data: item.encoded, contentType: "video/mp4", acl,
      });
      uploaded.push(videoUrl);
      const posterUrl = await storage.storeObjectBytes({
        entityId: `uploads/${randomUUID()}.jpg`, data: await fs.readFile(item.posterFile),
        contentType: "image/jpeg", acl,
      });
      uploaded.push(posterUrl);
      const content = structuredClone(item.lesson.content) as any;
      const slide = content.slides[0];
      const heading = slide.blocks.find((b: any) => b.type === "heading" && b.level === 1);
      const video = slide.blocks.find((b: any) => b.type === "video");
      if (!heading || !video) throw new Error(`Missing welcome video slot: ${item.topic.key}`);
      // Remove the coming-soon poster/callout and draft script; burned-in
      // captions from the submitted recording remain unchanged in the video.
      slide.blocks = [
        heading,
        { ...video, url: videoUrl, poster: posterUrl },
        { id: `${slide.id}-optional-note`, type: "text",
          html: "<p>This welcome is optional and does not count toward course completion.</p>" },
      ];
      updates.push({ ...item, content, videoUrl, posterUrl });
    }
    await db.transaction(async tx => {
      for (const item of updates) {
        await tx.update(schema.lessons).set({ content: item.content })
          .where(eq(schema.lessons.id, item.lesson.id));
      }
    });
    committed = true;
    for (const item of updates) {
      const doc = await exportCourse(item.course.id);
      validateCourseExportDoc(doc);
      const json = JSON.stringify(doc, null, 2);
      if (Buffer.byteLength(json) >= MAX_JSON_BYTES) throw new Error(`Export too large: ${item.topic.key}`);
      const welcome = doc.course.modules[0].lessons[0];
      const block = (welcome.content as any).slides[0].blocks.find((b: any) => b.type === "video");
      if (block.url !== item.videoUrl || !Buffer.from(doc.assets[block.url].data, "base64").equals(item.encoded)) {
        throw new Error(`Exported video bytes do not match: ${item.topic.key}`);
      }
      const saved = await db.select().from(schema.lessons).where(eq(schema.lessons.id, item.lesson.id));
      if (JSON.stringify(saved[0].content) !== JSON.stringify(item.content)) {
        throw new Error(`Opening lesson was not persisted: ${item.topic.key}`);
      }
      const exportFile = `handoff/${item.topic.slug}.orion-course.json`;
      await fs.writeFile(exportFile, json);
      await fs.writeFile(path.join("handoff", "annual-training", item.topic.key, "welcome-video.md"),
        `# Recorded welcome from Chris McNulty\n\n` +
        `The submitted video is now attached to the existing optional opening lesson in the development draft.\n\n` +
        `- Recording: welcome-video.mp4 (1080p H.264 with the original AAC audio and burned-in captions)\n` +
        `- Duration: ${item.duration.toFixed(1)} seconds\n` +
        `- Poster: welcome-video-poster.jpg, extracted from the recording\n` +
        `- The coming-soon blocks and pre-recording draft script were removed; no unverified final transcript was substituted.\n` +
        `- The original uploaded recording is unchanged.\n` +
        `- The updated self-contained import package is ${item.topic.slug}.orion-course.json.\n` +
        `- Production is unchanged. Import the updated package through Admin → Courses → Import.\n` +
        `- Full caption accuracy and a verbatim text transcript remain separate release-review items.\n`);
      console.log(JSON.stringify({
        course: item.course.title, status: "draft", updatedLesson: item.lesson.id,
        durationSeconds: item.duration, packageBytes: Buffer.byteLength(json),
        embeddedVideoVerified: true, exportFile,
      }));
    }
  } catch (error) {
    if (!committed) await Promise.all(uploaded.map(p => storage.deleteObjectByPath(p)));
    throw error;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());