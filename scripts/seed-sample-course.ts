/**
 * Seeds the sample course into the dev database.
 * Run with: npx tsx scripts/seed-sample-course.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Dynamic import to avoid top-level await issues with cjs detection
  const { importCourse, validateCourseExportDoc } = await import(
    "../server/services/course-import-export.js"
  );

  const filePath = path.join(__dirname, "../samples/sample-course.orion-course.json");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));

  validateCourseExportDoc(raw);

  const result = await importCourse(raw, {
    ownerTenantId: null,
    createdBy: undefined,
  });

  console.log(`Seeded: ${result.course.title}`);
  console.log(`  id:      ${result.course.id}`);
  console.log(`  slug:    ${result.course.slug}`);
  console.log(`  modules: ${result.moduleCount}`);
  console.log(`  lessons: ${result.lessonCount}`);
  console.log(`  tags:    ${result.tagCount}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
});
