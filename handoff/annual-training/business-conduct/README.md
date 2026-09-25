# Administrator package

**Course:** Synozur Standards of Business Conduct: Annual Training

> **Administrator only.** This folder contains answer keys and release instructions. Don’t share it with learners. The `.orion-course.json` export also contains answer keys, because Orion needs them to grade.

| | |
|---|---|
| Status | Draft, tenant-private, development only. Not published; no enrollments or communications. |
| Tenant | Synozur Test (`546b4ea6-05b4-4704-babf-b510e222644e`), resolved from the synozur.com tenant domain |
| Intended production tenant | Synozur.com (confirmed by course owner; import only after release approvals, as a new private draft) |
| Development course ID | `0d06f106-912a-4135-bfd7-1a2ae370d5f5` |
| Preview (admin sign-in required) | https://de9b7c40-dcaa-46b2-b0c0-d28fd76a0dab-00-2enzqmoszfuzm.janeway.replit.dev/courses/synozur-standards-of-business-conduct-annual-training |
| Slug | `synozur-standards-of-business-conduct-annual-training` |
| Export | `handoff/synozur-standards-of-business-conduct-annual-training.orion-course.json` |
| Source deck | `attached_assets/Synozur_Standards_of_Business_Conduct_-_Annual_Attestation_DR_1790292453863.pptx`. Course ID SYN-CON-2026; version 0.1 draft, prepared September 23, 2026, for policy-owner review. |
| Source prompt | `attached_assets/Pasted-Prompt-3-Standards-of-Business-Conduct-F-Framing-Apply-_1790292447276.txt` |
| Estimated time | 19 minutes (lesson estimates include about 3 minutes of narration). |
| Completion rule | All required lessons, the final knowledge check at 85%, and each learner's own signed attestation. All learners are expected to sign; unsigned attestations remain incomplete. Certificates are disabled. |

## Module and lesson inventory

1. **Welcome and everyday judgment**: Start with five checks for ordinary decisions.
2. **Conflicts and improper influence**: Recognize interests, disclose them, and handle offers without hidden favors.
3. **Accurate work and responsible representation**: Keep a visible correction trail, verify claims, and take responsibility for AI-assisted work.
4. **Respect, client trust, and speaking up**: Treat people fairly, respect rights and information, and raise concerns through a safe route.
5. **Knowledge check and attestation**: Complete the graded check, review the proposed standards, then acknowledge separately.
6. **Reference**: Optional policy and framework links.

| # | Lesson | Type | Required | Minutes |
|---|---|---|---|---|
| 1.1 | Welcome from Chris McNulty | Slides (video placeholder) | No | 1 |
| 1.2 | Use the five-question decision test | Slides | Yes | 1 |
| 2.1 | Disclose conflicts before acting | Slides | Yes | 1 |
| 2.2 | Do not trade favors for business | Slides | Yes | 1 |
| 2.3 | Practice: A favor during selection | Quiz (practice) | Yes | 1 |
| 3.1 | Keep records and claims accurate | Slides | Yes | 1 |
| 3.2 | Verify commitments and AI-assisted claims | Slides | Yes | 1 |
| 3.3 | Practice: An approval before an audit | Quiz (practice) | Yes | 1 |
| 3.4 | Practice: An AI-written proposal | Quiz (practice) | Yes | 1 |
| 4.1 | Respect people in every setting | Slides | Yes | 1 |
| 4.2 | Protect client trust and compete fairly | Slides | Yes | 1 |
| 4.3 | Raise concerns without retaliation | Slides | Yes | 1 |
| 4.4 | Decision and reporting reference | Rich text + PDF resource | Yes | 1 |
| 5.1 | Final knowledge check | Quiz (graded) | Yes | 3 |
| 5.2 | Before you sign | Rich text | Yes | 1 |
| 5.3 | Annual acknowledgement | Attestation (typed name) | Yes | 1 |
| 6.1 | Policies and sources | Rich text | No | 1 |

## Files in this package

- `source-to-lesson-mapping.md`: where every deck slide went and how it changed.
- `quiz-answer-key.md`: answers, per-choice feedback, rationale, and remediation for all quizzes.
- `approval-checklist.md`: release blockers and approvals still needed.
- `welcome-video.md`: the video placeholder, Chris’s script, and recording guidance.
- `narration-scripts.md`: per-slide narration for review and later audio generation.
- `media-attribution.md`: sources, rights, alt text, and text equivalents for every image and file.
- `limitations-and-product-changes.md`: unsupported requests, workarounds, and proposed Orion changes.

Media sources (editable HTML for graphics, original photo files, and the PDF source) are in `courseware/annual-training/`. Rebuild with `npx tsx scripts/build-annual-training-course.ts <course> --render --replace`.
