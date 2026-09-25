---
name: Learner-testing a draft course
description: How to test learner behavior (redaction, locking, quiz grading, attestation) for draft Orion courses without publishing or enrolling in the real draft.
---
Drafts return 404 to non-managers, and managers get unredacted payloads, so neither view shows the learner experience. Test learner behavior on a throwaway published copy imported from the course's `.orion-course.json` export into an isolated QA tenant with learner accounts on a reserved `.invalid` email domain (the annual-training QA harness script does this). Never publish or enroll in the real draft to test it.

**Why:** User constraints for the Synozur annual-training courses: drafts stay unpublished, unenrolled, and tenant-private, with no communications sent. The copy's import also works as a round-trip check of the export.

**How to apply:** Teardown must delete only IDs recorded at setup (copy, the media paths its import created, QA users, QA tenant), never discover targets by name or pattern; a code review flagged pattern-based cleanup as unsafe. Don't create a global-admin test account; learners are enough. Run the harness only from the dev workspace. Disclose the temporary copy to the user and confirm cleanup afterwards (the real draft should have 0 enrollments).
