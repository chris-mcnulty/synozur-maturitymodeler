# Orion Platform Overview
## Synozur — The Transformation Company

**Current development build: Version 3.2 (September 2026).** This document describes implemented capabilities, not a proposed roadmap. Features configured in development are not automatically present in production: publishing updates application code and database schema, while authored assessment and course records must be transferred or configured separately.

## At a glance

Orion combines configurable assessments, learner-facing results, courseware, and curated learning paths in one tenant-aware platform. Administrators and modelers author assessments and learning content; learners take assessments, enroll in courses, complete required lessons, and review their progress. Course and assessment visibility is governed by publication status, ownership, and tenant access.

## Assessments and insights

- Create multiple assessment models with their own dimensions, questions, answer choices, scoring rules, maturity levels or type-based outcomes, images, and resources. Models can be drafted, published, assigned to tenants, and exported as portable `.model` files.
- Respondents complete a guided assessment and receive model-appropriate scores, results, and recommendations. Standard maturity models support dimension scoring, benchmarks where sufficient qualifying data exists, and AI-assisted insights. An individual-skills assessment can instead average scored applicable answers on a 0–100 scale and show a configured track.
- Administrators can inspect results and analytics, manage questions, import/export model definitions, and upload knowledge documents to ground supported AI features. Azure AI Foundry is the preferred AI provider.
- Authored translations can be carried inside an optional language section of a `.model` export. One translated assessment remains **one model and one scoring cohort**: switching languages changes respondent-facing text, not the question/answer identity or score. A supplied custom translation takes precedence over machine translation; additional supported languages can request Azure AI Foundry translation when available. This applies to assessment content, **not automatically to course lessons**.
- Portable `.model` files contain model configuration and authored translations, not assessment responses or tenant database IDs. On import, choose a destination tenant for a private model; publish the updated application/schema before importing a file that uses newer format fields.

## Courses and courseware

**Authoring:** In **Admin Console → Content → Courses**, create a course, set its overview and image, build ordered modules and lessons, and inspect enrollments. Courses can be draft, published, or archived, and public or tenant-private. Private courses can be shared with selected tenants. The structure screen shows each lesson's slide or element count.

**Lesson content:** A course can combine these lesson types and materials in a single sequence:

| Content | Current capability |
| --- | --- |
| Rich text | Authored formatted text, explanations, and instructions |
| Slides and pictures | Editable slide blocks including headings, text, images, callouts, and video blocks; upload images and other managed media |
| PowerPoint | Import a `.pptx`, review its slides, split into lessons, and edit the resulting course slides |
| Video | Video lessons using uploaded/linked media or supported video providers |
| Audio and narration | Audio lessons; per-slide narration scripts and uploaded audio or Azure Speech-generated narration, including DragonHD voice options |
| Quizzes | Questions with answer choices, server-side scoring, configurable passing score, and learner feedback |
| Attestations | A statement requiring a learner's typed-name acknowledgment |
| SCORM | Import and play SCORM 1.2/2004 packages with progress tracking; export SCORM-compatible packages |
| Resources and assignments | Attach downloadable course resources and require learner submissions to complete a lesson; assignments are attached to lessons, not a separate lesson type |

Slide authors can generate missing narration, regenerate narration in a lesson, or **replace existing narrated audio across all slide lessons in a course** with a selected voice. Replacements are confirmed; failed generations retain the previous audio. The course-level operation saves successful replacements to their lessons automatically.

**Learner experience:** Learners browse permitted courses, enroll, follow module/lesson order, and track completion. Required lessons and server-checked quiz, attestation, assignment, and SCORM conditions govern progress. Eligible completed courses can issue a private, downloadable completion certificate when certificates are enabled. Course administrators can see enrollments and progress.

**Transfer:** A `.orion-course.json` export carries course structure and managed hero/slide/narration media, but **not** enrollments, progress records, or SCORM binary packages. Imported SCORM lessons require the package to be uploaded separately. SCORM ZIP export is a distinct operation; do not assume a generic course export is a self-contained SCORM package.

## Annual policy or training attestation

Orion can **host courseware used for an annual attestation program**: for example, combine policy text, pictures, video or audio instruction, a knowledge-check quiz, and a final typed-name attestation in a tenant-private course. An attestation records the statement, signed name, user, tenant, enrollment/lesson, timestamp, IP address, and user agent for audit review. Authorized administrators can review the relevant completion and attestation records.

**Current limit:** An attestation is recorded when the learner signs it. Orion does **not** currently schedule annual re-attestation, expire an attestation after a year, automatically create a new yearly attempt, or send renewal/expiration reminders. To run an annual cycle today, administrators must manage the new course/enrollment cycle and communications operationally. Do not represent course completion or an attestation record as automatic annual compliance renewal.

## Academies and connected learning

The **Academies** module lets administrators assemble sequenced learning paths from Orion courses and external resources such as LinkedIn Learning, Coursera, Pluralsight, YouTube, Udemy, and edX. Academies have their own draft/publication state and tenant-aware visibility and sharing. They organize learning; an external resource is not silently converted into an Orion-hosted lesson.

## Access, privacy, and operations

- Tenant-aware permissions protect private assessments, courses, learning paths, learner media, and results. Public content is explicitly designated; sharing a course with a tenant is separate from making it public.
- Quiz answer keys are checked on the server rather than exposed for grading in the learner payload. Managed lesson media is served through course-aware access checks.
- Signed attestations and certificates are retained as protected learner records; administrative and integration access is scoped by role and tenant.
- Development and production store separate authored data. Use the supported import/export UI for portable assessment or course definitions after publishing the corresponding application/schema changes. Review destination tenant, status, and media/package limitations before making imported content available to learners.

## Planned or operationally manual work

Automated annual attestation renewals and expiration reminders are not implemented. Course lesson translations are not the same feature as assessment translations. External learning links in academies do not provide Orion-native completion evidence unless supported by a separately integrated workflow. These distinctions matter when planning compliance training.

For administrator steps, see `ADMIN_GUIDE.md`; for shipped changes and outstanding items, see `CHANGELOG.md` and `PRODUCT_BACKLOG.md`.