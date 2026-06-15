---
name: Dev vs prod data sync
description: Publishing migrates schema only, not data — model/archetype configuration created in dev does not appear in production.
---

When you publish/deploy an Orion app, Replit's flow diffs and applies the **database schema** to production. It does NOT copy **row data**. Development and production are separate databases.

**Why:** Configuring a model in the dev DB (e.g. setting `assessment_mode='type'`, creating `model_types` archetype rows, assigning `answers.type_key`) only changes dev data. In production the same model (often a different row id, matched by slug) keeps whatever was authored there — so a quiz built as a type/archetype assessment in dev still runs as a numeric "scored" assessment in prod and shows the maturity card.

**How to apply:** To make a dev-configured model work in production, re-create the data IN production: either author it via the admin UI on the live app, or export the dev model to a `.model` file and Import it in the prod admin (the `.model` export/import round-trip carries assessmentMode + archetypes + per-answer type keys; verified end-to-end). Do not expect data to ride along with a publish. Also remember the export must come from CURRENT code — older `.model` exports predate the `assessmentMode`/`types` fields and import back as "scored".
