# Limitations and proposed product changes (administrator only)

These are gaps between the requested design and Orion’s current course features. Each was handled with an existing pattern; nothing new was added to Orion.

| Request | Status | What the course does | Proposed product change |
|---|---|---|---|
| Opening video with poster, captions, and transcript | Partly supported | Slides lesson with a poster image, an empty video block (poster set), a placeholder callout, and the draft transcript. Lesson-level videos have no poster, transcript, or caption fields, and video blocks have no caption track. | Add a video poster, a transcript field, WebVTT caption upload, and an explicit “coming soon” placeholder state to video lessons and blocks. |
| Per-choice feedback | Not supported | One explanation per question that addresses the tempting wrong choices; per-choice feedback kept in the answer sheet. | Optional per-answer feedback, returned only for the choices a learner selected (never the key). |
| Remediation before retry; equivalent retry questions | Not supported | Explanations name the lesson to revisit; retries are unlimited and immediate. | Retry rules (review linked lessons before retrying) and question pools for equivalent questions. |
| Feedback only after a genuine attempt | Not supported | Answer keys are never sent to learners, but Orion returns every question’s explanation after any submission, including one with unanswered questions. A learner can therefore read all explanations before trying seriously; passing still requires 100%. | Require an answer to every question before grading, and optionally withhold explanations for questions the learner didn’t answer. |
| Enforced order of required lessons, quiz, and attestation | Supported | Required lessons unlock in order; the attestation is last and only unlocks after the quiz is passed. | None. |
| “I need clarification” option on the attestation | Not supported | A “Before you sign” lesson tells learners not to sign and whom to ask (placeholder until verified). Unsigned attestations stay incomplete. | An attestation “request clarification” response that notifies the owner and records the request. |
| Course version captured in the attestation record | Not supported | The signed statement text is stored with each record. | Store the course version or content hash with each signature. |
| Ungraded practice | Partly supported | Practice quizzes with a passing score of 0; introductions say “not graded.” The result still reads “Passed!” with a score line such as “Score: 33 / 100 · Passing: 0.” Incorrect answers are labeled “Review the answer.” | A practice quiz mode with feedback but no pass/fail banner. |
| Placeholder lessons that can’t be completed | Not supported | The video placeholder is optional, so it never affects completion, but learners can still mark it complete. | Hide “Mark complete” until required media exists. |
| Learner-role testing of a draft | Limited | Drafts are hidden from learners, so learner behavior was tested on a throwaway copy imported from the export into an isolated development QA tenant with test accounts, then deleted. The real draft was never published or enrolled. | A “preview as learner” mode for draft courses. |
| Annual renewal | Out of scope | Course cycles, enrollments, and communications are managed operationally. The course doesn’t renew automatically. | None in this task. |

## Specific to this course

- Proposed conduct standards beyond the retrieved IT policies have no verified approval. The specified ReportIt@synozur.com route applies to code-of-conduct breaches; designated usual and independent alternate contacts, HR contact, gift limits, investigation wording, and attestation approval remain release blockers.
- Per-choice feedback, question origin, and revisit targets remain administrator-only; Orion displays one post-submission explanation per question.
- Practice passing score 0 can produce a Passed banner despite being ungraded; introductions explain the distinction.
- The empty video slot has no recording; Orion may still let a learner mark this optional lesson complete.
- An unsigned attestation remains incomplete; Orion has no native clarification choice, so a verified owner must handle questions outside the training response.
