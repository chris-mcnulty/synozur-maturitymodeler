# Administrator package

**Course:** Synozur Information Security: Annual Training

> **Administrator only.** This folder contains answer keys and release instructions. Don’t share it with learners. The `.orion-course.json` export also contains answer keys, because Orion needs them to grade.

| | |
|---|---|
| Status | Draft, tenant-private, development only. Not published; no enrollments or communications. |
| Tenant | Synozur Test (`546b4ea6-05b4-4704-babf-b510e222644e`), resolved from the synozur.com tenant domain |
| Intended production tenant | Synozur.com (confirmed by course owner; import only after release approvals, as a new private draft) |
| Development course ID | not imported in this run |
| Preview (admin sign-in required) | https://de9b7c40-dcaa-46b2-b0c0-d28fd76a0dab-00-2enzqmoszfuzm.janeway.replit.dev/courses/synozur-information-security-annual-training |
| Slug | `synozur-information-security-annual-training` |
| Export | `handoff/synozur-information-security-annual-training.orion-course.json` |
| Source deck | `attached_assets/Synozur_Information_Security_-_Annual_Attestation_DRAFT_1790292333253.pptx`. Course ID SYN-SEC-2026; version 0.1 draft, prepared September 23, 2026, for policy-owner review. |
| Source prompt | `attached_assets/Pasted-Information-Security-F-Framing-Apply-the-shared-instruc_1790292315576.txt` |
| Estimated time | 25 minutes (lesson estimates include about 9 minutes of narration). This is above the 15–20 minute default and needs owner approval. |
| Completion rule | All required lessons, the final knowledge check at 85%, and each learner's own signed attestation. All learners are expected to sign; unsigned attestations remain incomplete. Certificates are disabled. |

## Module and lesson inventory

1. **Welcome and responsibilities**: Why security is part of everyday work, what this course covers, and what it doesn’t.
2. **Accounts and suspicious requests**: Protect your sign-in, recognize pressure tactics in any channel, and verify requests independently.
3. **Safe tools, devices, and sharing**: Keep devices protected wherever you work, use approved tools and AI correctly, and share client work through approved routes.
4. **Reporting and practice**: Report early, preserve the facts, leave investigation to responders, and raise concerns without making assumptions.
5. **Knowledge check and attestation**: Answer eight questions, review what you’re acknowledging, and sign the annual attestation.
6. **Reference**: Policies and framework sources for later reference.

| # | Lesson | Type | Required | Minutes |
|---|---|---|---|---|
| 1.1 | Welcome from Chris McNulty | Slides (recorded video) | No | 2 |
| 1.2 | Security in everyday work | Slides | Yes | 3 |
| 2.1 | Protect your accounts | Slides | Yes | 3 |
| 2.2 | Recognize suspicious requests | Slides | Yes | 2 |
| 2.3 | Pause, verify independently, report | Slides | Yes | 2 |
| 2.4 | Practice: The urgent support call | Quiz (practice) | Yes | 2 |
| 3.1 | Devices and remote work | Slides | Yes | 3 |
| 3.2 | Approved tools and AI | Slides | Yes | 2 |
| 3.3 | Share client work through the approved route | Slides | Yes | 3 |
| 3.4 | Practice: The blocked sharing route | Quiz (practice) | Yes | 2 |
| 4.1 | Report early | Slides | Yes | 3 |
| 4.2 | Notice misuse without making assumptions | Slides | Yes | 2 |
| 4.3 | Practice: After a suspicious sign-in page | Quiz (practice) | Yes | 2 |
| 4.4 | What to do first: quick reference | Rich text + PDF resource | Yes | 1 |
| 5.1 | Final knowledge check | Quiz (graded) | Yes | 4 |
| 5.2 | Before you sign | Rich text | Yes | 1 |
| 5.3 | Annual acknowledgement | Attestation (typed name) | Yes | 1 |
| 6.1 | Policies and sources | Rich text | No | 1 |

## Files in this package

- `source-to-lesson-mapping.md`: where every deck slide went and how it changed.
- `quiz-answer-key.md`: answers, per-choice feedback, rationale, and remediation for all quizzes.
- `approval-checklist.md`: release blockers and approvals still needed.
- `welcome-video.md`: recorded welcome details; `welcome-video.mp4` and `welcome-video-poster.jpg` are included in the updated import package.
- `narration-scripts.md`: per-slide narration for review and later audio generation.
- `media-attribution.md`: sources, rights, alt text, and text equivalents for every image and file.
- `limitations-and-product-changes.md`: unsupported requests, workarounds, and proposed Orion changes.

Media sources (editable HTML for graphics, original photo files, and the PDF source) are in `courseware/annual-training/`. Rebuild with `npx tsx scripts/build-annual-training-course.ts <course> --render --replace`.
