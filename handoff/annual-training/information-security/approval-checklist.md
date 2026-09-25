# Approval checklist (administrator only)

Nothing here has been approved. The course is a draft and must stay unpublished until every release blocker is resolved.

## Release blockers

- [ ] **Release blocker:** Urgent and after-hours incident-reporting route _(where: Lesson 4.1, lesson 4.4, and the downloadable PDF; owner: Security / IT owner)_
- [ ] **Release blocker:** Accountable owner or contact for attestation questions _(where: Lesson 5.2 (Before you sign); owner: Policy owner / HR)_
- [ ] **Release blocker:** Remove the DRAFT watermark and banner from the PDF once contacts are verified, then re-render and re-upload it _(where: Course resource: What to do first (PDF); owner: Course author)_
- [ ] **Release blocker:** Policy-owner review of all learner content and the attestation wording _(where: Whole course; lesson 5.3; owner: Policy owner)_
- [ ] **Release blocker:** Confirm the Security Policy’s approval and effective status, and the final links for both policies _(where: Lessons 5.2 and 6.1; owner: Policy owner)_
- [ ] **Release blocker:** Welcome video: record, upload to the empty video block, remove the poster image block, replace the draft transcript, and verify captions (or approve a transcript-only launch) _(where: Lesson 1.1; owner: Chris McNulty / course author)_

## Other approvals and decisions

- [ ] Narration: review each script, mark approved, and generate audio with the approved Azure Speech voice (or approve transcript-only narration) _(where: All slide lessons; owner: Course author)_
- [ ] Confirm NIST scope: governing standard and revision, assessment boundary, and whether any contract brings CUI into scope _(where: Lessons 1.2, 3.3, 6.1; Q5; owner: Security owner / contracts)_
- [ ] Identify who needs role-specific training (administrators, developers, incident responders, data owners) and how it is assigned _(where: Lesson 1.2; Q8; owner: Security owner)_
- [ ] Approve the pass rule: 100% on the final check with unlimited retries; remediation before retry is recommended in feedback but not enforced _(where: Lesson 5.1; owner: Policy owner)_
- [ ] Approve the estimated duration (about 25 minutes including narration) against the 15–20 minute default _(where: Whole course; owner: Policy owner)_
- [ ] Decide how non-acknowledgement and clarification requests are followed up (Orion has no “I need clarification” response) _(where: Lessons 5.2–5.3; owner: HR / policy owner)_
- [ ] Confirm retention and access rules for attestation records _(where: Attestation records; owner: HR / security)_
- [ ] Keep completion certificates disabled until approved; any certificate must describe course completion, not certification _(where: Course settings; owner: Policy owner)_
- [ ] Approve the graphics and the two CC0 stock photos, or supply approved Synozur photography _(where: Hero, poster, lessons 2.2, 2.3, 3.1, 3.3, 4.1; owner: Brand owner)_
- [ ] Choose the production tenant at import time and confirm visibility stays private until release _(where: Production import; owner: Orion administrator)_
- [ ] Pilot with a few real learner accounts in the production tenant before release. Development testing used a throwaway copy in an isolated QA tenant because drafts are hidden from learners _(where: Whole course; owner: Orion administrator)_

## Placeholders visible in learner content

- Report early: `[TO CONFIRM BEFORE RELEASE: urgent and out-of-hours reporting route]`
- What to do first: quick reference: `[TO CONFIRM BEFORE RELEASE: urgent and out-of-hours reporting route]`
- Before you sign: `[TO CONFIRM BEFORE RELEASE: accountable owner or contact for attestation questions]`

## Before release

- [ ] Re-export after approvals and re-import into the production tenant as a new draft.
- [ ] Publish only after the release blockers above are cleared. Enrollment cycles, reminders, and communications are managed separately; Orion doesn’t renew this course automatically.
