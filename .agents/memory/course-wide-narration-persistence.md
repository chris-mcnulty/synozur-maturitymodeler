---
name: Course-wide narration persistence
description: Defines the persistence boundary and failure behavior for narration operations spanning an entire course.
---

Course-level narration operations must traverse all eligible slide lessons and persist their replacements server-side. They must not merely update the currently open lesson or require authors to open and save each lesson afterward.

**Why:** A lesson editor bulk action looks similar but does not satisfy a one-click course operation; tying replacement persistence to an open dialog leaves other lessons untouched.

**How to apply:** Keep lesson-level controls local, but implement course-level generation behind a course-authorized server operation. Preserve existing audio and voice metadata for individual slides whose generation fails.

Legacy replacement must offer an explicit “replace all existing audio” scope. Existing audio with a usable script remains eligible even if it predates the narration-approval flag, so older non-Dragon voices can be replaced consistently.