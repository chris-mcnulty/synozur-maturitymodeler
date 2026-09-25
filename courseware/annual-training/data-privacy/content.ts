/**
 * Synozur Data Privacy and Client Confidentiality: Annual Training.
 * Source: Synozur_Data_Privacy_and_Client_Confidentiality_-_Annual_Atte_1790292382346.pptx.
 * All examples are fictional. Release placeholders are blockers, not approved policy.
 */
import type { CourseSpec, ModuleSpec } from "../shared/spec";
import { PHOTOS } from "./photos";

export const PENDING = (what: string) => `[TO CONFIRM BEFORE RELEASE: ${what}]`;

export const POLICY_LINKS = {
  it: "https://synozur.sharepoint.com/sites/SynozurIT/Shared%20Documents/General/IT%20Policy.docx",
  security: "https://synozur.sharepoint.com/sites/SynozurIT/Shared%20Documents/General/Security%20Policy.docx",
  privacyFramework: "https://www.nist.gov/privacy-framework/privacy-framework",
  csf: "https://csrc.nist.gov/projects/cybersecurity-framework/filters",
  sp800171: "https://csrc.nist.gov/pubs/sp/800/171/r3/final",
};

export const ATTESTATION_STATEMENT =
  "I completed this course and reviewed the applicable privacy, data-handling, and client confidentiality requirements. I will use information only for authorized purposes, limit access and sharing, follow retention instructions, and promptly report suspected disclosures or privacy concerns.";

export const WELCOME_SCRIPT = [
  "Hi, I’m Chris McNulty. Our clients share information with us so we can help them do their work. We need to respect the purpose and limits of that access.",
  "Sometimes the information is personal, like a name or an employee record. Sometimes it’s a business plan, pricing, or a workshop discussion. Both deserve care.",
  "This course will help you decide what information you need, where it belongs, and who should receive it. We’ll also look at AI tools, recordings, and the common assumption that removing names makes a document safe to reuse.",
  "If information goes to the wrong place, report it promptly, even if you think you’ve corrected the mistake.",
  "Take the time to work through the examples. Before signing the attestation, make sure you understand the requirements and know where to ask for help.",
];

/** Shared source for the learner lesson and the separately rendered draft PDF. */
export const BEFORE_YOU_SHARE = {
  title: "Before you share",
  intro: "Pause before sending a file, showing a screen, starting a recording, or uploading data. Check the purpose, people, content, and route.",
  checklist: [
    { label: "Purpose", detail: "Is this use authorized for this task? Check the engagement and client instructions before any new use." },
    { label: "Minimum necessary", detail: "Include only what the recipient needs. Removing names alone does not make a document anonymous or public." },
    { label: "People", detail: "Verify identities, attendees, recipients, and need-to-know access. Check the exact link permissions and recording audience." },
    { label: "Content", detail: "Review screens, comments, speaker notes, hidden content, metadata, and unique client details before sharing." },
    { label: "Route", detail: "Use the approved workspace, account, tool, and restricted sharing method. An NDA or approved tool does not authorize every use." },
    { label: "If it went wrong", detail: "Stop further sharing. Report promptly even if you recalled a file or removed a link. Preserve the facts; let responders assess exposure and notices." },
  ],
  routes: [
    { need: "IT help and general support", contact: "ithelp@synozur.com (published IT support address)" },
    { need: "Urgent security incidents (24-hour route)", contact: "ITHelp@synozur.com" },
    { need: "Other security issues", contact: "security@synozur.com" },
    { need: "Privacy concerns/questions, including misdirected files, public links, or unintended uploads", contact: "privacy@synozur.com" },
    { need: "Access, correction, deletion, or restriction requests", contact: PENDING("approved route for access, correction, deletion, and restriction requests") },
    { need: "Legal hold or disposal conflict", contact: PENDING("legal-hold process and contact") },
    { need: "Client-specific handling requirements", contact: PENDING("client-specific requirements and engagement-owner route") },
  ],
  caveat: "For urgent security incidents, contact ITHelp@synozur.com (24-hour route). For other security issues, contact security@synozur.com. For privacy concerns/questions, including misdirected files and unintended uploads, contact privacy@synozur.com. Do not send copies of exposed data in a report unless responders ask.",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const routesHtml = () =>
  `<table><thead><tr><th>For</th><th>Route</th></tr></thead><tbody>${BEFORE_YOU_SHARE.routes.map(r => `<tr><td>${esc(r.need)}</td><td>${esc(r.contact)}</td></tr>`).join("")}</tbody></table>`;
const practiceIntro = (s: string) =>
  `<p><strong>Practice (not graded).</strong> Choose what you would do and submit for feedback. This does not affect the final check; you may retry.</p><p><strong>Fictional situation:</strong> ${s}</p>`;

const modules: ModuleSpec[] = [
  {
    title: "Welcome and the distinction",
    description: "Understand what privacy and confidentiality protect and why secure storage is not blanket permission.",
    lessons: [
      {
        key: "1.1", kind: "slides", title: "Welcome from Chris McNulty", minutes: 1, required: false, activityType: "video",
        slides: [{
          id: "pri-welcome", source: [1], blocks: [
            { type: "heading", level: 1, text: "Welcome from Chris McNulty" },
            { type: "image", media: "poster", alt: "Branded poster reading “Introduction video coming soon” and “A welcome from Chris McNulty.”" },
            { type: "text", html: "<p>The poster says: Introduction video coming soon. A welcome from Chris McNulty.</p>" },
            { type: "video-slot", posterMedia: "poster", caption: "Welcome from Chris McNulty" },
            { type: "callout", tone: "info", html: "<p><strong>Video coming soon.</strong> This is an empty media slot, not a recording. Read the draft transcript below. This optional lesson does not count toward completion.</p>" },
            { type: "heading", level: 2, text: "Draft transcript" },
            { type: "text", html: WELCOME_SCRIPT.map(p => `<p>${p}</p>`).join("") },
          ],
        }],
      },
      {
        key: "1.2", kind: "slides", title: "Privacy and confidentiality work together", minutes: 1, required: true,
        slides: [
          {
            id: "pri-overlap", source: [2, 3], blocks: [
              { type: "heading", level: 1, text: "Privacy and confidentiality work together" },
              { type: "image", media: "overlap", alt: "Overlapping circles show privacy protecting people, confidentiality protecting nonpublic information, and employee lists in client workshop files belonging to both." },
              { type: "text", html: "<p><strong>Privacy protects people:</strong> names and contact details, employee records, recordings and images of people. <strong>Confidentiality protects nonpublic information:</strong> client plans and pricing, proposals and deliverables, workshop discussions. <strong>Both:</strong> personal information in client materials, such as an employee list in a client workshop file. Either way, use information only for the authorized purpose and share it only with people who need it.</p>" },
              { type: "callout", tone: "tip", html: "<p>A client roadmap can be confidential without naming anyone. An employee roster can be both personal and confidential. This course gives practical awareness, not legal advice or certification; policies and client terms govern your work.</p>" },
            ],
            narration: "Privacy asks what happens to information about people. Confidentiality also covers business information a client trusts us not to disclose, such as a roadmap or unpublished pricing. The two overlap when client materials contain details about individuals. Look at the purpose and the recipient, not just whether a file has a name in it.",
          },
          {
            id: "pri-secure-not-authorized", source: [3], blocks: [
              { type: "heading", level: 2, text: "Secure does not always mean appropriate" },
              { type: "text", html: "<p>A client shares employee survey responses for a workshop summary. The team stores them in an access-controlled workspace. Reusing the same responses for an unrelated sales analysis can still be inappropriate, even if nobody outside the workspace gains access.</p><p>Security controls help protect information. The data owner and engagement lead must assess whether the new purpose is authorized under policy and client requirements.</p>" },
            ],
            narration: "Encryption and access controls address exposure, but they do not answer whether a new use is permitted. A legitimate survey collected for one task should not silently become input to a different project. When the purpose changes, pause and ask the people responsible for the data and engagement.",
          },
        ],
      },
    ],
  },
  {
    title: "Purpose, classification, and minimum necessary data",
    description: "Start with the authorized task, take only needed fields, and respect client workspace rules.",
    lessons: [
      {
        key: "2.1", kind: "slides", title: "Collect for a clear purpose", minutes: 1, required: true,
        slides: [
          {
            id: "pri-purpose", source: [4], blocks: [
              { type: "heading", level: 1, text: "Collect for a clear purpose" },
              { type: "image", media: "photoDocReview", alt: "Hands holding a pencil over handwritten diagrams beside two laptops; nothing on the papers or screens is readable." },
              { type: "text", html: "<p>Begin with the business question, not a full export. Identify why the task needs the data, who authorized the use, and which fields are necessary. Prefer synthetic examples for demonstrations. A new client, marketing use, AI tool, or analysis may require fresh review by the data owner and engagement lead.</p>" },
            ],
            narration: "Before asking for a dataset, write down the question you are trying to answer. A full export may feel convenient but brings fields you do not need into scope. If the purpose changes, do not decide by yourself that the old authorization carries over. Ask the data owner and engagement lead.",
          },
          {
            id: "pri-minimize", source: [4], blocks: [
              { type: "heading", level: 2, text: "Removing names is only a start" },
              { type: "image", media: "minimization", alt: "Fictional survey export reduced from seven fields to department and feedback comment; small groups, free-text details, and combined records can still identify people." },
              { type: "text", html: "<p><strong>FICTIONAL TRAINING EXAMPLE.</strong> Task: summarize themes from a client workshop feedback survey. Before: four made-up survey rows with Name, Work email (example.com), Employee ID, Department, Location, Role level, and Feedback comment; two people work in Treasury in Lisbon. After: keep only Department and Feedback comment, and replace names mentioned inside comments with “[name removed].” <strong>Still identifiable?</strong> A two-person team in one office points to specific people; free text may mention names, projects, or unique events; org charts or meeting notes can re-identify them. Removing names reduces risk but does not guarantee anonymity. Check the client’s instructions before reusing.</p>" },
            ],
            narration: "Notice what is left after a column is removed. A department and a location can identify a tiny team. A free-text comment can mention a singular event. Other records can fill in the gaps. Minimize first, then ask the responsible owner whether the remaining information can be used for the proposed task.",
          },
        ],
      },
      {
        key: "2.2", kind: "slides", title: "Respect the data classification", minutes: 1, required: true,
        slides: [{
          id: "pri-classification", source: [5], blocks: [
            { type: "heading", level: 1, text: "Respect the data classification" },
            { type: "text", html: `<ul><li>Check the data owner’s label, engagement instructions, and ${PENDING("client-specific requirements and engagement-owner route")}.</li><li>Store work in the approved client workspace with need-to-know access and the required protections. Keep clients’ work separate.</li><li>A missing label does not mean “public.” If instructions are unclear, pause sharing and ask the data owner, engagement lead, or IT.</li></ul><p>Some information may need additional handling. The responsible owners assess classification, contract terms, and whether a specialized environment is required; do not label every confidential document as CUI.</p>` },
          ],
          narration: "A label tells you how the data owner expects information to be handled, but a missing label does not release it for general use. Client terms may add restrictions, including on where files live and who has access. Ask rather than guessing when a label, environment, or contract instruction is unclear.",
        }],
      },
    ],
  },
  {
    title: "Sharing, meetings, AI, and vendors",
    description: "Verify audiences and sharing settings; check tools and purposes before transferring data.",
    lessons: [
      {
        key: "3.1", kind: "slides", title: "Check every disclosure", minutes: 1, required: true,
        slides: [
          {
            id: "pri-sharing", source: [6], blocks: [
              { type: "heading", level: 1, text: "Check every disclosure" },
              { type: "text", html: "<p>Before sending, confirm the recipient’s identity, authorization, need, exact file, and link permissions. Use an approved restricted link where appropriate, not a public link or personal email. Inspect comments, hidden content, speaker notes, and metadata. An NDA limits disclosure; it does not authorize every disclosure.</p><p>Do not reuse a client name, screenshot, quote, or work product in marketing or with another client without the required authorization. Removing the logo is not enough.</p>" },
            ],
            narration: "Sharing is not only clicking Send. A link can be set to allow anyone, and a document can carry comments or hidden details. Even inside a signed NDA, the audience and the purpose still matter. Check both the visible content and the permissions on the exact item being shared.",
          },
          {
            id: "pri-meetings", source: [6], blocks: [
              { type: "heading", level: 2, text: "Meetings and recordings have an audience too" },
              { type: "image", media: "photoWorkshop", alt: "Two people discuss colorful sticky notes on a whiteboard in an office workshop; the writing is blurred and unreadable." },
              { type: "text", html: "<p>Verify attendees, close unrelated client windows, and share only the intended application. Before recording, check client restrictions and the approved process. Decide who can access the recording afterward; store and share it only in the approved workspace and audience. The engagement lead and client’s authorized contact assess permission to record and reuse.</p>" },
            ],
            narration: "A meeting can expose information to someone who joins late or sees another client’s window. A recording creates another file with its own access list and retention requirements. Check who can see it later, not only who attended live, and ask the engagement lead when recording rules are unclear.",
          },
        ],
      },
      {
        key: "3.2", kind: "slides", title: "AI and vendors need boundaries", minutes: 1, required: true,
        slides: [{
          id: "pri-ai", source: [7], blocks: [
            { type: "heading", level: 1, text: "AI and vendors need boundaries" },
            { type: "text", html: "<ol><li><strong>Service:</strong> confirm the specific service, account, data category, intended use, and client restrictions are approved.</li><li><strong>Data flow:</strong> have the responsible owner assess storage, access, retention, model use, subcontractors, and location before a new vendor or transfer.</li><li><strong>Output:</strong> check accuracy and unintended disclosure before sharing AI-generated work.</li></ol><p>A promise not to train a model on uploads does not settle other security or client requirements. Approval for a tool does not authorize every dataset or purpose. Do not put client material into public or experimental services without approved authorization.</p>" },
          ],
          narration: "A tool can be approved for one category of work and not for a client’s transcript. A vendor’s model-training promise is only one part of the review: storage, access, subcontractors, and client restrictions still matter. Bring the proposed service and exact purpose to the responsible owner before moving information.",
        }],
      },
      {
        key: "3.3", kind: "quiz", title: "Practice: A client transcript and a new AI tool", minutes: 1, required: true, practice: true, passingScore: 0,
        source: "Deck slide 11 (fictional practice scenario and facilitator notes)",
        introHtml: practiceIntro("You want to paste a client workshop transcript into a new AI tool to make a sales example. You remove client and employee names, but the transcript still describes a unique project and its pricing. The tool has not been reviewed for this client or use."),
        questions: [
          {
            id: "p1-q1", source: "Slide 11: who assesses the proposed reuse", revisit: "AI and vendors need boundaries",
            text: "Before any part of this transcript goes into the new tool, who should assess whether that use is allowed?",
            answers: [
              { id: "a", text: "You can decide, because the names are already removed.", feedback: "Removing names doesn’t settle it: the project and pricing details are still client information, and the new purpose and tool need review." },
              { id: "b", text: "The AI tool’s vendor, through its terms of service.", feedback: "Vendor terms describe how the vendor handles uploads, not whether the client or Synozur permits this use." },
              { id: "c", text: "The engagement lead and the responsible data owner, who check the client’s restrictions and whether the tool is approved for this use.", feedback: "They can confirm the client’s instructions, the purpose, and the tool’s approval for this data." },
              { id: "d", text: "A teammate who already uses the tool for similar work.", feedback: "Someone else’s use doesn’t show the tool is approved for this client, data, or purpose." },
            ],
            correct: "c", explanation: "Removing names leaves the unique project and pricing details, vendor terms don’t grant client permission, and a colleague’s habit isn’t an approval. The engagement lead and the responsible data owner check the client’s restrictions, the purpose, and the tool’s approval before anything is uploaded. Revisit “AI and vendors need boundaries.”",
          },
          {
            id: "p1-q2", source: "Slide 11: permissions and safer alternative", revisit: "AI and vendors need boundaries",
            text: "What is a safer way to develop the sales example?",
            answers: [
              { id: "a", text: "Use a wholly synthetic example, and ask the engagement lead about any proposed client-derived reuse.", feedback: "Synthetic material avoids transferring client details; the engagement lead assesses reuse." },
              { id: "b", text: "Change the client logo but keep the exact pricing.", feedback: "The specific pricing and project remain client information." },
              { id: "c", text: "Use a personal account so the client cannot see the upload.", feedback: "A personal account bypasses approved controls and does not change client restrictions." },
            ],
            correct: "a", explanation: "Replacing a logo leaves confidential pricing, while a personal account removes safeguards rather than permission requirements. Build a synthetic example instead; let the engagement lead and data owner assess client-derived reuse. Revisit “AI and vendors need boundaries.”",
          },
        ],
      },
      {
        key: "3.4", kind: "quiz", title: "Practice: A restricted link reaches the wrong person", minutes: 1, required: true, practice: true, passingScore: 0,
        source: "Prompt 2: wrong external recipient; deck slides 6 and 10",
        introHtml: practiceIntro("You send a restricted client workshop link to an external contact with a similar name to the intended recipient. You notice the error and remove access before you know whether the recipient opened it."),
        questions: [{
          id: "p2-q1", source: "Prompt 2: misdirected restricted link", revisit: "Treat accidental disclosure as an incident",
          text: "What should you do after removing access?",
          answers: [
            { id: "a", text: "Say nothing because the link is now restricted.", feedback: "Removing access does not establish whether the file was opened." },
            { id: "b", text: "Contact the external recipient yourself to declare that no breach occurred.", feedback: "Only authorized responders assess exposure and external communications." },
            { id: "c", text: "Report the error and known facts; preserve the message and access-change details.", feedback: "Responders assess access and notification obligations." },
            { id: "d", text: "Delete the original message so nobody else sees it.", feedback: "The message and timestamps may be needed as evidence." },
          ],
          correct: "c", explanation: "Removing access may limit exposure but cannot prove nobody opened the link. Preserve the message rather than deleting it, and leave conclusions and external notices to authorized responders. Revisit “Treat accidental disclosure as an incident.”",
        }],
      },
    ],
  },
  {
    title: "Retention, requests, and incidents",
    description: "Respect the schedule and holds, route requests, and report mistakes without assuming they are fixed.",
    lessons: [
      {
        key: "4.1", kind: "slides", title: "Keep only what is required", minutes: 1, required: true,
        slides: [{
          id: "pri-lifecycle", source: [8], blocks: [
            { type: "heading", level: 1, text: "Keep only what is required" },
            { type: "image", media: "lifecycle", alt: "Six-stage data lifecycle: collect only needed fields, use for authorized purpose, share with verified people via approved routes, store in an approved classified workspace, retain per schedule, then dispose by approved method; legal holds prevent deletion or alteration." },
            { type: "text", html: `<ol><li><strong>Collect:</strong> only the fields the task needs.</li><li><strong>Use:</strong> for the authorized purpose.</li><li><strong>Share:</strong> with verified recipients by an approved route.</li><li><strong>Store:</strong> in the approved workspace with the right classification.</li><li><strong>Retain:</strong> per ${PENDING("approved retention schedule by record type")}.</li><li><strong>Dispose:</strong> by an approved method when the schedule allows.</li></ol><p><strong>Legal hold:</strong> do not delete or change covered records even if a request or normal schedule says otherwise. Ask ${PENDING("legal-hold process and contact")}. Include downloads, recordings, and working copies in closeout planning. The record or engagement owner confirms the schedule and any holds; do not promise complete erasure on your own.</p>` },
          ],
          narration: "Data has a life beyond the deliverable. Downloads, recordings, and drafts also need an approved closeout path. There is no universal retention period in this course. Ask the record owner for the applicable schedule. If a hold covers the material, preserve it and ask the legal-hold contact before changing or disposing of anything.",
        }],
      },
      {
        key: "4.2", kind: "slides", title: "Route requests and report disclosures", minutes: 1, required: true,
        slides: [
          {
            id: "pri-requests", source: [9], blocks: [
              { type: "heading", level: 1, text: "Route privacy requests promptly" },
              { type: "text", html: `<p>A person may ask to access, correct, delete, or restrict use of information about them. Record the request and receipt time; route it through ${PENDING("approved route for access, correction, deletion, and restriction requests")}. Do not informally verify identity, disclose data, delete records, or promise a deadline yourself.</p><p>The designated privacy lead and legal advisers assess identity, applicable duties, exceptions, and timing. If Synozur handles data for a client, coordinate through the client’s authorized contact. A legal-hold conflict also goes to ${PENDING("legal-hold process and contact")}.</p>` },
            ],
            narration: "A request can be important without telling you which legal duty or response time applies. Preserve its wording and receipt time, then send it through the verified route. Privacy and legal owners assess identity, scope, client role, and any exception, including a hold. You should not decide these questions yourself.",
          },
          {
            id: "pri-incident", source: [10], blocks: [
              { type: "heading", level: 2, text: "Treat accidental disclosure as an incident" },
              { type: "text", html: `<p>Wrong recipient, public link, lost device, or unintended AI upload? Stop further sharing and report promptly to <strong>privacy@synozur.com</strong> as a privacy concern, even if you recalled the file or removed access. For urgent security incidents, contact <strong>ITHelp@synozur.com</strong> (24-hour route). For other security issues, contact <strong>security@synozur.com</strong>. Keep the original message and facts: information type, intended and actual audience, timing, current access, and actions taken. Do not attach another copy of the data to the report.</p><p>Responders assess what happened, whether to remove access, and any legal or contractual notices. Do not promise that no exposure occurred or contact affected people without authorization.</p>` },
            ],
            narration: "A successful recall is not proof that the other person never opened the file. For a privacy concern, report promptly to privacy@synozur.com. For an urgent security incident, contact ITHelp@synozur.com, the 24-hour route; for other security issues, contact security@synozur.com. Report the facts even if you think you fixed the mistake. Responders can check access logs, preserve evidence, and decide what communication is required. Avoid forwarding the exposed data again while trying to explain what happened.",
          },
        ],
      },
      {
        key: "4.3", kind: "quiz", title: "Practice: A deletion request during a legal hold", minutes: 1, required: true, practice: true, passingScore: 0,
        source: "Prompt 2: deletion request under legal hold; deck slides 8, 9, and 16",
        introHtml: practiceIntro("A person asks you to delete their workshop feedback. You know that relevant project records are covered by a legal hold. The normal retention schedule would otherwise allow disposal."),
        questions: [{
          id: "p3-q1", source: "Prompt 2: hold and deletion request (who assesses; what to tell the person)", revisit: "Route requests and report disclosures",
          text: "The person asks you to confirm today that their feedback has been deleted. What do you tell them?",
          answers: [
            { id: "a", text: "That it has been deleted, and plan to delete it once the hold ends.", feedback: "That would be untrue, and records under a hold must not be deleted or changed without direction." },
            { id: "b", text: "That you’ve recorded their request and passed it to the people who handle these requests, who will follow up.", feedback: "An honest acknowledgment with no promises; authorized owners assess the request and the hold." },
            { id: "c", text: "That the request is refused because of the legal hold.", feedback: "Deciding how the hold affects the request, and what the person is told, is for the privacy/legal owner and the legal-hold contact." },
            { id: "d", text: "A specific date when their information will be erased.", feedback: "You can’t promise timing or complete erasure before the request is assessed." },
          ],
          correct: "b", explanation: "Claiming deletion would be untrue, refusing decides a question that isn’t yours, and a date is a promise nobody has assessed. Acknowledge the request, record it, and route it. The privacy/legal owner and the legal-hold contact decide how the hold and the request interact and what the person is told. Revisit “Route requests and report disclosures.”",
        }],
      },
      {
        key: "4.4", kind: "rich_text", title: "Before you share: quick reference", minutes: 1, required: true,
        source: "Deck slides 4–10; Prompt 2 downloadable learner reference",
        html: `<h2>${esc(BEFORE_YOU_SHARE.title)}</h2><p>${esc(BEFORE_YOU_SHARE.intro)}</p><p>A printable PDF is under <strong>Course resources</strong> at the top of the course page.</p><ol>${BEFORE_YOU_SHARE.checklist.map(i => `<li><strong>${esc(i.label)}:</strong> ${esc(i.detail)}</li>`).join("")}</ol><h3>Contacts and routes</h3>${routesHtml()}<p>${esc(BEFORE_YOU_SHARE.caveat)}</p>`,
        resources: [{
          id: "pri-before-you-share", title: "Before you share: data privacy quick reference",
          description: "One-page draft checklist and contacts; request, legal-hold, and client routes remain pending verification.",
          filename: "Synozur-Before-you-share-Data-Privacy-DRAFT.pdf", mimeType: "application/pdf", mediaFile: "before-you-share-data-privacy.pdf",
        }],
      },
    ],
  },
  {
    title: "Knowledge check and attestation",
    description: "Complete the eight-question check, review your responsibilities, and sign separately.",
    lessons: [
      {
        key: "5.1", kind: "quiz", title: "Final knowledge check", minutes: 3, required: true, practice: false, passingScore: 85,
        source: "Deck slides 12–16 (Q1–Q5); Prompt 2 (Q6–Q8)",
        introHtml: "<p>Answer all eight equally weighted questions. A score of at least 85% is required to pass; 7/8 correct is 87.5% (shown rounded to 88%), so one wrong answer is allowed. After submitting, read the feedback, revisit any named lessons, then retry as needed. This check is separate from your typed-name attestation.</p>",
        questions: [
          {
            id: "q1", source: "Deck slide 12 (SYN-PRI-2026-Q01)", revisit: "Privacy and confidentiality work together",
            text: "Which information may be confidential even when it contains no personal data?",
            answers: [
              { id: "a", text: "Only government identifiers.", feedback: "Identifiers are personal data; confidentiality extends to nonpublic business information." },
              { id: "b", text: "Only employee medical information.", feedback: "Medical information concerns people, but confidential business information can contain no personal data." },
              { id: "c", text: "A client's unpublished pricing strategy.", feedback: "Unpublished business information can be confidential without identifying a person." },
              { id: "d", text: "Nothing; confidentiality requires a person's name.", feedback: "A name is not necessary for business information to be confidential." },
            ],
            correct: "c", explanation: "Government identifiers and medical information concern people, but confidentiality also protects nonpublic business plans and pricing without a name. Revisit “Privacy and confidentiality work together.”",
          },
          {
            id: "q2", source: "Deck slide 13 (SYN-PRI-2026-Q02)", revisit: "Collect for a clear purpose",
            text: "A task needs job role and region. You can export a full personnel file. What is best?",
            answers: [
              { id: "a", text: "Export the full file in case it is useful.", feedback: "Possible future usefulness does not authorize collecting unnecessary fields." },
              { id: "b", text: "Use only the necessary fields for the approved purpose.", feedback: "Limiting fields reduces exposure and keeps the use tied to the authorized task." },
              { id: "c", text: "Send the full file to a personal account.", feedback: "Personal accounts are not approved destinations for personnel files." },
              { id: "d", text: "Use all fields if the file is encrypted.", feedback: "Encryption does not authorize collecting extra fields." },
            ],
            correct: "b", explanation: "A full export adds avoidable exposure; a personal account adds an uncontrolled copy, and encryption does not authorize unnecessary collection. Limit fields to the approved task. Revisit “Collect for a clear purpose.”",
          },
          {
            id: "q3", source: "Deck slide 14 (SYN-PRI-2026-Q03)", revisit: "AI and vendors need boundaries",
            text: "Removing client and employee names always makes a transcript safe for public AI use.",
            answers: [
              { id: "a", text: "True, because names are the only identifiers.", feedback: "Indirect identifiers and confidential project details may remain." },
              { id: "b", text: "True, if the upload is brief.", feedback: "Upload length does not authorize a tool, purpose, or disclosure." },
              { id: "c", text: "True, if the result is never published.", feedback: "The upload itself is a disclosure to a service, even without publication." },
              { id: "d", text: "False; indirect identifiers and confidential content may remain.", feedback: "Name removal does not settle privacy, confidentiality, or tool permissions." },
            ],
            correct: "d", explanation: "Names are not the only identifiers. A brief upload still transfers data, even if its output is never published. Client details and tool permissions must be reviewed. Revisit “AI and vendors need boundaries.”",
          },
          {
            id: "q4", source: "Deck slide 15 (SYN-PRI-2026-Q04)", revisit: "Route requests and report disclosures",
            text: "You send a client file to the wrong recipient and then recall it. What should you do?",
            answers: [
              { id: "a", text: "Report immediately, including the recall and known facts.", feedback: "Recall does not prove no access; responders need the facts." },
              { id: "b", text: "Assume recall removed all risk.", feedback: "Recall may fail or occur after the file was accessed." },
              { id: "c", text: "Wait for the recipient to complain.", feedback: "A complaint is not required before reporting." },
              { id: "d", text: "Delete your sent record to reduce exposure.", feedback: "Deleting removes evidence responders may need." },
            ],
            correct: "a", explanation: "Recall does not prove the file was never opened. Waiting for a complaint delays assessment, and deleting your sent record removes evidence. Report the facts through the verified route. Revisit “Route requests and report disclosures.”",
          },
          {
            id: "q5", source: "Deck slide 16 (SYN-PRI-2026-Q05)", revisit: "Keep only what is required; Route requests and report disclosures",
            text: "A deletion request arrives while relevant records are under a legal hold. What is best?",
            answers: [
              { id: "a", text: "Delete them immediately to satisfy the person.", feedback: "A legal hold can prohibit deleting or changing covered records." },
              { id: "b", text: "Ignore the request until the hold ends.", feedback: "The request still needs to be recorded and routed." },
              { id: "c", text: "Record and route the request; do not delete on your own.", feedback: "Privacy/legal owners and the legal-hold contact assess the conflict." },
              { id: "d", text: "Promise a fixed deadline before checking requirements.", feedback: "Only authorized owners can assess timing and obligations." },
            ],
            correct: "c", explanation: "Do not delete held records, but do not ignore the request either. A fixed deadline cannot be promised without review. Privacy/legal owners and the legal-hold contact assess the conflict. Revisit “Keep only what is required” and “Route requests and report disclosures.”",
          },
          {
            id: "q6", source: "Prompt 2: client screenshot reused in marketing; deck slide 6", revisit: "Check every disclosure",
            text: "A client dashboard screenshot would strengthen a marketing post. Its logo is removed. What should you do?",
            answers: [
              { id: "a", text: "Post it; removing the logo makes it generic.", feedback: "Screenshots can contain distinctive confidential content without a logo." },
              { id: "b", text: "Ask the engagement lead to confirm client authorization and approved sanitization before any reuse.", feedback: "The client’s restrictions and intended use need review before marketing reuse." },
              { id: "c", text: "Post it only in a private social-media group.", feedback: "A private group is still a new audience and purpose." },
              { id: "d", text: "Ask a colleague under an NDA to approve it informally.", feedback: "An NDA does not give a colleague authority to approve marketing use." },
            ],
            correct: "b", explanation: "Removing a logo does not remove distinctive client content. A private group is still an audience, and an NDA does not grant approval for marketing. Have the engagement lead confirm authorization and review sanitization. Revisit “Check every disclosure.”",
          },
          {
            id: "q7", source: "Prompt 2: workshop recording and later access; deck slide 6", revisit: "Check every disclosure",
            text: "You want to record a client workshop for absent teammates. What should you check?",
            answers: [
              { id: "a", text: "Start recording and post the link to the whole company afterward.", feedback: "Client recording restrictions and later access must be checked first." },
              { id: "b", text: "Check client and engagement rules before recording, then restrict storage and later access to authorized people.", feedback: "Both the recording decision and its later audience require review." },
              { id: "c", text: "Record only audio; then no permissions are needed.", feedback: "Audio may contain identifiable voices and confidential discussion." },
              { id: "d", text: "Ask the attendees whether they mind and use a personal drive.", feedback: "Attendee preference does not replace the client’s rules; personal drives are not approved storage." },
            ],
            correct: "b", explanation: "Audio still captures confidential discussion; attendee preference alone does not resolve client rules. Company-wide links and personal drives spread access. Check restrictions before recording and control storage and later viewers. Revisit “Check every disclosure.”",
          },
          {
            id: "q8", source: "Prompt 2: new vendor or purpose for existing dataset; deck slides 4 and 7", revisit: "Collect for a clear purpose; AI and vendors need boundaries",
            text: "Your team wants a new vendor to analyze a dataset originally supplied for a different client task. What comes first?",
            answers: [
              { id: "a", text: "Upload it because the vendor promises not to train a model.", feedback: "Model training is only one factor; vendor, data, and purpose need review." },
              { id: "b", text: "Remove names and treat the existing task approval as covering the new use.", feedback: "Name removal may leave indirect identifiers, and authorization for one task is not blanket permission." },
              { id: "c", text: "Ask the data owner and engagement lead to assess the new purpose, client rules, and vendor before any transfer.", feedback: "Responsible owners assess authorization and the proposed data flow." },
              { id: "d", text: "Use the vendor first, then ask for approval if results are useful.", feedback: "A trial upload still transfers client information." },
            ],
            correct: "c", explanation: "A model-training promise does not cover all vendor risks. Removing names may leave identifiers, and a trial upload is still a transfer. Prior approval for one task is not permission for a new purpose. Revisit “Collect for a clear purpose” and “AI and vendors need boundaries.”",
          },
        ],
      },
      {
        key: "5.2", kind: "rich_text", title: "Before you sign", minutes: 1, required: true,
        source: "Deck slide 17 (attestation notes) and slide 20 (policies)",
        html: `<h2>Before you sign</h2><p>Everyone is expected to sign this acknowledgement. Next you will type your own full name. Review the applicable <a href="${POLICY_LINKS.it}" target="_blank" rel="noopener noreferrer">IT Policy</a> (Rev. 17 February 2026), <a href="${POLICY_LINKS.security}" target="_blank" rel="noopener noreferrer">Security Policy</a>, and ${PENDING("client-specific requirements and engagement-owner route")}.</p><p>You are acknowledging your responsibilities, not claiming that you have never made a mistake. You can report a concern and still sign. If you need clarification, do not sign yet: the attestation stays incomplete. Ask ${PENDING("contact for attestation clarification questions")}.</p><p>Orion records the exact statement, your typed name and account, date and time, and technical details such as IP address and browser. Do not put sensitive concern details in a training record.</p>`,
      },
      {
        key: "5.3", kind: "attestation", title: "Annual acknowledgement", minutes: 1, required: true,
        source: "Deck slide 17 (proposed wording preserved verbatim)",
        statement: ATTESTATION_STATEMENT,
      },
    ],
  },
  {
    title: "Reference",
    description: "Optional policy and framework source links.",
    lessons: [{
      key: "6.1", kind: "rich_text", title: "Policies and sources", minutes: 1, required: false,
      source: "Deck slide 20 (learner-safe references); slide 19 (framework context)",
      html: `<h2>Policies and sources</h2><p>Synozur policies and client terms govern your work. These frameworks are educational references, not legal advice, certification, or proof that controls are implemented. If instructions conflict, pause and ask the responsible owner.</p><ul><li><a href="${POLICY_LINKS.it}" target="_blank" rel="noopener noreferrer">IT Policy</a>, Rev. 17 February 2026: approved tools, AI, and support.</li><li><a href="${POLICY_LINKS.security}" target="_blank" rel="noopener noreferrer">Security Policy</a>: access, incidents, retention, and training (approval/effective status to confirm).</li><li><a href="${POLICY_LINKS.privacyFramework}" target="_blank" rel="noopener noreferrer">NIST Privacy Framework 1.0</a>: privacy-risk and data-lifecycle outcomes.</li><li><a href="${POLICY_LINKS.csf}" target="_blank" rel="noopener noreferrer">NIST CSF 2.0</a>: security awareness and governance outcomes.</li><li><a href="${POLICY_LINKS.sp800171}" target="_blank" rel="noopener noreferrer">NIST SP 800-171</a>: CUI protection where a contract brings it into scope; the governing revision must be confirmed.</li></ul>`,
    }],
  },
];

export const course: CourseSpec = {
  slug: "synozur-data-privacy-and-client-confidentiality-annual-training",
  title: "Synozur Data Privacy and Client Confidentiality: Annual Training",
  summary: "Use information only for authorized purposes, limit sharing, and route requests and suspected disclosures.",
  description: "Annual privacy and client-confidentiality awareness for Synozur staff. Practice decisions about purpose, minimum necessary data, client instructions, meetings, recordings, AI, vendors, retention, requests, and accidental disclosures.\n\nIncludes three practice situations, an eight-question final check, and a separate typed-name acknowledgement.\n\nPublisher: Synozur. Completion is a training record, not a legal or NIST certification.",
  tags: ["Annual training", "Data privacy", "Client confidentiality", "Attestation"],
  estimatedMinutes: 18,
  passingScore: 85,
  heroMedia: "hero",
  sourceDeck: "attached_assets/Synozur_Data_Privacy_and_Client_Confidentiality_-_Annual_Atte_1790292382346.pptx",
  sourcePrompt: "attached_assets/Pasted-Prompt-2-Data-Privacy-and-Client-Confidentiality-F-Fram_1790292373093.txt",
  modules,
  photos: PHOTOS,
};