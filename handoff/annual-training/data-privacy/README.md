# Administrator package

**Course:** Synozur Data Privacy and Client Confidentiality: Annual Training

> **Administrator only.** This folder contains answer keys and release instructions. Don’t share it with learners. The `.orion-course.json` export also contains answer keys, because Orion needs them to grade.

| | |
|---|---|
| Status | Draft, tenant-private, development only. Not published; no enrollments or communications. |
| Tenant | Synozur Test (`546b4ea6-05b4-4704-babf-b510e222644e`), resolved from the synozur.com tenant domain |
| Intended production tenant | Synozur.com (confirmed by course owner; import only after release approvals, as a new private draft) |
| Development course ID | `3d3255b0-485e-46a8-a1c9-060d83041f5d` |
| Preview (admin sign-in required) | https://de9b7c40-dcaa-46b2-b0c0-d28fd76a0dab-00-2enzqmoszfuzm.janeway.replit.dev/courses/synozur-data-privacy-and-client-confidentiality-annual-training |
| Slug | `synozur-data-privacy-and-client-confidentiality-annual-training` |
| Export | `handoff/synozur-data-privacy-and-client-confidentiality-annual-training.orion-course.json` |
| Source deck | `attached_assets/Synozur_Data_Privacy_and_Client_Confidentiality_-_Annual_Atte_1790292382346.pptx`. Course ID SYN-PRI-2026; version 0.1 draft, prepared September 23, 2026, for policy-owner review. |
| Source prompt | `attached_assets/Pasted-Prompt-2-Data-Privacy-and-Client-Confidentiality-F-Fram_1790292373093.txt` |
| Estimated time | 18 minutes (lesson estimates include about 4 minutes of narration). |
| Completion rule | All required lessons, the final knowledge check at 85%, and each learner's own signed attestation. All learners are expected to sign; unsigned attestations remain incomplete. Certificates are disabled. |

## Module and lesson inventory

1. **Welcome and the distinction**: Understand what privacy and confidentiality protect and why secure storage is not blanket permission.
2. **Purpose, classification, and minimum necessary data**: Start with the authorized task, take only needed fields, and respect client workspace rules.
3. **Sharing, meetings, AI, and vendors**: Verify audiences and sharing settings; check tools and purposes before transferring data.
4. **Retention, requests, and incidents**: Respect the schedule and holds, route requests, and report mistakes without assuming they are fixed.
5. **Knowledge check and attestation**: Complete the eight-question check, review your responsibilities, and sign separately.
6. **Reference**: Optional policy and framework source links.

| # | Lesson | Type | Required | Minutes |
|---|---|---|---|---|
| 1.1 | Welcome from Chris McNulty | Slides (video placeholder) | No | 1 |
| 1.2 | Privacy and confidentiality work together | Slides | Yes | 1 |
| 2.1 | Collect for a clear purpose | Slides | Yes | 1 |
| 2.2 | Respect the data classification | Slides | Yes | 1 |
| 3.1 | Check every disclosure | Slides | Yes | 1 |
| 3.2 | AI and vendors need boundaries | Slides | Yes | 1 |
| 3.3 | Practice: A client transcript and a new AI tool | Quiz (practice) | Yes | 1 |
| 3.4 | Practice: A restricted link reaches the wrong person | Quiz (practice) | Yes | 1 |
| 4.1 | Keep only what is required | Slides | Yes | 1 |
| 4.2 | Route requests and report disclosures | Slides | Yes | 1 |
| 4.3 | Practice: A deletion request during a legal hold | Quiz (practice) | Yes | 1 |
| 4.4 | Before you share: quick reference | Rich text + PDF resource | Yes | 1 |
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
