---
name: Course media ACL boundary
description: Why course hero assets and lesson media use different object-storage access policies.
---

Course hero images must be readable through their direct managed-object URL, while lesson, slide, video, and narration media must remain private and be served through the course-aware media proxy.

**Why:** Catalog and course cards render hero URLs directly, including before enrollment. Restoring a hero with the same private ACL as lesson media produces a valid database reference that viewers cannot load. Making all course media public would instead bypass course authorization.

**How to apply:** Any upload, import, copy, or package-restore path must preserve this split: public-read ACL for the exact course hero reference, private ACL for other managed course assets, and proxy URLs for learner-facing private media.