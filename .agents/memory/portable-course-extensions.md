---
name: Portable course extensions
description: Rules for portable course resources, semantic activity labels, submissions, and skip enforcement.
---

Portable course-only features can be stored in lesson `content` so existing Orion export/import packages preserve them without a database migration. Learner-facing course responses must promote globally available resources and semantic activity labels before locked lesson content is redacted.

**Why:** A resource list stored only in a later lesson disappears until that lesson unlocks, and a semantic label stored only in redacted content makes locked labs/readings look like generic rich text. Both break the learner contract even though the package itself is valid.

**How to apply:** Extract authorized course resources to course-level API metadata, preserve non-sensitive activity labels on lesson metadata, and strip duplicate resource bytes from lesson payloads.

Required submissions must be validated by the server before completion. A skip payload is valid only for lessons explicitly marked both `allowSkip` and semantic activity type `lab`.

**Why:** Hiding a completion button in the client does not prevent a crafted progress request from completing a capstone without evidence.

**How to apply:** Treat submission completeness, URL validity, and skip eligibility as server-side integrity rules; use the UI only as the learner experience.