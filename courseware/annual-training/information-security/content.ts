/**
 * Synozur Information Security: Annual Training — course source.
 * Source deck: attached_assets/Synozur_Information_Security_-_Annual_Attestation_DRAFT_1790292333253.pptx
 * (Course ID SYN-SEC-2026, v0.1 draft). Examples are fictional.
 *
 * Items written as "[TO CONFIRM BEFORE RELEASE: …]" are release blockers; see the
 * approval checklist in handoff/annual-training/information-security/.
 */
import type { CourseSpec, ModuleSpec } from "../shared/spec";

export const PENDING = (what: string) => `[TO CONFIRM BEFORE RELEASE: ${what}]`;

export const POLICY_LINKS = {
  itPolicy: "https://synozur.sharepoint.com/sites/SynozurIT/Shared%20Documents/General/IT%20Policy.docx",
  securityPolicy: "https://synozur.sharepoint.com/sites/SynozurIT/Shared%20Documents/General/Security%20Policy.docx",
  nistCsf: "https://www.nist.gov/cyberframework",
  nist800171: "https://csrc.nist.gov/pubs/sp/800/171/r3/final",
};

/** Reporting contacts. Security reporting and IT support are separate routes. */
export const REPORTING = {
  rows: [
    { need: "IT help and general support questions", contact: "ithelp@synozur.com (published IT support address)", pending: false },
    { need: "Security issues, including suspected security incidents", contact: "security@synozur.com", pending: false },
    { need: "Urgent or after-hours security incidents (24-hour route)", contact: "ITHelp@synozur.com", pending: false },
  ],
  caveat: "For security issues, including suspected incidents, report to security@synozur.com. For urgent or after-hours security incidents, use the confirmed 24-hour route ITHelp@synozur.com. Use ithelp@synozur.com for normal IT help and general support questions. The urgent route is for security incidents; it is not a route for formal privacy or legal matters.",
};

const contactTable = () =>
  `<table><thead><tr><th>For</th><th>Contact</th></tr></thead><tbody>${REPORTING.rows
    .map(r => `<tr><td>${r.need}</td><td>${r.pending ? `<strong>${r.contact}</strong>` : r.contact}</td></tr>`)
    .join("")}</tbody></table>`;

export const ATTESTATION_STATEMENT =
  "I completed this course and reviewed the applicable information security policies. I understand my responsibilities to protect accounts, devices, and information, use approved tools, and promptly report suspected incidents. I will follow those requirements and seek clarification when needed.";

export const WELCOME_SCRIPT = [
  "Hi, I’m Chris McNulty, CTO at Synozur. Every one of us handles information that clients and colleagues depend on us to protect.",
  "This course covers the decisions we make during an ordinary workday: approving a sign-in, opening a message, sharing a file, or trying a new AI tool.",
  "Some attacks look convincing. A caller may know your name and your project. A message may arrive at exactly the moment you’re expecting a document. Take the time to verify a request through a channel you trust.",
  "If you make a mistake or notice something unusual, report it promptly. You don’t need to prove an incident happened before asking for help.",
  "Work through the examples, complete the review questions, and read the attestation before signing. If anything is unclear, raise it before you acknowledge.",
];

const practiceIntro = (situation: string) =>
  `<p><strong>Practice (not graded).</strong> Choose what you would do, then submit to see feedback on each decision. These answers don’t affect your final knowledge check, and you can retry as often as you like.</p><p><strong>The situation (fictional):</strong> ${situation}</p>`;

const modules: ModuleSpec[] = [
  {
    title: "Welcome and responsibilities",
    description: "Why security is part of everyday work, what this course covers, and what it doesn’t.",
    lessons: [
      {
        key: "1.1",
        kind: "slides",
        title: "Welcome from Chris McNulty",
        minutes: 2,
        required: false,
        activityType: "video",
        slides: [
          {
            id: "sec-welcome",
            source: [1],
            blocks: [
              { type: "heading", level: 1, text: "Welcome from Chris McNulty" },
              {
                type: "image",
                media: "poster",
                alt: "Poster reading “Welcome from Chris McNulty. Introduction video coming soon,” with the Synozur Alliance logo.",
              },
              { type: "video-slot", posterMedia: "poster", caption: "Welcome from Chris McNulty" },
              {
                type: "callout",
                tone: "info",
                html: "<p><strong>Video placeholder.</strong> Chris’s recorded welcome will appear here. Until then, read the draft transcript below. This lesson is optional and doesn’t count toward course completion.</p>",
              },
              { type: "heading", level: 2, text: "Draft transcript" },
              { type: "text", html: WELCOME_SCRIPT.map(p => `<p>${p}</p>`).join("") },
            ],
          },
        ],
      },
      {
        key: "1.2",
        kind: "slides",
        title: "Security in everyday work",
        minutes: 3,
        required: true,
        slides: [
          {
            id: "sec-objectives",
            source: [1, 2],
            blocks: [
              { type: "heading", level: 1, text: "Security in everyday work" },
              {
                type: "text",
                html: "<p>Most security decisions aren’t made by the IT team. They’re made by each of us, many times a day: approving a sign-in, opening a message, sharing a file, or trying a new tool.</p><p>By the end of this course, you’ll be able to:</p><ul><li><strong>Recognize</strong> suspicious requests and unsafe shortcuts, whether they arrive by email, chat, phone, QR code, or video.</li><li><strong>Protect</strong> your accounts, your devices, and the information clients and colleagues trust us with.</li><li><strong>Report</strong> problems promptly, including your own mistakes, without waiting for proof.</li></ul>",
              },
              {
                type: "callout",
                tone: "tip",
                html: "<p>Every example in this course is fictional. Synozur policies and client contract requirements take precedence over the summaries here.</p>",
              },
            ],
            narration:
              "Welcome. This course is about ordinary workday decisions, the moments when a few seconds of attention protect a client, a colleague, or your own account. We’ll build three habits: recognize what looks wrong, protect what you’ve been trusted with, and report early. You don’t need technical expertise for any of it.",
          },
          {
            id: "sec-cia",
            source: [3],
            blocks: [
              { type: "heading", level: 2, text: "Confidentiality, integrity, and availability" },
              {
                type: "text",
                html: "<p>Security protects three qualities of information:</p><table><thead><tr><th>Quality</th><th>What it means</th><th>Everyday example of harm</th></tr></thead><tbody><tr><td><strong>Confidentiality</strong></td><td>Only authorized people can see it.</td><td>A client file goes to the wrong recipient.</td></tr><tr><td><strong>Integrity</strong></td><td>It stays accurate and trustworthy.</td><td>Someone changes a record without authorization.</td></tr><tr><td><strong>Availability</strong></td><td>People can use it when they need it.</td><td>Ransomware locks the files a team needs.</td></tr></tbody></table>",
              },
              {
                type: "callout",
                tone: "info",
                html: "<p><strong>Keep work in approved shared systems.</strong> The responsible teams manage backups and recovery. Don’t make personal backup copies of client data, even with good intentions. During an outage, follow the continuity instructions you’re given.</p>",
              },
              {
                type: "text",
                html: "<p><strong>Reflect:</strong> which information would most disrupt your work if it were exposed, changed, or suddenly unavailable?</p>",
              },
            ],
            narration:
              "Security teams talk about confidentiality, integrity, and availability. In plain terms: the right people can see information, it stays accurate, and it’s there when it’s needed. A misaddressed file, an unauthorized edit, and a ransomware attack each break one of these. Keeping work in approved systems matters because the teams who run backups can only protect what they know about.",
          },
          {
            id: "sec-scope",
            source: [2, 18, 19],
            blocks: [
              { type: "heading", level: 2, text: "What this course covers, and what it doesn’t" },
              {
                type: "text",
                html: "<p>Completing this course supports Synozur’s security readiness and creates a record of your training. It <strong>does not</strong> certify the organization, show that every security control is in place, or replace the policies and client requirements that govern your work.</p><table><thead><tr><th>This course: everyone</th><th>Additional training: specific roles</th></tr></thead><tbody><tr><td>Recognizing suspicious requests, protecting accounts and information, using approved tools, and reporting promptly.</td><td>Privileged administrators, developers, incident responders, and data owners need further training tied to their duties.</td></tr></tbody></table>",
              },
              {
                type: "callout",
                tone: "tip",
                html: "<p>If you hold one of these roles, this course is your baseline, not your full training. Complete any role-specific training you’re assigned.</p>",
              },
            ],
            narration:
              "A word on scope. This course builds shared awareness and gives Synozur a training record. It isn’t a certification, and passing it doesn’t prove that every control is in place; that takes a separate assessment. If your job includes administering systems, writing code, responding to incidents, or owning data, you’ll need more training for those duties.",
          },
        ],
      },
    ],
  },
  {
    title: "Accounts and suspicious requests",
    description: "Protect your sign-in, recognize pressure tactics in any channel, and verify requests independently.",
    lessons: [
      {
        key: "2.1",
        kind: "slides",
        title: "Protect your accounts",
        minutes: 3,
        required: true,
        slides: [
          {
            id: "sec-identity",
            source: [4],
            blocks: [
              { type: "heading", level: 1, text: "Protect your accounts" },
              { type: "heading", level: 2, text: "Your sign-in is yours alone" },
              {
                type: "text",
                html: "<ul><li>Never share passwords, recovery codes, or a signed-in session, whether the request comes from a teammate or from someone who says they’re IT.</li><li>Use the approved password manager to create and store credentials.</li><li>Where passwords are required, follow the current company credential standards and use a unique, long passphrase for each account.</li><li>When IT provides phishing-resistant sign-in methods, use them.</li></ul>",
              },
              {
                type: "callout",
                tone: "warning",
                html: "<p><strong>Typed your password somewhere suspicious?</strong> Report it right away. Speed matters more than certainty.</p>",
              },
            ],
            narration:
              "Each account belongs to one person, so activity can be traced and access removed cleanly. Sharing a password or leaving a session open for someone breaks that link, and no one, including IT, should ask you for your password. A password manager makes unique credentials practical. When IT offers stronger sign-in methods, use them.",
          },
          {
            id: "sec-mfa",
            source: [4],
            blocks: [
              { type: "heading", level: 2, text: "Check every sign-in prompt" },
              {
                type: "text",
                html: "<p>Multi-factor authentication (MFA) adds an independent check, but it doesn’t make every sign-in legitimate.</p><ul><li>Approve a prompt only when <strong>you</strong> just started that sign-in.</li><li>Deny unexpected prompts and report them. They can mean someone already has your password.</li><li>A burst of repeated prompts can be an attack meant to wear you down.</li><li>Never read out, forward, or type in a code for someone else.</li></ul>",
              },
            ],
            narration:
              "An attacker with a stolen password still has to get past your MFA prompt. Some send prompt after prompt, hoping you’ll approve one just to make them stop. Others call and ask you to read out a code. If you didn’t just start that sign-in, don’t approve it. Deny it and tell IT, because the prompt itself is useful evidence.",
          },
          {
            id: "sec-least-privilege",
            source: [4],
            blocks: [
              { type: "heading", level: 2, text: "Use only the access you need" },
              {
                type: "text",
                html: "<p><strong>Least privilege</strong> means having only the access your role requires.</p><ul><li>Request access through the approved process. Don’t borrow someone else’s account.</li><li>Tell your manager or the system owner about access you no longer need.</li><li>Managers and system owners approve and review access. Your part is to flag what looks unnecessary.</li></ul>",
              },
              {
                type: "callout",
                tone: "tip",
                html: "<p>Unused access is still a risk. If an account is compromised, everything it can reach is exposed.</p>",
              },
            ],
            narration:
              "Least privilege sounds technical, but the idea is simple: the less an account can reach, the less damage a mistake or an attacker can do with it. When you need something new, request it properly rather than borrowing a colleague’s sign-in. When a project ends, speak up about access you no longer use.",
          },
        ],
      },
      {
        key: "2.2",
        kind: "slides",
        title: "Recognize suspicious requests",
        minutes: 2,
        required: true,
        slides: [
          {
            id: "sec-channels",
            source: [5],
            blocks: [
              { type: "heading", level: 1, text: "Recognize suspicious requests" },
              {
                type: "text",
                html: "<p>Phishing is any attempt to trick you into giving away access, information, or money. It can arrive through:</p><ul><li><strong>Email:</strong> a lookalike sender, a shared-document link, or an unexpected attachment.</li><li><strong>Chat or text message:</strong> a quick request that seems to come from a colleague or a leader.</li><li><strong>QR code:</strong> a code in an email, document, or poster that opens a sign-in page.</li><li><strong>Phone:</strong> a caller who sounds official and knows details about you or your project.</li><li><strong>Voice or video impersonation:</strong> a convincing call that looks or sounds like someone you know.</li></ul><p>Urgency, secrecy, unexpected links, QR codes, attachments, and changed payment details are all warning signs.</p>",
              },
              {
                type: "callout",
                tone: "info",
                html: "<p>A familiar name, polished writing, or a padlock icon in the browser doesn’t prove that a request is authorized.</p>",
              },
            ],
            narration:
              "Phishing isn’t just suspicious email anymore. The same tricks show up in chat, text messages, QR codes, and phone calls, and attackers can imitate a real person’s voice or even their face on a video call. So instead of asking whether something looks real, ask whether the request is expected, and whether you can confirm it another way.",
          },
          {
            id: "sec-message",
            source: [5],
            blocks: [
              { type: "heading", level: 2, text: "Spot the pressure" },
              {
                type: "image",
                media: "message",
                alt: "Annotated fictional phishing email that pretends to come from a Synozur IT service desk, with five numbered warning signs. The warning signs are listed after the image.",
                caption: "Fictional example. Names, addresses, and links are made up.",
              },
              {
                type: "text",
                html: "<p><strong>Warning signs in this example:</strong></p><ol><li><strong>Lookalike sender:</strong> the address resembles a Synozur address, but it isn’t one.</li><li><strong>Manufactured urgency:</strong> a 15-minute deadline pushes you to act before you think.</li><li><strong>Unusual request:</strong> approving a sign-in you didn’t start and installing software from a message.</li><li><strong>Secrecy:</strong> you’re told to keep your manager out of it.</li><li><strong>Disguised destination:</strong> the button and the code lead somewhere other than Synozur.</li></ol>",
              },
            ],
            narration:
              "This fictional message is built from real patterns. Look past the formal tone. The sender’s address is close to ours, but not quite. There’s a deadline measured in minutes, a request to keep it quiet, and an ask that no normal process needs. Any one of these is a reason to pause. Together, they’re a strong signal to report.",
          },
        ],
      },
      {
        key: "2.3",
        kind: "slides",
        title: "Pause, verify independently, report",
        minutes: 2,
        required: true,
        slides: [
          {
            id: "sec-decision",
            source: [5],
            blocks: [
              { type: "heading", level: 1, text: "Pause, verify independently, report" },
              {
                type: "image",
                media: "decision",
                alt: "Decision diagram: Pause, then Verify independently, which leads either to Continue through the approved process if confirmed, or to Report if it can’t be confirmed or you’ve already acted. The steps are described after the image.",
              },
              {
                type: "text",
                html: "<ol><li><strong>Pause.</strong> Does the request involve urgency, secrecy, sign-in codes, payments, software, or moving data? Slow down before you act.</li><li><strong>Verify independently.</strong> Contact the person or team through a channel you already know, such as the company directory, a saved number, or the published IT support address. Never use the number, link, or reply address in the request.</li><li><strong>Report.</strong> If you can’t confirm it, don’t act on it. Report it and keep the message. If you’ve already acted, report exactly what happened and when.</li></ol><p>If the request is confirmed and expected, continue through the normal, approved process.</p>",
              },
            ],
            narration:
              "When a request puts pressure on you, this habit keeps you in control. First, pause: urgency is a tactic. Second, verify through a channel you already trust, not one the request gives you. Third, if you can’t confirm it, or you’ve already acted, report it. Checking takes a minute. Recovering a compromised account can take weeks.",
          },
          {
            id: "sec-independent",
            source: [5],
            blocks: [
              { type: "heading", level: 2, text: "What independent verification looks like" },
              {
                type: "text",
                html: "<table><thead><tr><th>Instead of…</th><th>Do this</th></tr></thead><tbody><tr><td>Calling the number in the message</td><td>Call back using the company directory or a number you’ve saved before.</td></tr><tr><td>Replying to the email</td><td>Write a new message to the address you know, or reach the person in a separate chat.</td></tr><tr><td>Scanning the QR code or clicking the link</td><td>Open the site or app directly, the way you normally sign in.</td></tr><tr><td>Changing payment details because a leader asked on a call</td><td>Follow Finance’s payment-verification process, every time.</td></tr></tbody></table>",
              },
              {
                type: "callout",
                tone: "warning",
                html: "<p><strong>Already clicked, replied, or approved?</strong> Don’t hide it or delete anything. Report what happened and when. Early reports limit harm.</p>",
              },
            ],
            narration:
              "Independent means the contact details come from you, not from the request. If an email asks you to call a number, look the number up yourself. If a colleague’s message feels off, reach them another way. Finance follows its payment-verification process no matter who is asking. And if you’ve already clicked or answered, that’s exactly when reporting matters most.",
          },
        ],
      },
      {
        key: "2.4",
        kind: "quiz",
        title: "Practice: The urgent support call",
        minutes: 2,
        required: true,
        practice: true,
        passingScore: 0,
        source: "Deck slide 11 (practice scenario and facilitator guidance)",
        introHtml: practiceIntro(
          "It’s 8:40 a.m., twenty minutes before a client workshop. Your phone rings. The caller says they’re from Synozur IT, uses your name, and mentions the client project you’re preparing for. They say your account has been flagged and needs fixing before the workshop. While they talk, a sign-in approval request appears on your phone. They ask you to approve it and then install a remote-support tool from a link they’re sending in chat.",
        ),
        questions: [
          {
            id: "p1-q1",
            source: "Slide 11, prompt 1 (warning signs)",
            revisit: "Recognize suspicious requests",
            text: "Which details in this call are warning signs? Select all that apply.",
            answers: [
              { id: "a", text: "The caller knows your name and your project.", feedback: "Warning sign. Names and project details are often easy to find, so they don’t prove identity." },
              { id: "b", text: "The deadline before your client workshop.", feedback: "Warning sign. Time pressure is used to rush you past verification." },
              { id: "c", text: "A sign-in prompt you didn’t start.", feedback: "Warning sign. It may mean someone already has your password." },
              { id: "d", text: "A request to install remote-access software from a link.", feedback: "Warning sign. Remote-access tools can give the caller control of your device." },
              { id: "e", text: "The call comes in during working hours.", feedback: "Not a warning sign on its own. Timing tells you nothing about whether the request is legitimate." },
            ],
            correct: ["a", "b", "c", "d"],
            explanation:
              "Everything except the timing is a warning sign. Knowing your name and project doesn’t prove who someone is, because that information is often easy to find. The deadline adds pressure, a prompt you didn’t start suggests someone has your password, and remote-access software could hand over control of your device. Calls during working hours are normal, so timing alone tells you nothing.",
          },
          {
            id: "p1-q2",
            source: "Slide 11, prompt 2 (how to verify)",
            revisit: "Pause, verify independently, report",
            text: "What’s the safest next step?",
            answers: [
              { id: "a", text: "Approve the prompt so IT can fix your account before the workshop.", feedback: "This could give the caller access to your account." },
              { id: "b", text: "Ask the caller to prove who they are by describing your account.", feedback: "Still relies on the caller, who may know more about you than you’d expect." },
              { id: "c", text: "Deny the prompt, end the call, and contact IT through a channel you already know.", feedback: "Best choice. You stop the risky actions and verify through a channel you control." },
              { id: "d", text: "Install the tool, but don’t approve the prompt.", feedback: "The tool alone could give the caller control of your device." },
            ],
            correct: "c",
            explanation:
              "The safest move is to stop both risky actions and verify through a channel you choose, such as the published IT support address or the company directory. Asking the caller to prove themselves still relies on the caller. Installing the tool, even without approving the prompt, could hand over control of your device.",
          },
          {
            id: "p1-q3",
            source: "Slide 11, prompt 3 (what to report)",
            revisit: "Report early",
            text: "Suppose you had already approved the prompt before you realized. What should you do now?",
            answers: [
              { id: "a", text: "Report it immediately: what you approved, what time, and anything else the caller asked you to do.", feedback: "Best choice. Responders need these facts quickly to end sessions or reset credentials." },
              { id: "b", text: "Change your password and say nothing, since the problem is fixed.", feedback: "A password change alone may not remove an attacker’s access, and responders stay unaware." },
              { id: "c", text: "Call the number back to find out who they really are.", feedback: "Investigating the caller yourself can make things worse. Leave it to responders." },
              { id: "d", text: "Wait to see whether anything unusual happens in your account.", feedback: "Waiting gives an attacker time. You don’t need proof before reporting." },
            ],
            correct: "a",
            explanation:
              "Report straight away with the facts: the time, what you approved, and what you were asked to do. Responders may need to end sessions or reset credentials, and changing your password alone may not remove an attacker’s access. Don’t investigate the caller yourself.",
          },
        ],
      },
    ],
  },
  {
    title: "Safe tools, devices, and sharing",
    description: "Keep devices protected wherever you work, use approved tools and AI correctly, and share client work through approved routes.",
    lessons: [
      {
        key: "3.1",
        kind: "slides",
        title: "Devices and remote work",
        minutes: 3,
        required: true,
        slides: [
          {
            id: "sec-devices",
            source: [7],
            blocks: [
              { type: "heading", level: 1, text: "Devices and remote work" },
              {
                type: "image",
                media: "photoRemote",
                alt: "A woman working on a laptop at a kitchen counter at home. The laptop screen isn’t visible.",
                caption: "Working from anywhere depends on a protected device and a private workspace.",
              },
              {
                type: "text",
                html: "<ul><li>Use approved, managed devices for Synozur and client work. A personal device may be used for business only if it’s approved and meets company requirements.</li><li>Install required updates promptly. Never disable security software or controls.</li><li>Don’t connect unknown USB drives or other removable media.</li><li>If you see a malware alert or your device behaves strangely, report it and follow IT’s instructions. Don’t try to clean it up yourself.</li></ul>",
              },
            ],
            narration:
              "Your laptop is one of the most important security tools you have. Managed devices get updates and protections IT can rely on, so install updates when they’re due and leave the security software alone, even when it’s inconvenient. If something looks wrong, report it and let IT guide the cleanup. Well-meant fixes can destroy evidence.",
          },
          {
            id: "sec-workspace",
            source: [7],
            blocks: [
              { type: "heading", level: 2, text: "Protect your workspace, wherever it is" },
              {
                type: "text",
                html: "<ul><li>Lock your screen whenever you step away, even at home.</li><li>In public or shared spaces, notice who can see your screen or hear your calls, and take care with printers and meeting recordings.</li><li>Use approved connections and remote-access methods. Don’t use shared or public computers for work.</li><li>Secure devices and papers when you’re not using them. At offices and client sites, verify visitors and follow the site’s access rules.</li></ul>",
              },
              {
                type: "callout",
                tone: "tip",
                html: "<p>Taking a client call on a train or in a café is a confidentiality decision too. Move somewhere private, or save the details for later.</p>",
              },
            ],
            narration:
              "With remote work, the workspace moves with you: the kitchen table, a hotel lobby, a client site. Think about who can see your screen or overhear a call, and lock your device every time you step away. Stick to approved connections and remote-access tools, and keep work off shared or public computers.",
          },
          {
            id: "sec-lost-device",
            source: [7],
            blocks: [
              { type: "heading", level: 2, text: "Lost or stolen equipment is urgent" },
              {
                type: "text",
                html: "<p>Report a missing laptop, phone, or security key <strong>immediately</strong>, even if it’s encrypted and even if you think it will turn up.</p><p>A quick report lets responders lock or wipe the device, end its sessions, and check what it could reach. Include:</p><ul><li>what’s missing, and whether it was locked or signed in,</li><li>when and where you last had it,</li><li>what client or company information it held or could access.</li></ul>",
              },
              {
                type: "callout",
                tone: "info",
                html: "<p>Encryption protects the stored data. It doesn’t cover open sessions, saved sign-ins, or the time an attacker has before access is revoked.</p>",
              },
            ],
            narration:
              "If a device goes missing, report it straight away, before you’ve searched everywhere. Encryption helps, but responders may still need to sign the device out of accounts, lock it remotely, or check what it could reach. A report that turns out to be unnecessary costs a few minutes. A late one can cost much more.",
          },
        ],
      },
      {
        key: "3.2",
        kind: "slides",
        title: "Approved tools and AI",
        minutes: 2,
        required: true,
        slides: [
          {
            id: "sec-ai-approval",
            source: [6],
            blocks: [
              { type: "heading", level: 1, text: "Approved tools and AI" },
              {
                type: "text",
                html: "<ul><li>Use authorized business tools with your approved work account, not a personal account.</li><li>A free trial, a browser extension, or a colleague’s recommendation isn’t approval.</li><li>Approval covers a specific tool, account, and use. It doesn’t cover every kind of data, so check what the approval allows.</li><li>Before uploading, check the client, the purpose, and any restrictions, including client rules about AI use and disclosure.</li><li>For a new tool or a new use, ask IT for a review first.</li></ul>",
              },
              {
                type: "callout",
                tone: "info",
                html: "<p>The IT Policy lists the approved AI tools and how they may be used. Experimental tools must not receive Synozur or client data. Check the current policy rather than a list you remember.</p>",
              },
            ],
            narration:
              "New tools appear every week, and many are genuinely useful. The question isn’t whether a tool is good. It’s whether it’s approved, on this account, for this kind of data. A free trial or a sign-up with your work email doesn’t make a tool approved. Clients may also have their own rules about AI, so check those before you start.",
          },
          {
            id: "sec-ai-accountable",
            source: [6],
            blocks: [
              { type: "heading", level: 2, text: "You’re still accountable for the result" },
              {
                type: "text",
                html: "<ul><li>Review AI output for accuracy and confidentiality before you share it outside Synozur.</li><li>Never use an AI tool, or any other tool, to get around a sharing control.</li><li>Be skeptical of instructions hidden in content. A document, web page, or AI response may tell you to reveal credentials or move data. Don’t act on it just because it appears there.</li><li>If a tool behaves unexpectedly or asks for more access than it should, stop and ask IT.</li></ul>",
              },
              {
                type: "callout",
                tone: "warning",
                html: "<p>A personal account doesn’t make company or client data rules go away. It only removes the protections that came with the approved account.</p>",
              },
            ],
            narration:
              "AI can draft, summarize, and suggest, but you own what you send. Check output before it reaches a client. And watch for a newer trick: instructions planted inside documents, web pages, or AI responses that ask you, or the tool, to share credentials or move data. Treat them like any other unexpected request: pause, verify, and report.",
          },
        ],
      },
      {
        key: "3.3",
        kind: "slides",
        title: "Share client work through the approved route",
        minutes: 3,
        required: true,
        slides: [
          {
            id: "sec-share-check",
            source: [8],
            blocks: [
              { type: "heading", level: 1, text: "Share client work through the approved route" },
              {
                type: "image",
                media: "photoCollab",
                alt: "Three colleagues working side by side at an outdoor table with laptops. Their screens aren’t visible.",
                caption: "Good collaboration means sharing the right thing, with the right people, in the right place.",
              },
              {
                type: "text",
                html: "<p>Before you share, check four things:</p><ul><li><strong>Recipient:</strong> is it the right person, with a current need?</li><li><strong>Business need:</strong> does this work require it?</li><li><strong>Version:</strong> is this the file you mean to send?</li><li><strong>Permission:</strong> is the access level the minimum needed, such as view rather than edit, or specific people rather than anyone with the link?</li></ul><p>Share access from the approved location rather than sending uncontrolled copies.</p>",
              },
            ],
            narration:
              "Most data exposure isn’t dramatic. It’s a file sent to the wrong person, a link anyone can open, or an old version with comments never meant for the client. A quick check of recipient, need, version, and permission prevents most of it. And a link to the approved location can be changed later; an attached copy can’t be recalled.",
          },
          {
            id: "sec-share-blocked",
            source: [8],
            blocks: [
              { type: "heading", level: 2, text: "When sharing is blocked, don’t go around it" },
              {
                type: "text",
                html: "<p>Client restrictions and company controls sometimes block a transfer. When that happens:</p><ul><li>Don’t move work to personal storage or personal email, remove labels, weaken permissions, or send screenshots instead.</li><li>Ask for an approved sharing method or an access change through the engagement lead, the client contact, or IT.</li><li>If timing is at risk, say so early. A short delay is better than an uncontrolled copy.</li></ul>",
              },
              {
                type: "callout",
                tone: "info",
                html: "<p><strong>Why personal storage isn’t a workaround:</strong> it moves client information outside the approved, monitored boundary. Synozur can’t see who opens it or revoke access, and the copy may breach the client’s contract.</p>",
              },
            ],
            narration:
              "A blocked transfer is frustrating, especially under a deadline. But the block usually exists because of a client agreement or a control that protects the data. Personal cloud storage, personal email, or screenshots can feel like a clever shortcut, yet each creates a copy nobody can track or recall. Ask for an approved route, and flag the timing risk early.",
          },
          {
            id: "sec-cui",
            source: [8],
            blocks: [
              { type: "heading", level: 2, text: "Suspected CUI needs extra review" },
              {
                type: "text",
                html: "<p>Controlled Unclassified Information (CUI) is a specific U.S. federal category of information that requires particular safeguards. It is <strong>not</strong> another name for all confidential client information.</p><ul><li>Don’t assume Synozur receives CUI, or that its standard tools are authorized for it.</li><li>If information is marked as CUI, or you suspect it might be, stop and ask before you store, share, or process it.</li><li>The contract owner and security owner confirm the scope, the approved systems, and the handling rules before work continues.</li></ul>",
              },
              {
                type: "callout",
                tone: "warning",
                html: "<p>When in doubt, pause and ask. Confirming where information may be handled is far easier before you store it than after.</p>",
              },
            ],
            narration:
              "Some government-related work involves Controlled Unclassified Information, or CUI. It’s a specific federal category with its own handling rules, not a label for everything confidential. If you see a CUI marking, or suspect information might qualify, stop before storing or sharing it and ask the contract owner or security owner.",
          },
        ],
      },
      {
        key: "3.4",
        kind: "quiz",
        title: "Practice: The blocked sharing route",
        minutes: 2,
        required: true,
        practice: true,
        passingScore: 0,
        source: "Fictional situation requested in the course prompt (deadline versus blocked client-sharing route)",
        introHtml: practiceIntro(
          "It’s 6:15 p.m. Your team’s final report is due to a client’s leadership team at 8:00 a.m. When you try to share it through the client’s approved portal, a sharing restriction blocks the upload. A teammate suggests putting it on a personal cloud drive and emailing the client a link, “just this once.”",
        ),
        questions: [
          {
            id: "p2-q1",
            source: "Prompt: blocked client-sharing route",
            revisit: "Share client work through the approved route",
            text: "Why is the personal cloud drive a problem? Select all that apply.",
            answers: [
              { id: "a", text: "It copies client work outside the approved, monitored location.", feedback: "Correct. The copy leaves Synozur’s controls." },
              { id: "b", text: "Synozur can’t control or revoke who opens the link.", feedback: "Correct. Once shared, access can’t be reliably tracked or withdrawn." },
              { id: "c", text: "It may break the client’s contractual sharing restrictions.", feedback: "Correct. Good intentions don’t change a contract." },
              { id: "d", text: "Personal cloud drives are always slower.", feedback: "Speed isn’t the issue. Control over client information is." },
            ],
            correct: ["a", "b", "c"],
            explanation:
              "The problem isn’t speed. A personal drive creates a copy outside Synozur’s control: no one can reliably see who opens it, revoke access, or delete every copy later. It may also break the client’s contract, even when the intent is to help.",
          },
          {
            id: "p2-q2",
            source: "Prompt: blocked client-sharing route",
            revisit: "Share client work through the approved route",
            text: "What’s the best next step?",
            answers: [
              { id: "a", text: "Use the personal drive, then delete the file after the meeting.", feedback: "Deleting later doesn’t undo the exposure or remove copies others made." },
              { id: "b", text: "Remove the sensitivity label so the portal accepts the file.", feedback: "Removing a label weakens a protection the client relies on." },
              { id: "c", text: "Contact the engagement lead, the client contact, or IT for an approved method or access change, and flag the timing risk now.", feedback: "Best choice. It keeps the work inside agreed controls and gives people time to help." },
              { id: "d", text: "Send screenshots of the report from your personal email.", feedback: "Screenshots from personal email are still an uncontrolled copy." },
            ],
            correct: "c",
            explanation:
              "An approved route keeps the work inside agreed controls, and raising the timing risk tonight gives people time to help. Deleting a copy later doesn’t undo the exposure, removing a label weakens a protection the client relies on, and screenshots from personal email are still an uncontrolled copy.",
          },
          {
            id: "p2-q3",
            source: "Deck slide 8 (suspected CUI review)",
            revisit: "Share client work through the approved route",
            text: "While checking the report, you notice an appendix marked “CUI.” What should you do?",
            answers: [
              { id: "a", text: "Share it anyway. CUI just means confidential.", feedback: "CUI is a specific federal category with its own rules, not a synonym for confidential." },
              { id: "b", text: "Stop and ask the contract owner or security owner how it may be handled before you store or share it.", feedback: "Best choice. They confirm scope and the approved environment." },
              { id: "c", text: "Remove the marking so it can go through the normal process.", feedback: "Never remove or ignore a CUI marking." },
              { id: "d", text: "Move it to your personal storage until the deadline passes.", feedback: "Personal storage is never an approved place for client information." },
            ],
            correct: "b",
            explanation:
              "CUI is a specific federal category with its own handling rules, and Synozur’s standard tools may not be authorized for it. The contract owner and security owner decide where it may be handled. Never remove or ignore the marking.",
          },
        ],
      },
    ],
  },
  {
    title: "Reporting and practice",
    description: "Report early, preserve the facts, leave investigation to responders, and raise concerns without making assumptions.",
    lessons: [
      {
        key: "4.1",
        kind: "slides",
        title: "Report early",
        minutes: 3,
        required: true,
        slides: [
          {
            id: "sec-report-what",
            source: [9],
            blocks: [
              { type: "heading", level: 1, text: "Report early" },
              {
                type: "text",
                html: "<p>You don’t need proof before you report. Report promptly if you notice or experience:</p><ul><li>a lost or stolen device,</li><li>an MFA prompt you didn’t start,</li><li>files shared with the wrong people,</li><li>ransomware messages or malware alerts,</li><li>unusual access or account activity,</li><li>credentials entered on a false or suspicious site, including your own mistake.</li></ul>",
              },
              {
                type: "callout",
                tone: "tip",
                html: "<p>Reporting your own mistake quickly is the responsible thing to do. The sooner responders know, the more harm they can prevent.</p>",
              },
            ],
            narration:
              "Many incidents start small: a prompt you didn’t expect, a file sent to the wrong address, a password typed into the wrong page. You don’t need to be sure something bad happened before you speak up. Deciding that is the responders’ job. And if the mistake was yours, report it anyway. Quick, honest reports keep small problems small.",
          },
          {
            id: "sec-boundary",
            source: [9],
            blocks: [
              { type: "heading", level: 2, text: "Your part and the responders’ part" },
              {
                type: "image",
                media: "boundary",
                alt: "Diagram with two columns separated by a handoff line: actions for every employee on the left and actions for authorized responders on the right. The actions are listed in the table after the image.",
              },
              {
                type: "text",
                html: "<table><thead><tr><th>You (every employee)</th><th>Authorized responders</th></tr></thead><tbody><tr><td><strong>Stop</strong> interacting with the suspicious content or activity.</td><td><strong>Contain</strong> the problem, for example by ending sessions, resetting credentials, or isolating a device.</td></tr><tr><td><strong>Report</strong> the facts: what happened, when, and what may be affected.</td><td><strong>Investigate</strong> what happened and how far it reached.</td></tr><tr><td><strong>Preserve</strong> messages, timestamps, and details. Don’t delete anything.</td><td><strong>Assess notifications</strong> with legal advisers.</td></tr><tr><td><strong>Follow</strong> responders’ instructions and share details only with them.</td><td><strong>Coordinate</strong> any contact with clients or other outside parties.</td></tr></tbody></table>",
              },
              {
                type: "callout",
                tone: "warning",
                html: "<p><strong>Don’t investigate on your own.</strong> Don’t wipe devices, revisit suspicious sites, confront anyone, or contact clients or authorities about an incident yourself.</p>",
              },
            ],
            narration:
              "When something goes wrong, there’s a clear handoff. Your part is to stop, report the facts, keep the evidence, and follow instructions. The responders’ part is to contain the problem, investigate, and decide with legal advisers whether anyone outside Synozur must be told. Good intentions, like wiping a laptop or checking a suspicious site, can destroy evidence or alert an attacker.",
          },
          {
            id: "sec-report-how",
            source: [9],
            blocks: [
              { type: "heading", level: 2, text: "How to report" },
              { type: "text", html: contactTable() },
              {
                type: "text",
                html: "<p>Include what happened, when, and what may be affected. Don’t attach extra copies of sensitive records; responders will ask for what they need. If your email or chat account may be compromised, report through an independently verified alternative.</p>",
              },
              { type: "callout", tone: "info", html: `<p>${REPORTING.caveat}</p>` },
            ],
            narration:
              "When you report, stick to the facts: what happened, when, and what might be affected. Leave sensitive files out of the first message; responders will ask for what they need. If you think your email or chat account is compromised, use a different verified channel. Report security issues, including suspected incidents, to security@synozur.com. For urgent or after-hours security incidents, use the confirmed 24-hour route ITHelp@synozur.com. Use ithelp@synozur.com for normal IT help and general support questions.",
          },
        ],
      },
      {
        key: "4.2",
        kind: "slides",
        title: "Notice misuse without making assumptions",
        minutes: 2,
        required: true,
        slides: [
          {
            id: "sec-insider-behaviors",
            source: [10],
            blocks: [
              { type: "heading", level: 1, text: "Notice misuse without making assumptions" },
              {
                type: "text",
                html: "<p>Insider-related incidents can be accidental, malicious, or the result of a compromised account. Actions that may need reporting include:</p><ul><li>unexpected bulk downloads or exports of client data,</li><li>access to information outside someone’s assigned work,</li><li>requests to get around controls, share credentials, or borrow access.</li></ul><p>One unusual action isn’t proof of wrongdoing. There may be a good reason, or the account may have been taken over.</p>",
              },
            ],
            narration:
              "Sometimes the warning sign comes from inside: a large export that doesn’t match anyone’s assignment, access to files outside a project, or a request to skip a control. It may be innocent, a mistake, or a compromised account. You don’t need to work out which. What matters is noticing the behavior and passing on the facts.",
          },
          {
            id: "sec-insider-facts",
            source: [10],
            blocks: [
              { type: "heading", level: 2, text: "Report facts, not profiles" },
              {
                type: "text",
                html: "<table><thead><tr><th>Do</th><th>Don’t</th></tr></thead><tbody><tr><td>Describe the action, the time, and the system involved.</td><td>Accuse, confront, or question the person yourself.</td></tr><tr><td>Pause any transfer you’re asked to help with, and report through the approved route.</td><td>Discuss your suspicions with colleagues or in shared channels.</td></tr><tr><td>Leave the investigation to authorized staff.</td><td>Draw conclusions from someone’s identity, health, background, or other personal characteristics.</td></tr></tbody></table>",
              },
              {
                type: "callout",
                tone: "info",
                html: "<p>Need-to-know applies inside Synozur too. Being a familiar colleague isn’t the same as being authorized.</p>",
              },
            ],
            narration:
              "When you report a concern about someone’s activity, describe what you saw, the action, the time, the system, not what you think it says about them. Never draw conclusions from a person’s identity, health, or background, and don’t confront or investigate on your own. Authorized staff will look at the facts fairly, which protects everyone, including the colleague involved.",
          },
        ],
      },
      {
        key: "4.3",
        kind: "quiz",
        title: "Practice: After a suspicious sign-in page",
        minutes: 2,
        required: true,
        practice: true,
        passingScore: 0,
        source: "Fictional situation requested in the course prompt (credentials entered on a suspicious page)",
        introHtml: practiceIntro(
          "A chat message that appears to come from a colleague says, “Here’s the updated project plan. Can you check section 3?” You click the link, a familiar-looking sign-in page opens, and you enter your work email and password. The page shows an error. A minute later, you notice the web address didn’t match the site you normally use to sign in.",
        ),
        questions: [
          {
            id: "p3-q1",
            source: "Prompt: credentials on a suspicious page",
            revisit: "Report early",
            text: "What should you do first?",
            answers: [
              { id: "a", text: "Report it immediately and follow IT’s instructions.", feedback: "Best choice. Responders can reset credentials and end sessions quickly." },
              { id: "b", text: "Close the page and hope nothing comes of it.", feedback: "Staying quiet gives an attacker time to use your password." },
              { id: "c", text: "Open the page again to check whether it’s really fake.", feedback: "Revisiting the page can expose you again. Leave investigation to responders." },
              { id: "d", text: "Wait to see whether your account shows unusual activity.", feedback: "Waiting for signs of trouble gives an attacker a head start." },
            ],
            correct: "a",
            explanation:
              "Report straight away. Responders can reset your password, end active sessions, and check for misuse, and the sooner they know, the less time an attacker has. Revisiting the page can expose you again, and waiting for signs of trouble gives an attacker a head start.",
          },
          {
            id: "p3-q2",
            source: "Prompt: credentials on a suspicious page; deck slide 9 (facts to preserve)",
            revisit: "Report early",
            text: "Which details belong in your report? Select all that apply.",
            answers: [
              { id: "a", text: "The time you entered your password.", feedback: "Useful. Timing helps responders check for misuse." },
              { id: "b", text: "The original message and link, left in place.", feedback: "Useful. Keep the evidence rather than deleting it." },
              { id: "c", text: "Which account you entered on the page.", feedback: "Useful. Name the account, but never include the password itself." },
              { id: "d", text: "Copies of the client files you had open, just in case.", feedback: "Don’t attach extra copies of sensitive records. Responders will ask for what they need." },
            ],
            correct: ["a", "b", "c"],
            explanation:
              "Responders need the time, the original message and link, and which account you entered, but never the password itself. Leave the message in place rather than deleting it or forwarding it widely. Don’t attach extra copies of client files; responders will ask for anything else they need.",
          },
          {
            id: "p3-q3",
            source: "Prompt: credentials on a suspicious page; deck slide 9 (no proof required)",
            revisit: "Report early",
            text: "A colleague says, “Don’t bother reporting it. You closed the page, so nothing happened.” How do you respond?",
            answers: [
              { id: "a", text: "Agree. Without proof of harm, a report would waste IT’s time.", feedback: "You don’t need proof. Responders decide whether harm occurred." },
              { id: "b", text: "Report anyway. You don’t need proof, and responders decide whether harm occurred.", feedback: "Best choice. Entering credentials on a suspicious page is reportable on its own." },
              { id: "c", text: "Ask the colleague to check your account for you.", feedback: "Sharing access breaks the rule that each identity belongs to one person." },
              { id: "d", text: "Change your password and delete the chat so there’s nothing to worry about.", feedback: "Deleting the chat removes evidence, and a password change alone may not be enough." },
            ],
            correct: "b",
            explanation:
              "Entering credentials on a suspicious page is reportable on its own; you don’t need evidence of damage. Letting a colleague into your account breaks the rule that identities aren’t shared, and deleting the chat removes evidence responders may need.",
          },
        ],
      },
      {
        key: "4.4",
        kind: "rich_text",
        title: "What to do first: quick reference",
        minutes: 1,
        required: true,
        source: "Deck slide 9 (reporting) and slide 5 (verification); downloadable reference requested in the course prompt",
        html: `<h2>What to do first</h2><p>Keep this short reference handy. A printable PDF version is under <strong>Course resources</strong> at the top of the course page.</p><h3>If something seems suspicious</h3><ol><li><strong>Pause.</strong> Don’t click, pay, approve, install, or share anything yet.</li><li><strong>Verify independently</strong> with a contact you already know, never the details in the request.</li><li><strong>Report</strong> anything you can’t verify.</li></ol><h3>If something has already happened</h3><ol><li><strong>Stop</strong> the risky activity.</li><li><strong>Report immediately:</strong> what happened, when, and what may be affected. You don’t need proof.</li><li><strong>Preserve</strong> messages and timestamps. Don’t delete, wipe, or investigate.</li><li><strong>Follow</strong> responders’ instructions.</li></ol><h3>Who to contact</h3>${contactTable()}<p>${REPORTING.caveat}</p>`,
        resources: [
          {
            id: "sec-what-to-do-first",
            title: "What to do first: information security quick reference",
            description: "A one-page PDF summary of what to do when something seems suspicious or has already happened, with separate contacts for security reporting, urgent or after-hours security incidents, and normal IT support.",
            filename: "Synozur-What-to-do-first-Information-Security-DRAFT.pdf",
            mediaFile: "what-to-do-first-information-security.pdf",
            mimeType: "application/pdf",
          },
        ],
      },
    ],
  },
  {
    title: "Knowledge check and attestation",
    description: "Answer eight questions, review what you’re acknowledging, and sign the annual attestation.",
    lessons: [
      {
        key: "5.1",
        kind: "quiz",
        title: "Final knowledge check",
        minutes: 4,
        required: true,
        practice: false,
        passingScore: 85,
        source: "Deck slides 12–16 (Q1–Q5); Q6–Q8 added per the course prompt",
        introHtml:
          "<p>Answer all eight equally weighted questions. You need at least 85% to pass; with eight questions, that means at least 7/8 correct (87.5%, shown as 88%).</p><p>After you submit, you’ll see feedback on each question, including the lesson to revisit if you missed it. Review those lessons, then retry as many times as you need.</p>",
        questions: [
          {
            id: "q1",
            source: "Deck slide 12 (SYN-SEC-2026-Q01)",
            revisit: "Protect your accounts",
            text: "An MFA prompt arrives when you are not signing in. What is the best response?",
            answers: [
              { id: "a", text: "Approve it to stop the notifications.", feedback: "Approving a prompt you didn’t start can let an attacker in. Repeated prompts are a known tactic to wear people down." },
              { id: "b", text: "Deny it and report the unexpected request.", feedback: "Correct. Only approve sign-ins you started, and report unexpected prompts because they can mean your password is known." },
              { id: "c", text: "Send the code to the person who called.", feedback: "Never share a code with anyone. A caller asking for one is a warning sign." },
              { id: "d", text: "Wait until the end of the week.", feedback: "Waiting gives an attacker time. Report promptly." },
            ],
            correct: "b",
            explanation:
              "Only approve a sign-in you started yourself. An unexpected prompt can mean someone already has your password, so it needs attention now: approving it, sharing a code, or waiting all give an attacker access or time. Revisit “Protect your accounts” if you missed this.",
          },
          {
            id: "q2",
            source: "Deck slide 13 (SYN-SEC-2026-Q02)",
            revisit: "Share client work through the approved route",
            text: "A client sharing restriction blocks your delivery. What should you do?",
            answers: [
              { id: "a", text: "Use personal cloud storage temporarily.", feedback: "Personal storage moves client work outside approved controls and may breach the client’s contract, even briefly." },
              { id: "b", text: "Remove the sensitivity label.", feedback: "Labels carry protections the client relies on. Removing one to get past a block is bypassing a control." },
              { id: "c", text: "Ask for an approved sharing method or access change.", feedback: "Correct. The engagement lead, client contact, or IT can arrange an approved route." },
              { id: "d", text: "Send screenshots from personal email.", feedback: "Screenshots are copies. Sending them from personal email creates an uncontrolled copy outside approved systems." },
            ],
            correct: "c",
            explanation:
              "A deadline doesn’t authorize bypassing company controls or a client’s contractual restrictions. Personal storage, removing labels, and screenshots from personal email all create copies outside approved, auditable systems. The engagement lead, the client contact, or IT can arrange an approved route. Revisit “Share client work through the approved route” if you missed this.",
          },
          {
            id: "q3",
            source: "Deck slide 14 (SYN-SEC-2026-Q03)",
            revisit: "Report early",
            text: "You entered your password on a suspicious site. What happens next?",
            answers: [
              { id: "a", text: "Report immediately and follow IT instructions.", feedback: "Correct. Fast, accurate reporting lets responders reset credentials, end sessions, and preserve evidence." },
              { id: "b", text: "Delete the message and say nothing.", feedback: "Deleting removes evidence, and silence gives an attacker time." },
              { id: "c", text: "Investigate the site yourself.", feedback: "Investigating can expose you again or alert an attacker. Leave it to responders." },
              { id: "d", text: "Wait for evidence of damage.", feedback: "You don’t need proof before reporting. Waiting lets harm spread." },
            ],
            correct: "a",
            explanation:
              "Fast, accurate reporting lets responders limit harm and preserve evidence, and you don’t need proof first. Deleting the message removes evidence, investigating the site yourself can make things worse, and waiting gives an attacker time. Revisit “Report early” if you missed this.",
          },
          {
            id: "q4",
            source: "Deck slide 15 (SYN-SEC-2026-Q04)",
            revisit: "Notice misuse without making assumptions",
            text: "A familiar colleague requests a large client export outside their assigned work. What is best?",
            answers: [
              { id: "a", text: "Assume familiarity is sufficient authorization.", feedback: "Need-to-know applies inside Synozur too. Knowing someone isn’t the same as them being authorized." },
              { id: "b", text: "Accuse them publicly of stealing.", feedback: "Accusations harm people and investigations. Report facts privately through the approved route." },
              { id: "c", text: "Ignore it because they are an employee.", feedback: "Insider-related incidents include mistakes and compromised accounts. Unusual requests still need reporting." },
              { id: "d", text: "Pause the transfer and report factual concerns through the approved route.", feedback: "Correct. Report what you observed and let authorized staff assess it." },
            ],
            correct: "d",
            explanation:
              "Need-to-know still applies internally, and familiarity isn’t authorization. Pausing and reporting observable facts, such as what was requested, when, and from which system, lets authorized staff assess it without accusations or profiling. Revisit “Notice misuse without making assumptions” if you missed this.",
          },
          {
            id: "q5",
            source: "Deck slide 16 (SYN-SEC-2026-Q05)",
            revisit: "Security in everyday work",
            text: "Does completing this awareness course demonstrate all NIST controls are implemented?",
            answers: [
              { id: "a", text: "Yes, the attestation is the certification.", feedback: "An attestation is an individual acknowledgement. It doesn’t certify the organization." },
              { id: "b", text: "No; it is one training record within a broader assessment.", feedback: "Correct. Implementation, scope, operating evidence, and role-based duties are assessed separately." },
              { id: "c", text: "Yes, if all review answers are correct.", feedback: "A perfect score shows your awareness. It says nothing about whether controls are implemented." },
              { id: "d", text: "Yes, if a manager approves completion.", feedback: "Manager approval doesn’t turn training into evidence that controls are in place." },
            ],
            correct: "b",
            explanation:
              "Course completion is one training record. Whether controls are implemented depends on a separate assessment of scope, operating evidence, and role-based duties. No score, attestation, or sign-off makes this course a certification. Revisit “Security in everyday work” if you missed this.",
          },
          {
            id: "q6",
            source: "Added per course prompt (lost managed device); deck slide 7",
            revisit: "Devices and remote work",
            text: "Your managed work laptop is missing after a client visit. It’s encrypted, and you think it will probably turn up tomorrow. What should you do?",
            answers: [
              { id: "a", text: "Wait a day, since encryption protects the data.", feedback: "Encryption protects stored data, but not open sessions or saved sign-ins. Waiting gives an attacker time." },
              { id: "b", text: "Report it right away, even though it’s encrypted.", feedback: "Correct. Responders can lock or wipe it, end sessions, and check what it could reach." },
              { id: "c", text: "Ask a colleague to sign in to your accounts to check for activity.", feedback: "Sharing access breaks the rule that each identity belongs to one person." },
              { id: "d", text: "Restore your files to a personal laptop from a personal backup.", feedback: "Personal devices and personal backups aren’t approved places for client information." },
            ],
            correct: "b",
            explanation:
              "A missing device is reported immediately, even when it’s encrypted. Responders may need to lock or wipe it, end its sessions, and check what it could reach, and encryption doesn’t cover open sessions or saved sign-ins. Sharing your sign-in or restoring files to personal equipment adds new risks. Revisit “Devices and remote work” if you missed this.",
          },
          {
            id: "q7",
            source: "Added per course prompt (unapproved AI upload); deck slide 6",
            revisit: "Approved tools and AI",
            text: "A client asks for a quick summary of a long contract. A new AI summarizer offers a free trial but isn’t an approved tool. What should you do?",
            answers: [
              { id: "a", text: "Upload the contract. A free trial is fine for one document.", feedback: "A free trial isn’t approval, and one upload still sends client content to an unapproved service." },
              { id: "b", text: "Paste in only the key sections to limit what’s shared.", feedback: "Partial content is still client information sent to an unapproved service." },
              { id: "c", text: "Use an approved tool on your work account if the client’s rules allow it, or ask IT to review the new tool first.", feedback: "Correct. Check the client’s AI rules and stay within approved tools and accounts." },
              { id: "d", text: "Upload it with a personal account so company rules don’t apply.", feedback: "A personal account doesn’t remove company or client data rules. It removes the protections of the approved account." },
            ],
            correct: "c",
            explanation:
              "A free trial isn’t approval, and a personal account doesn’t remove company or client data rules. Sharing only part of the document still sends client content to an unapproved service. Check the client’s AI rules and use an approved tool on your work account, or ask IT to review a new tool before using it. Revisit “Approved tools and AI” if you missed this.",
          },
          {
            id: "q8",
            source: "Added per course prompt (general awareness versus role-specific training); deck slides 2, 18",
            revisit: "Security in everyday work",
            text: "A colleague has just been given administrator access to a client reporting system. What security training do they need?",
            answers: [
              { id: "a", text: "Only this course, because it covers every security responsibility.", feedback: "This course is general awareness. It doesn’t cover the extra duties of privileged roles." },
              { id: "b", text: "This course plus role-specific training for administering that system.", feedback: "Correct. Administrators, developers, incident responders, and data owners need training tied to their duties." },
              { id: "c", text: "Only the client’s end-user training for the system.", feedback: "End-user training doesn’t cover administrator duties, and it doesn’t replace Synozur’s baseline course." },
              { id: "d", text: "No extra training unless an incident happens on that system.", feedback: "Role-specific training prepares people before something goes wrong, not after." },
            ],
            correct: "b",
            explanation:
              "This course builds general awareness for everyone. Privileged and specialized roles, such as administrators, developers, incident responders, and data owners, carry extra duties and need additional training for them. Waiting for an incident, or relying on end-user training, leaves those duties uncovered. Revisit “Security in everyday work” if you missed this.",
          },
        ],
      },
      {
        key: "5.2",
        kind: "rich_text",
        title: "Before you sign",
        minutes: 1,
        required: true,
        source: "Deck slide 17 (notes: clarification, no spotless-history claim) and slide 18 (record contents)",
        html: `<h2>Before you sign</h2><p>The next lesson asks you to type your full name to acknowledge your responsibilities. Please read this first.</p><h3>What you’re acknowledging</h3><p>You’re confirming that you completed this course, reviewed the applicable information security policies, and understand your responsibilities. You are <strong>not</strong> declaring that you’ve never made a mistake or been involved in an incident. You can report a concern and still sign.</p><h3>Review the policies</h3><ul><li><a href="${POLICY_LINKS.itPolicy}" target="_blank" rel="noopener noreferrer">IT Policy</a> (Rev. 17 February 2026)</li><li><a href="${POLICY_LINKS.securityPolicy}" target="_blank" rel="noopener noreferrer">Security Policy</a> (Synozur Alliance LLC IT governance and security policies)</li></ul><h3>If something is unclear</h3><p>Don’t sign yet. Your acknowledgement stays incomplete until you sign, and you can return at any time. Ask your question first: ${`<strong>${PENDING("policy owner or designated contact for attestation questions")}</strong>`}.</p><h3>What is recorded</h3><p>When you sign, Orion records the statement you acknowledged, the name you typed, your account, the date and time, and technical details such as your IP address and browser.</p>`,
      },
      {
        key: "5.3",
        kind: "attestation",
        title: "Annual acknowledgement",
        minutes: 1,
        required: true,
        source: "Deck slide 17 (proposed attestation wording, preserved verbatim)",
        statement: ATTESTATION_STATEMENT,
      },
    ],
  },
  {
    title: "Reference",
    description: "Policies and framework sources for later reference.",
    lessons: [
      {
        key: "6.1",
        kind: "rich_text",
        title: "Policies and sources",
        minutes: 1,
        required: false,
        source: "Deck slide 20 (references), learner-safe subset",
        html: `<h2>Policies and sources</h2><p>Synozur policies and client contract requirements govern your work. The framework references are educational context. They aren’t legal advice or certification.</p><h3>Synozur policies</h3><ul><li><a href="${POLICY_LINKS.itPolicy}" target="_blank" rel="noopener noreferrer">IT Policy</a>, Rev. 17 February 2026: security, authorized tools, AI, and IT support.</li><li><a href="${POLICY_LINKS.securityPolicy}" target="_blank" rel="noopener noreferrer">Security Policy</a> (Synozur Alliance LLC IT governance and security policies): access, retention, incidents, devices, and training.</li></ul><h3>Frameworks</h3><ul><li><a href="${POLICY_LINKS.nistCsf}" target="_blank" rel="noopener noreferrer">NIST Cybersecurity Framework (CSF) 2.0</a>: awareness, training, and governance outcomes.</li><li><a href="${POLICY_LINKS.nist800171}" target="_blank" rel="noopener noreferrer">NIST SP 800-171</a>: security requirements for protecting CUI in nonfederal systems. It applies only where a contract brings CUI into scope, and the governing revision depends on the contract.</li></ul><p><strong>If guidance conflicts,</strong> pause and ask the responsible owner. Don’t waive a requirement yourself.</p>`,
      },
    ],
  },
];

export const course: CourseSpec = {
  slug: "synozur-information-security-annual-training",
  title: "Synozur Information Security: Annual Training",
  summary: "Recognize suspicious requests, protect accounts and information, and report problems promptly.",
  description:
    "Annual information security training for all Synozur staff. Practical, everyday decisions: protecting your sign-in, spotting phishing in any channel, verifying requests independently, using approved devices, tools, and AI, sharing client work through approved routes, and reporting problems early.\n\nIncludes three practice situations, an eight-question knowledge check, and a typed-name annual acknowledgement.\n\nPublisher: Synozur. Course completion is a training record; it does not certify the organization.",
  tags: ["Annual training", "Information security", "Attestation"],
  estimatedMinutes: 25,
  passingScore: 85,
  heroMedia: "hero",
  sourceDeck: "attached_assets/Synozur_Information_Security_-_Annual_Attestation_DRAFT_1790292333253.pptx",
  sourcePrompt: "attached_assets/Pasted-Information-Security-F-Framing-Apply-the-shared-instruc_1790292315576.txt",
  modules,
  photos: [
    {
      key: "photoRemote",
      file: "photo-remote-work.jpg",
      title: "Business Woman",
      creator: "LinkedIn Sales Navigator",
      source: "StockSnap.io (via Openverse)",
      landingUrl: "https://stocksnap.io/photo/business-woman-CZSB4NOMYB",
      downloadedFrom: "https://cdn.stocksnap.io/img-thumbs/960w/CZSB4NOMYB.jpg",
      license: "CC0 1.0 Universal (public domain dedication)",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      retrieved: "2026-09-24",
      notes: "960 px web rendition. No attribution required; credited here as good practice. Stock model, not Synozur staff. Laptop screen not visible.",
    },
    {
      key: "photoCollab",
      file: "photo-collaboration.jpg",
      title: "Colleagues Meeting",
      creator: "Burst",
      source: "StockSnap.io (via Openverse)",
      landingUrl: "https://stocksnap.io/photo/colleagues-meeting-KPVOIKEPSG",
      downloadedFrom: "https://cdn.stocksnap.io/img-thumbs/960w/KPVOIKEPSG.jpg",
      license: "CC0 1.0 Universal (public domain dedication)",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      retrieved: "2026-09-24",
      notes: "960 px web rendition. No attribution required; credited here as good practice. Stock models, not Synozur staff. Screens are angled away and unreadable.",
    },
  ],
};
