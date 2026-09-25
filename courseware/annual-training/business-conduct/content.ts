/** Draft business-conduct course. Proposed standards require policy-owner approval. */
import type { CourseSpec, ModuleSpec, QuestionSpec } from "../shared/spec";
import { PHOTOS } from "./photos";

export const PENDING = (what: string) => `[TO CONFIRM BEFORE RELEASE: ${what}]`;

const LINKS = {
  it: "https://synozur.sharepoint.com/sites/PoliciesandProcedures/SitePages/IT-Policies.aspx",
  library: "https://synozur.sharepoint.com/sites/PoliciesandProcedures/Policy%20Library/Forms/Active%20Policies.aspx",
  site: "https://synozur.sharepoint.com/sites/PoliciesandProcedures",
  csf: "https://csrc.nist.gov/projects/cybersecurity-framework/filters",
  privacy: "https://www.nist.gov/privacy-framework/privacy-framework",
  cui: "https://csrc.nist.gov/pubs/sp/800/171/r3/final",
};

export const ATTESTATION_STATEMENT =
  "I completed this course and reviewed the applicable standards of business conduct. I will act honestly, disclose conflicts, protect client information, maintain accurate records, treat people respectfully, and raise concerns in good faith. I understand the obligation not to retaliate.";

export const WELCOME_SCRIPT = [
  "Hi, I’m Chris McNulty. The way we do our work matters to our clients and to each other.",
  "Most conduct decisions happen in ordinary situations. Someone offers a gift. A personal relationship overlaps with a business decision. A record needs correcting. A deadline makes a shortcut look attractive.",
  "This course gives you a practical way to handle those moments. Check your authority, be accurate about what happened, disclose conflicts early, and ask for guidance when something doesn’t feel right.",
  "You can raise a concern in good faith without retaliation. For a conduct concern, contact Michelle Caldwell at Michelle.caldwell@synozur.com. If Michelle is involved or you are uncomfortable contacting her, ReportIt@synozur.com is the out-of-band alternate route. It is not a guarantee of independence or absolute anonymity.",
  "Please work through the scenarios and read the standards before signing the attestation. Raise any questions first. We want the acknowledgement to reflect understanding.",
];

/** Shared structured source for the learner lesson and draft one-page PDF. */
export const DECISION_REFERENCE = {
  title: "Decision and reporting reference",
  intro: "A quick guide to the proposed conduct standards. Applicable approved policies, contracts, and client rules govern your work.",
  checks: [
    { label: "Permission", detail: "Check the law, contract, policy, client restrictions, and rights to use the material." },
    { label: "Honesty", detail: "Is the record or claim accurate and supportable? Correct mistakes with a visible trail." },
    { label: "Fairness", detail: "Could an interest, relationship, gift, or favor affect a decision or appear to? Disclose and step back for review." },
    { label: "Authority", detail: "Do you have approval to sign, spend, share, or commit? A request from someone senior does not replace it." },
    { label: "Explainability", detail: "Could you explain the decision openly and accurately? If not, pause and ask." },
  ],
  reporting: [
    { need: "Business-conduct concern or breach", route: "Primary contact: Michelle Caldwell · Michelle.caldwell@synozur.com" },
    { need: "Primary contact involved or uncomfortable to contact", route: "Out-of-band alternate: ReportIt@synozur.com. This does not guarantee independence or absolute anonymity." },
    { need: "Security issue", route: "Email security@synozur.com" },
    { need: "Attestation clarification", route: PENDING("contact for attestation questions") },
  ],
  reminder: "You can raise a concern in good faith without proof or investigating first. Do not retaliate or destroy records. Internal routes do not limit lawful reporting to government or regulatory authorities.",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const practiceIntro = (s: string) =>
  `<p><strong>Practice (not graded).</strong> Choose an action and submit for feedback; you can retry. This does not affect your final score.</p><p><strong>Fictional situation:</strong> ${s}</p>`;
const question = (id: string, text: string, choices: [string, string, string, string], correct: string, feedback: [string, string, string, string], explanation: string, revisit: string, source: string): QuestionSpec => ({
  id, text, answers: choices.map((choice, i) => ({ id: "abcd"[i], text: choice, feedback: feedback[i] })),
  correct, explanation: `${explanation} Revisit “${revisit}.”`, revisit, source,
});

const modules: ModuleSpec[] = [
  {
    title: "Welcome and everyday judgment",
    description: "Start with five checks for ordinary decisions.",
    lessons: [
      {
        key: "1.1", kind: "slides", title: "Welcome from Chris McNulty", minutes: 1, required: false, activityType: "video",
        slides: [{ id: "conduct-welcome", source: [1, 2], blocks: [
          { type: "heading", level: 1, text: "Welcome from Chris McNulty" },
          { type: "image", media: "poster", alt: "Poster reading Introduction video coming soon and A welcome from Chris McNulty." },
          { type: "text", html: "<p>Poster text: Introduction video coming soon. A welcome from Chris McNulty.</p>" },
          { type: "video-slot", posterMedia: "poster", caption: "Welcome from Chris McNulty" },
          { type: "callout", tone: "info", html: "<p><strong>Video coming soon.</strong> This empty slot is not a recording. Read the draft transcript below. This optional lesson does not count toward completion.</p>" },
          { type: "heading", level: 2, text: "Draft transcript" },
          { type: "text", html: WELCOME_SCRIPT.map(p => `<p>${esc(p)}</p>`).join("") },
        ] }],
      },
      {
        key: "1.2", kind: "slides", title: "Use the five-question decision test", minutes: 1, required: true,
        slides: [{ id: "conduct-test", source: [2, 3], blocks: [
          { type: "heading", level: 1, text: "Use the five-question decision test" },
          { type: "image", media: "photoTeamwork", alt: "Two colleagues work together beside a laptop and a notepad." },
          { type: "text", html: "<p>For a client commitment, purchase, or new use of work, ask: <strong>Permission:</strong> Is it allowed by law, contract, policy, and client rules? <strong>Honesty:</strong> Is it accurate? <strong>Fairness:</strong> Could an interest or favor sway it? <strong>Authority:</strong> May I approve or sign it? <strong>Explainability:</strong> Could I describe it openly? If unsure, pause and ask the responsible owner.</p>" },
          { type: "callout", tone: "info", html: `<p>These are <strong>proposed standards</strong>, ${PENDING("approval status of the Standards of Business Conduct and final approved code")}. The published IT Policy addresses authorized systems and work; it does not itself approve every proposed conduct rule. Client terms and approved policies govern.</p>` },
        ], narration: "Picture a routine request to sign a client proposal. First check permission and the rights to use its content. Then check whether every claim is supportable and everyone has a fair chance. Confirm that you personally have signing authority. If you would need to hide part of the decision to explain it, stop and seek guidance. These proposed standards still require approval." }],
      },
    ],
  },
  {
    title: "Conflicts and improper influence",
    description: "Recognize interests, disclose them, and handle offers without hidden favors.",
    lessons: [
      {
        key: "2.1", kind: "slides", title: "Disclose conflicts before acting", minutes: 1, required: true,
        slides: [{ id: "conduct-recuse", source: [4], blocks: [
          { type: "heading", level: 1, text: "Disclose conflicts before acting" },
          { type: "image", media: "recuse", alt: "Proposed, pending-approval flowchart: assess relationships, interests, gifts or hospitality; if yes or unsure disclose, step back, await recorded safeguards, then follow direction." },
          { type: "text", html: `<p><strong>Full diagram text:</strong> Badge: PROPOSED — PENDING APPROVAL. Could a relationship, outside interest, gift, or hospitality affect a decision you're part of, or look as if it does? <strong>No:</strong> Proceed. Check again if anything changes. <strong>Yes or unsure:</strong> (1) Disclose early, in writing, to your manager or the designated conduct contact (${PENDING("designated conduct/ethics contact and approved reporting route")}); (2) step back from the decision while it's reviewed; (3) the approver decides and records any safeguards; (4) continue only as directed. Note: No gift is too small to disclose if someone asks you to keep it secret. Gift and hospitality limits are pending policy approval. ${PENDING("approved gift and hospitality rules, restrictions, and approvals")} A conflict can be actual, potential, or perceived; disclosure is not an admission of wrongdoing. Do not use a colleague as a proxy.</p>` },
        ], narration: "A friend at a bidder or an outside interest may affect how a decision looks even if you feel impartial. The important move is early disclosure, not self-certifying that you can stay on the selection team. Step back while the decision owner reviews and records safeguards. If the situation changes, reassess it." }],
      },
      {
        key: "2.2", kind: "slides", title: "Do not trade favors for business", minutes: 1, required: true,
        slides: [{ id: "conduct-gifts", source: [5], blocks: [
          { type: "heading", level: 1, text: "Do not trade favors for business" },
          { type: "text", html: `<p>The proposed standards say never offer, request, or accept a bribe, kickback, or benefit intended to buy a decision. Benefits include travel, entertainment, discounts, donations, favors, or jobs. Check ${PENDING("approved gift and hospitality rules, restrictions, and approvals")} as well as client rules and procurement timing before accepting or offering anything. No monetary threshold has been verified; a small offer is not automatically permitted.</p><p>Record legitimate costs and approvals accurately. Do not split or relabel an expense to bypass review. If you are uncertain, pause the offer and ask for review. If immediate physical safety is at risk, prioritize safety and report the facts afterward.</p>` },
        ], narration: "Hospitality can influence a purchasing decision even without cash. During an active selection, timing and a request for secrecy are especially concerning. A price tag alone cannot settle the issue, because there is no verified gift threshold in this draft. Keep the offer and any expenses visible so an authorized reviewer can assess them." }],
      },
      {
        key: "2.3", kind: "quiz", title: "Practice: A favor during selection", minutes: 1, required: true, practice: true, passingScore: 0,
        source: "Deck slide 11, expanded fictional supplier-selection scenario",
        introHtml: practiceIntro("You are helping select a supplier. A friend at one bidder offers a weekend trip and asks you to keep it secret until after the decision. What information would help assess the selection fairly?"),
        questions: [question("p1", "Which details matter when assessing whether the selection is impartial?", [
          "Only the approximate value of the trip; a friendship is private.", "The relationship, offer, timing, secrecy request, and any relevant messages.", "Only the bidder's price; personal ties cannot affect a selection.", "An account that omits the secrecy request to avoid speculation.",
        ], "b", [
          "The relationship and timing are relevant to a perceived conflict.", "These details give context for an impartial assessment.", "Price alone does not address the possible effect of a personal tie.", "Omitting secrecy would conceal a material fact.",
        ], "Value alone misses the relationship and timing; price alone misses the personal tie. Omitting the secrecy request distorts the facts needed to assess impartiality.", "Disclose conflicts before acting", "Deck slide 11; facilitator notes")],
      },
    ],
  },
  {
    title: "Accurate work and responsible representation",
    description: "Keep a visible correction trail, verify claims, and take responsibility for AI-assisted work.",
    lessons: [
      {
        key: "3.1", kind: "slides", title: "Keep records and claims accurate", minutes: 1, required: true,
        slides: [{ id: "conduct-correction", source: [6], blocks: [
          { type: "heading", level: 1, text: "Keep records and claims accurate" },
          { type: "image", media: "correction", alt: "Fictional timesheet contrasts a hidden overwrite or backdated approval with a dated correction retaining the original and approver." },
          { type: "text", html: "<p><strong>Full diagram text — FICTIONAL TRAINING EXAMPLE:</strong> A synthetic timesheet uses made-up person Sam Ortiz and project codes ASTER-02 and BIRCH-07. <strong>Don't: overwrite or backdate.</strong> The original entry is silently replaced or an approval date changed. <strong>Do: correct with a visible trail.</strong> Keep the original entry readable even if struck through; add a correcting entry and note who corrected it, the actual date, why, and who approved it. Correct records openly. Never backdate an approval or hide the original.</p><p>Enter actual time, expenses, delivery status, and approvals promptly. Use the approved correction process and preserve records under any hold. Do not invent receipts, shift hours, or quietly change approval history.</p>" },
        ], narration: "A late correction can still be honest. The fictional example preserves the initial project entry and adds a dated explanation, instead of making a past approval appear to exist. Record what really happened, including who authorized a correction. The audit trail helps a reviewer understand the sequence without guessing." }],
      },
      {
        key: "3.2", kind: "slides", title: "Verify commitments and AI-assisted claims", minutes: 1, required: true,
        slides: [{ id: "conduct-claims", source: [6, 9], blocks: [
          { type: "heading", level: 1, text: "Verify commitments and AI-assisted claims" },
          { type: "text", html: "<p>Check signing and spending authority before promising an outcome, approving work, engaging a partner, or representing the company. Use approved procurement, accounts, and security review for tools or partners. Verify client-facing numbers, citations, rights, fairness, confidentiality, and disclosure requirements in AI-assisted drafts. A human remains responsible for what goes to the client.</p><p>Do not call Synozur “NIST-certified” based on training completion, a draft assessment, or an AI suggestion. A course completion record is not organizational certification. Have the accountable owner confirm any formal assurance claim against evidence and scope before use; remove unsupported claims.</p>" },
        ], narration: "A polished proposal is not evidence. If an AI draft cites a test you cannot verify, pause delivery and check the underlying source. A manager's request does not grant signing authority, and taking this course does not certify a company. Describe only what an accountable owner can support with evidence and the right approval." }],
      },
      {
        key: "3.3", kind: "quiz", title: "Practice: An approval before an audit", minutes: 1, required: true, practice: true, passingScore: 0,
        source: "Prompt 3: fictional backdated-approval scenario; deck slide 6",
        introHtml: practiceIntro("A manager asks you to backdate an approval before an audit. The original record shows a missing approval. What information would let a reviewer understand any later correction?"),
        questions: [question("p2", "Which detail makes a later correction traceable?", [
          "A replacement date with no note about when it was entered.", "A fresh file with no link to the original entry.", "The original entry plus the actual correction date, reason, and approver.", "A verbal explanation that is not recorded.",
        ], "c", [
          "A date without context does not show when the correction happened.", "Without the original, the sequence cannot be reconstructed.", "The actual date, reason, and approver explain the correction in context.", "A verbal account alone leaves no visible audit trail.",
        ], "An unexplained replacement date, disconnected file, or verbal account leaves the sequence unclear. The original entry and actual correction details make it traceable.", "Keep records and claims accurate", "Prompt 3; deck slide 6")],
      },
      {
        key: "3.4", kind: "quiz", title: "Practice: An AI-written proposal", minutes: 1, required: true, practice: true, passingScore: 0,
        source: "Prompt 3: fictional unsupported certification claim; deck slides 6 and 9",
        introHtml: practiceIntro("An AI-written proposal includes a certification claim, but no supporting evidence is attached. The team needs to establish whether any formal assurance statement can be supported."),
        questions: [question("p3", "Whose review can establish the scope and evidence behind a formal assurance statement?", [
          "The AI provider, since its system drafted the claim.", "The accountable assurance owner, working with the proposal owner.", "A teammate who remembers hearing about a future assessment.", "Any colleague who has completed annual training.",
        ], "b", [
          "A tool provider cannot verify Synozur's assurance scope.", "The accountable owner can check the evidence and scope with the proposal owner.", "A remembered plan is not verified evidence.", "Training completion does not establish organizational assurance.",
        ], "AI authorship, secondhand memory, and individual training cannot establish an organizational assurance claim. Scope and evidence require accountable review.", "Verify commitments and AI-assisted claims", "Prompt 3; deck slides 6 and 9")],
      },
    ],
  },
  {
    title: "Respect, client trust, and speaking up",
    description: "Treat people fairly, respect rights and information, and raise concerns through a safe route.",
    lessons: [
      {
        key: "4.1", kind: "slides", title: "Respect people in every setting", minutes: 1, required: true,
        slides: [{ id: "conduct-respect", source: [7], blocks: [
          { type: "heading", level: 1, text: "Respect people in every setting" },
          { type: "image", media: "photoDiscussion", alt: "Two colleagues talk across a table in a bright office." },
          { type: "text", html: "<p>Under the proposed standards, treat colleagues, clients, contractors, and partners with dignity in meetings, chat, remote work, travel, and business events. Do not harass, discriminate, bully, threaten, or retaliate. Listen to boundaries and support a colleague who asks for help without taking over their account. Use emergency services for immediate danger.</p>" },
        ], narration: "Professional respect applies in a remote call as much as at a client site. Intent does not erase the effect of a comment or action. If someone asks for support, listen, share the available routes, and avoid spreading sensitive details. You do not need to settle the facts before they can raise a concern." }],
      },
      {
        key: "4.2", kind: "slides", title: "Protect client trust and compete fairly", minutes: 1, required: true,
        slides: [{ id: "conduct-client", source: [8, 9], blocks: [
          { type: "heading", level: 1, text: "Protect client trust and compete fairly" },
          { type: "text", html: "<p>The IT Policy sets expectations for authorized systems and information. The proposed standards also ask you to respect client NDAs, project boundaries, and restrictions after the work ends. A signed NDA does not grant permission for a new use. Before reusing client work, code, images, or third-party content, confirm the client's permission, intellectual-property rights, and applicable license, including attribution or use limits.</p><p>Do not solicit or use a competitor's confidential pricing or bid material. If it arrives unexpectedly, stop reviewing or forwarding it, preserve the relevant facts, and ask the appropriate owner for guidance through the approved route. Do not agree to improper pricing, bidding, or market arrangements.</p>" },
        ], narration: "A useful client diagram is not automatically yours to put in the next proposal. Rights may depend on the contract and on third-party licenses embedded in the work. Likewise, an unexpected competitor file does not become fair game because it arrived in your inbox. Stop, avoid further distribution, and seek guidance without investigating on your own." }],
      },
      {
        key: "4.3", kind: "slides", title: "Raise concerns without retaliation", minutes: 1, required: true,
        slides: [{ id: "conduct-routes", source: [10], blocks: [
          { type: "heading", level: 1, text: "Raise concerns without retaliation" },
          { type: "image", media: "routes", alt: "Reporting routes: Michelle Caldwell at Michelle.caldwell@synozur.com is the primary conduct reporting contact. ReportIt@synozur.com is the out-of-band alternate if Michelle is involved or the reporter is uncomfortable contacting her; this does not guarantee independence or absolute anonymity. Security issues go to security@synozur.com." },
          { type: "text", html: `<p><strong>Full diagram text:</strong> Start: You notice something that may break the standards, a policy, or the law. For a <strong>business-conduct concern or breach</strong>, contact Michelle Caldwell at <strong>Michelle.caldwell@synozur.com</strong> (primary contact). If Michelle is involved, or you are uncomfortable contacting her, use <strong>ReportIt@synozur.com</strong> as the <strong>out-of-band alternate route</strong>. This route is not a guarantee of independence or absolute anonymity. For security issues, email <strong>security@synozur.com</strong>. Bottom notes: Good faith is enough: you don't need proof, and you don't need to investigate first. Nothing here limits lawful reporting to government or regulatory authorities.</p><p>The proposed standards prohibit retaliation for good-faith reporting. Describe what you observed, when, and where; preserve relevant records. Do not confront someone, access private accounts, obstruct review, or investigate yourself. The investigation process and non-retaliation protections still require policy-owner/legal review. ${PENDING("policy-owner/legal approval of wording preserving lawful external reporting rights")}</p>` },
        ], narration: "You can report an honest concern even if you later learn you were mistaken. For a business-conduct concern, contact Michelle Caldwell at Michelle.caldwell@synozur.com. If Michelle is involved or you are uncomfortable contacting her, ReportIt@synozur.com is the out-of-band alternate. That does not guarantee independence or absolute anonymity. Stick to observations, not guesses; you are not expected to prove the case or investigate it yourself. The investigation process and non-retaliation protections still require policy-owner and legal review. Internal channels do not take away lawful external reporting rights." }],
      },
      {
        key: "4.4", kind: "rich_text", title: "Decision and reporting reference", minutes: 1, required: true,
        source: "Deck slides 3–10; Prompt 3 concise decision-and-reporting reference",
        html: `<h2>${esc(DECISION_REFERENCE.title)}</h2><p>${esc(DECISION_REFERENCE.intro)}</p><p>Find the printable draft PDF under <strong>Course resources</strong> at the top of the course page.</p><ol>${DECISION_REFERENCE.checks.map(i => `<li><strong>${esc(i.label)}:</strong> ${esc(i.detail)}</li>`).join("")}</ol><h3>Where to raise a concern or ask</h3><table><thead><tr><th>Need</th><th>Route</th></tr></thead><tbody>${DECISION_REFERENCE.reporting.map(i => `<tr><td>${esc(i.need)}</td><td>${esc(i.route)}</td></tr>`).join("")}</tbody></table><p>${esc(DECISION_REFERENCE.reminder)}</p>`,
         resources: [{ id: "conduct-decision-reference", title: "Decision and reporting reference (draft)", description: "One-page decision checklist and confirmed reporting contacts. Policy approval and an attestation-questions contact remain unresolved.", filename: "Synozur-Decision-and-Reporting-Reference-Business-Conduct-DRAFT.pdf", mimeType: "application/pdf", mediaFile: "decision-and-reporting-reference-business-conduct.pdf" }],
      },
    ],
  },
  {
    title: "Knowledge check and attestation",
    description: "Complete the graded check, review the proposed standards, then acknowledge separately.",
    lessons: [
      {
        key: "5.1", kind: "quiz", title: "Final knowledge check", minutes: 3, required: true, practice: false, passingScore: 85,
        source: "Deck slides 12–16 (original Q01–Q05); Prompt 3 (Q06–Q08)",
        introHtml: "<p>Answer all eight equally weighted questions. The passing score is 85%; seven correct answers score 87.5% (shown as 88%), so one wrong answer is allowed. After submitting, read the feedback, revisit the named lessons, and retry as needed. The typed-name attestation is separate.</p>",
        questions: [
          question("q1", "A relative owns a supplier you are evaluating. What should you do?", [
            "Disclose the relationship before participating and follow the mitigation decision.", "Participate without disclosure if the price is good.", "Ask a colleague to submit your preferred choice secretly.", "Wait to disclose until the contract is signed.",
          ], "a", ["Early disclosure permits impartial review.", "Price does not erase a conflict.", "A proxy hides rather than resolves the relationship.", "Disclosure after signing comes too late."], "A good price, a proxy, or a late disclosure cannot replace impartial review. A relationship is not itself wrongdoing, but it must be disclosed before participation.", "Disclose conflicts before acting", "Deck slide 12 (SYN-CON-2026-Q01); notes: A"),
          question("q2", "A vendor offers an expensive trip during a live selection and asks for secrecy. What is best?", [
            "Accept because no money changes hands.", "Accept if it happens outside work hours.", "Split the expense into small entries.", "Decline or pause and report it for review.",
          ], "d", ["Noncash travel can influence a decision.", "Outside hours do not remove a selection conflict.", "Splitting hides the true cost.", "Review addresses timing, influence, and secrecy."], "Travel can be improper influence without cash or work hours; splitting an expense conceals it. Secrecy during a live selection calls for review.", "Do not trade favors for business", "Deck slide 13 (SYN-CON-2026-Q02); notes: D"),
          question("q3", "A manager asks you to backdate an approval to make an audit record look complete. What is best?", [
            "Do it because the manager is accountable.", "Decline; keep the record accurate and raise the concern.", "Delete the incomplete record.", "Ask AI to create a plausible earlier record.",
          ], "b", ["A manager's authority does not make a false date true.", "Accuracy and reporting preserve the sequence.", "Deleting the record conceals the gap.", "Invented AI evidence is still false."], "A senior request cannot justify a false date; deletion or invented AI evidence hides the actual sequence. Preserve the original and raise the concern.", "Keep records and claims accurate", "Deck slide 14 (SYN-CON-2026-Q03); notes: B"),
          question("q4", "You believe the primary conduct reporting contact may be involved. What is best?", [
            "Stay silent until you have proof.", "Post the allegation publicly.", "Use the out-of-band alternate route and describe the facts.", "Investigate their private accounts yourself.",
          ], "c", ["Good faith does not require proof.", "A public post is not the reporting route; lawful external reporting rights remain.", "ReportIt@synozur.com is the out-of-band alternate if the primary contact is involved or you are uncomfortable contacting them; this does not guarantee independence or absolute anonymity.", "Private-account access is not an employee investigation task."], "Silence until proof and accessing private accounts both place the burden on you; a public post does not replace the reporting route. Use ReportIt@synozur.com as the out-of-band alternate if the primary contact is involved or you are uncomfortable contacting them. This does not guarantee independence or absolute anonymity. Lawful external reporting rights remain.", "Raise concerns without retaliation", "Deck slide 15 (SYN-CON-2026-Q04); notes: C"),
          question("q5", "An AI draft says Synozur is NIST-certified, but you have no supporting evidence. What is best?", [
            "Remove or correct the claim and obtain an approved, evidence-based description.", "Keep it because an AI system wrote it.", "Keep it if a training course was completed.", "Publish it first and verify later.",
          ], "a", ["An accountable owner must verify scope and evidence.", "AI authorship does not verify a claim.", "Training completion is not certification.", "Publication before verification risks misleading the client."], "Neither an AI draft, course completion, nor a later fact-check supports a certification statement. Claims need verified evidence and authorized wording before use.", "Verify commitments and AI-assisted claims", "Deck slide 16 (SYN-CON-2026-Q05); notes: A"),
          question("q6", "A team wants to reuse a client's workshop diagram in another client's proposal. What should happen first?", [
            "Remove the first client's logo and reuse the diagram.", "Confirm client permission, ownership and any embedded third-party license before reuse.", "Reuse it because the original team created the slide.", "Share it only with the new client under an NDA.",
          ], "b", ["Removing a logo does not establish rights.", "Permission and licensing determine whether reuse is allowed.", "Creation does not override client contract rights.", "An NDA does not grant reuse rights."], "A removed logo, team authorship, and an NDA do not settle client or third-party rights. Confirm permission and licenses before reusing the work.", "Protect client trust and compete fairly", "Prompt 3: permission and licensing before reusing client work"),
          question("q7", "A colleague tells you in good faith about a workplace concern and asks how to raise it. What is an appropriate response?", [
            "Tell them you can guarantee complete anonymity.", "Ask them to investigate and collect proof before anyone will listen.", "Listen without retaliation and point them to Michelle Caldwell or, if appropriate, the out-of-band alternate; preserve relevant facts.", "Tell the subject immediately so they can resolve it privately.",
          ], "c", ["Do not promise absolute anonymity.", "They do not need proof or an independent investigation.", "Support a good-faith report without taking over the investigation; the alternate is not a guarantee of independence or absolute anonymity.", "Confronting the subject may obstruct a fair review."], "Promises of absolute anonymity, demanding proof, or confronting someone can undermine safe reporting. Support a good-faith account and share the primary contact or out-of-band alternate route as appropriate.", "Raise concerns without retaliation", "Prompt 3: responding after a colleague raises a concern"),
          question("q8", "A competitor accidentally sends you a file labeled confidential with proposed bid prices. What should you do?", [
            "Use the figures because the competitor sent the file voluntarily.", "Forward it to the sales team for comparison.", "Stop reviewing and forwarding it, preserve the facts, and seek guidance through the approved route.", "Delete every trace and say nothing.",
          ], "c", ["Accidental receipt is not permission to use confidential data.", "Forwarding spreads restricted information.", "Responsible owners can assess the receipt without further distribution.", "Deleting the record hides facts needed for review."], "Accidental receipt grants no permission to use or circulate bid data; deleting every trace hides the facts. Stop distribution and seek guidance.", "Protect client trust and compete fairly", "Prompt 3: receiving confidential competitor information"),
        ],
      },
      {
        key: "5.2", kind: "rich_text", title: "Before you sign", minutes: 1, required: true,
        source: "Deck slide 17 acknowledgement and notes; slide 20 policy precedence",
        html: `<h2>Before you sign</h2><p>Everyone is expected to complete this acknowledgement. Review the proposed standards in this course, the applicable <a href="${LINKS.it}" target="_blank" rel="noopener noreferrer">IT Policies page</a>, the <a href="${LINKS.library}" target="_blank" rel="noopener noreferrer">Active Policy Library</a> for the current Security Policy (document and effective status to confirm), and client terms. ${PENDING("approval status of the Standards of Business Conduct and final approved code")} The IT policies and proposed conduct guidance are distinct. The attestation wording itself is still subject to ${PENDING("policy-owner/legal approval of exact attestation wording")}.</p><p>Type your own full name to sign. This acknowledges responsibilities; it is not a declaration that you have never made a mistake. If you need clarification, contact ${PENDING("contact for attestation questions")}. An attestation remains incomplete until signed. Do not enter sensitive concern details in a training record.</p><p>Orion stores the exact signed statement, your typed name, account, date and time, IP address, and browser user agent with the attestation.</p>`,
      },
      { key: "5.3", kind: "attestation", title: "Annual acknowledgement", minutes: 1, required: true, source: "Deck slide 17, verbatim proposed acknowledgement wording", statement: ATTESTATION_STATEMENT },
    ],
  },
  {
    title: "Reference",
    description: "Optional policy and framework links.",
    lessons: [{
      key: "6.1", kind: "rich_text", title: "Policies and sources", minutes: 1, required: false,
      source: "Deck slide 20, learner-safe references; slide 19 framework context",
      html: `<h2>Policies and sources</h2><p>These proposed conduct standards require approval; Synozur's applicable policies and contracts govern. If guidance conflicts, pause and ask the responsible owner. Frameworks support security and privacy awareness, not a business-conduct code or organizational certification.</p><ul><li><a href="${LINKS.site}" target="_blank" rel="noopener noreferrer">Policies and Procedures site</a>: the main organization policy site.</li><li><a href="${LINKS.library}" target="_blank" rel="noopener noreferrer">Active Policy Library</a>: find the current Security Policy and other applicable policies (confirm the document and effective status before release).</li><li><a href="${LINKS.it}" target="_blank" rel="noopener noreferrer">IT Policies page</a>: find the current IT requirements, including authorized tools, AI and IT support (revision to confirm).</li><li><a href="${LINKS.csf}" target="_blank" rel="noopener noreferrer">NIST CSF 2.0</a>: cybersecurity governance and awareness.</li><li><a href="${LINKS.privacy}" target="_blank" rel="noopener noreferrer">NIST Privacy Framework 1.0</a>: privacy risk management, distinct from CSF.</li><li><a href="${LINKS.cui}" target="_blank" rel="noopener noreferrer">NIST SP 800-171 Rev. 3</a>: CUI safeguards where a contract brings them into scope; confirm the governing revision and contract before asserting applicability. Not all confidential client data is CUI.</li></ul>`,
    }],
  },
];

export const course: CourseSpec = {
  slug: "synozur-standards-of-business-conduct-annual-training",
  title: "Synozur Standards of Business Conduct: Annual Training",
  summary: "Use sound judgment, disclose conflicts, keep accurate records, respect rights, and raise concerns in good faith.",
  description: "Draft annual business-conduct awareness for Synozur staff. Proposed conduct standards are subject to policy-owner and legal approval; applicable IT policies and client terms remain distinct. Includes three ungraded situations, one eight-question final check, and a separate typed-name acknowledgement. Completion is not NIST certification.",
  tags: ["Annual training", "Business conduct", "Attestation"],
  estimatedMinutes: 19,
  passingScore: 85,
  heroMedia: "hero",
  sourceDeck: "attached_assets/Synozur_Standards_of_Business_Conduct_-_Annual_Attestation_DR_1790292453863.pptx",
  sourcePrompt: "attached_assets/Pasted-Prompt-3-Standards-of-Business-Conduct-F-Framing-Apply-_1790292447276.txt",
  modules,
  photos: PHOTOS,
};