# Course Outline — "From List to Live Dashboard: Copilot in SharePoint"

**Platform:** Orion (online course)
**Publisher:** Synozur
**Author/Instructor:** Chris McNulty, CTO, Synozur
**Format:** 6 modules, 24 lessons, ~3h 15m video + hands-on labs
**Level:** Intermediate — assumes SharePoint site ownership and a Microsoft 365 Copilot license
**Build note for the Replit agent:** this document is the content spec. Section 8 contains the brand + UI spec. Section 7 contains the required screenshot manifest.

---

## 1. Course Premise

Most SharePoint reporting stops at a list view. This course teaches the full loop: get business-critical data *into* SharePoint with AI assistance, teach Copilot *how your organization wants that data presented* by authoring a custom skill, then combine the two so a single prompt produces a live, styled HTML dashboard that reads real list data — and refreshes when the list changes.

The pattern taught is the Synozur-published `sharepoint-list-dashboard` skill from the public `chris-mcnulty/copilot-skills` repository (a single `SKILL.md` markdown file), used as the reference implementation students clone and adapt.

**What the student ships by the end:** one production SharePoint list, one custom `SKILL.md` checked into their own repo or site, and one working live HTML dashboard rendered by Copilot in SharePoint.

---

## 2. Learning Outcomes

By the end of the course a learner can:

1. Choose the right ingestion path for business-critical data — XLSX/CSV import, natural-language list creation in SharePoint, or the List agent in Copilot — and justify the choice.
2. Design list schema (column types, choice fields, calculated/derived values) that a dashboard skill can reliably consume.
3. Read and explain the anatomy of a Copilot skill file: front matter, description/trigger phrasing, instructions, output contract.
4. Adapt the Synozur `sharepoint-list-dashboard` pattern into an organization-specific skill with its own brand tokens and chart set.
5. Install/register a custom skill for Copilot in SharePoint and verify it triggers.
6. Prompt Copilot to combine the list + skill into a live HTML dashboard, and iterate on the result.
7. Govern the outcome: permissions, data freshness, sensitivity labels, and what to do when the skill misfires.

---

## 3. Prerequisites & Environment Setup (pre-module)

- Microsoft 365 tenant with Copilot in SharePoint enabled
- Site Owner rights on a practice site (a personal or sandbox site is fine)
- Provided sample dataset (see Section 6 — course assets)
- A GitHub account (optional; for versioning the skill file)
- Browser only — no Visual Studio, no PowerShell required for the core path

**Lesson 0.1** — What "live" means here, and what it doesn't. Setting expectations: this is a Copilot-rendered HTML artifact bound to list data, not a Power BI replacement. When to use each.

---

## 4. Module-by-Module Outline

### Module 1 — Orientation: The Three-Part Pattern (20 min)

**1.1 Why list → skill → dashboard** *(video, 5 min)*
The mental model. A list is the *data contract*. A skill is the *presentation contract*. The prompt is the *assembly step*. Diagram-driven.

**1.2 Tour of the finished artifact** *(video, 6 min)*
Show the end state first: the completed dashboard with KPI tiles, a status breakdown, a trend chart, and a drill table. Click through it so learners know what they're building toward.

**1.3 Where Copilot in SharePoint fits** *(video, 5 min)*
Copilot in SharePoint vs. Copilot Chat vs. Copilot Cowork vs. agents. Which surface accepts custom skills, and where the `SKILL.md` lives.

**1.4 Course project brief** *(reading)*
The scenario used throughout: a consulting delivery portfolio — engagements with status, owner, client, value, health, and dates. Every module advances this one artifact.

---

### Module 2 — Getting Business-Critical Data Into SharePoint (45 min)

**2.1 What makes data "dashboard-ready"** *(video, 7 min)*
Column types that chart well vs. those that don't. Choice over free text for anything you'll group by. Dates as real Date columns. Numbers as Number/Currency, never text. Single source of truth per fact. Consistent, machine-friendly column names — and why renaming a column later breaks a skill that references it.

**2.2 Path A — Import from Excel or CSV** *(video + lab, 12 min)*
- Preparing the file: header row, one table per sheet, no merged cells, no total rows
- `From Excel` / `From CSV` on the New List flow
- Reviewing and correcting the inferred column types during import — the highest-leverage 30 seconds in the whole course
- Post-import cleanup: converting text to Choice, fixing date formats, adding an index-friendly Title
- **Lab:** import the provided `engagements.xlsx`, correct three deliberately-wrong inferred types

**2.3 Path B — Natural-language list creation in SharePoint** *(video + lab, 10 min)*
- Describing the list you want in plain language and letting SharePoint generate schema
- Prompt anatomy: entity + fields + types + sample values
- Worked example prompt with a before/after schema
- Editing the generated schema rather than accepting it wholesale
- **Lab:** generate a `Client Health Signals` list from a written prompt

**2.4 Path C — The List agent in Copilot** *(video + lab, 10 min)*
- Invoking the List agent and what it can do that the other two paths can't: iterative refinement, adding columns conversationally, populating and correcting rows in place
- Using it to enrich an existing list rather than create a new one
- Guardrails: reviewing agent-made schema changes before they hit production data
- **Lab:** use the agent to add a computed-style "Health" choice column and backfill values

**2.5 Choosing your path — decision guide** *(reading + downloadable one-pager)*
Matrix: existing file / no file, one-time vs. iterative, schema certainty, volume, governance posture.

**2.6 Locking the data contract** *(video, 6 min)*
Documenting the internal column names, freezing them, and why the skill file should reference internal names. Setting the default view. Permissions and sensitivity labels *before* anyone builds on top of the list.

---

### Module 3 — Anatomy of a Copilot Skill (40 min)

**3.1 What a custom skill actually is** *(video, 6 min)*
A markdown file. That's it. Name, description, instructions. How Copilot decides to load it, and why the description field is the single most important line in the file.

**3.2 Walkthrough — the Synozur `sharepoint-list-dashboard` skill** *(video, 12 min)*
Open the published `SKILL.md` from `github.com/chris-mcnulty/copilot-skills` (path: `sharepoint/sharepoint-list-dashboard/`) side-by-side with the rendered output. Read it top to bottom:
- Front matter: `name`, `description`, trigger vocabulary
- The data-access section: how the skill tells Copilot to read list items
- The layout contract: KPI row, chart region, detail table
- The styling block: colors, type, spacing tokens
- The output contract: self-contained HTML, no external dependencies, what "self-contained" buys you
- The failure guidance: what the skill says to do when a column is missing or empty

**3.3 Trigger design — making a skill fire when you want it to** *(video, 7 min)*
Writing descriptions that match how colleagues actually phrase requests. Positive triggers, negative triggers ("do NOT use for…"), and testing trigger phrases. The most common failure in custom skills is a skill that never loads.

**3.4 Other patterns worth borrowing** *(video, 6 min)*
Survey the rest of the repo and comparable public patterns: report skills, brand skills, data-shaping skills. What to lift: the output contract and the styling block. What to rewrite: everything data-specific.

**3.5 Fork it — build your own skill file** *(lab, 9 min)*
Copy the pattern, rename it, point it at *your* list, swap the palette to your brand tokens, add one chart the original doesn't have. Deliverable: a working `SKILL.md`.

---

### Module 4 — Installing and Testing the Skill (30 min)

**4.1 Where skills live** *(video, 8 min)*
Registering a custom skill for Copilot in SharePoint. File placement, naming, and the site/scope decision — who gets the skill and who doesn't.

**4.2 Versioning in GitHub (optional but recommended)** *(video, 6 min)*
Why a skill belongs in source control. Repo structure mirroring the Synozur repo. Change review for skills that touch business-critical data.

**4.3 The trigger smoke test** *(video + lab, 8 min)*
Five phrasings, one skill. Confirming it loads. Reading the response for evidence the skill was actually used vs. Copilot improvising.

**4.4 Debugging a skill that won't fire or won't behave** *(video, 8 min)*
Symptom → cause table: never triggers (description problem), triggers but ignores instructions (instructions too vague/too long), produces the wrong columns (data contract drift), produces unstyled output (styling block not explicit enough). Fix each on camera.

---

### Module 5 — Building the Live HTML Dashboard (50 min)

**5.1 The assembly prompt** *(video, 8 min)*
Combining list + skill in one request: name the list, name the outcome, let the skill supply the how. Good vs. bad assembly prompts, shown side by side.

**5.2 First render** *(video + lab, 10 min)*
Run it. Inspect what came back. Verify every number against the list before trusting a single tile.

**5.3 Iterating on the output** *(video + lab, 12 min)*
Refinement prompts that work: change a chart type, add a segment, re-rank, filter to a date window, add a KPI. Refinement prompts that don't: vague aesthetic requests. Teaching learners to iterate on the *skill* when a correction is permanent, and on the *prompt* when it's one-off.

**5.4 Making it genuinely live** *(video, 10 min)*
What refreshes and what doesn't. Re-running against changed list data. Where the artifact is stored and how colleagues open it. Embedding the result on a SharePoint page. The honest limits — and the escalation path to Power BI when you've outgrown this.

**5.5 Styling the dashboard on brand** *(video + lab, 10 min)*
Pushing brand tokens through the skill rather than the prompt so every dashboard the team produces looks the same. Colors, type scale, tile geometry, chart palette, accessible contrast.

---

### Module 6 — Governance, Scale, and Handoff (30 min)

**6.1 Permissions and the trimming question** *(video, 7 min)*
The dashboard reflects what the *requesting user* can see. What that means for aggregate accuracy and for sharing a rendered artifact with someone who has narrower rights.

**6.2 Sensitivity labels and data-loss guardrails** *(video, 6 min)*
Labeled content, protected columns, and what to expect when policy blocks Copilot from reading something.

**6.3 Scaling the pattern across a team** *(video, 8 min)*
One skill, many lists. Parameterizing by list name. A skill library and who owns it. Review cadence when schemas drift.

**6.4 Capstone brief** *(assignment)*
Build a dashboard end-to-end from a dataset the learner brings: import, adapt skill, render, embed on a page, write a five-line README explaining the data contract. Rubric provided.

**6.5 Where to go next** *(video, 5 min)*
Adjacent skills: declarative agents, Power BI handoff, list formatting, Copilot Cowork for cross-source work.

---

## 5. Assessment Design

| Module | Assessment | Type |
|---|---|---|
| 2 | Data contract quiz — classify 8 columns as dashboard-ready or not | 8-question knowledge check |
| 3 | Skill anatomy match — label the parts of a `SKILL.md` | Drag-and-drop / labeling |
| 4 | Debugging scenario — four symptoms, pick the cause | Scenario multiple-choice |
| 5 | Prompt critique — rank four assembly prompts, justify the winner | Short answer, peer-reviewed |
| 6 | Capstone — full end-to-end build | Rubric-scored submission |

**Rubric dimensions for the capstone:** data contract quality (25), skill file quality (25), dashboard accuracy vs. source data (25), brand/accessibility compliance (15), documentation (10).

---

## 6. Course Assets to Produce

- `engagements.xlsx` — 60-row sample dataset with three deliberately-wrong column types for the import lab
- `client-health-signals.csv` — second dataset for the natural-language and List agent labs
- `SKILL.md` starter — a stripped teaching version of the Synozur pattern with `TODO` markers
- `SKILL.md` complete — the finished reference version
- Path-selection one-pager (PDF download, Module 2.5)
- Prompt library — assembly and refinement prompts, copy-paste ready
- Capstone rubric (PDF)
- Glossary — skill, agent, data contract, self-contained HTML, trimming

---

## 7. Screenshot Manifest (for the Replit build)

Every screenshot should be captured at 1600×1000 or wider, light theme, with tenant/user identifiers blurred and any real client names replaced with the fictional course data. Numbered to match the lesson.

### Module 1
1. **1.2-a** — The finished dashboard, full view (hero image; also use as the course card)
2. **1.2-b** — Same dashboard, close crop of the KPI tile row
3. **1.2-c** — The dashboard drill table with a filter applied
4. **1.3-a** — The Copilot pane open on a SharePoint site, showing entry point placement

### Module 2
5. **2.1-a** — List settings showing column types, with Choice/Date/Currency columns visible
6. **2.1-b** — Side-by-side: a "bad" list (free-text status, text dates) vs. a "good" list
7. **2.2-a** — The New List dialog with the "From Excel" / "From CSV" options highlighted
8. **2.2-b** — The prepared Excel file — clean header row, no merged cells
9. **2.2-c** — The import preview screen showing inferred column types with the type dropdown open
10. **2.2-d** — Corrected import preview, all three wrong types fixed (annotate the diffs)
11. **2.2-e** — The resulting list after import, default view
12. **2.3-a** — The natural-language list creation entry point
13. **2.3-b** — The typed prompt in full, before submission
14. **2.3-c** — The generated schema preview
15. **2.3-d** — Editing a generated column before accepting
16. **2.4-a** — Invoking the List agent in Copilot
17. **2.4-b** — Conversational exchange adding a Health column
18. **2.4-c** — The agent's proposed change awaiting review (emphasize the review step)
19. **2.4-d** — The list after enrichment, Health column populated
20. **2.6-a** — List permissions panel
21. **2.6-b** — Sensitivity label applied to the list/site
22. **2.6-c** — Internal column names visible (the "data contract" screenshot)

### Module 3
23. **3.2-a** — The GitHub repo tree at `sharepoint/sharepoint-list-dashboard`
24. **3.2-b** — `SKILL.md` open in GitHub, front matter visible
25. **3.2-c** — The instructions section, scrolled
26. **3.2-d** — The styling/output-contract section
27. **3.2-e** — Split view: skill file on the left, rendered dashboard on the right (annotate 3 lines → 3 visual outcomes)
28. **3.3-a** — A description field annotated with positive and negative trigger phrases
29. **3.4-a** — The wider repo listing showing sibling skill patterns
30. **3.5-a** — A learner's forked skill file with brand colors swapped (annotate the changed lines)

### Module 4
31. **4.1-a** — The skill file placed in its registration location
32. **4.1-b** — Scope/audience configuration
33. **4.2-a** — GitHub repo structure for a personal skill library
34. **4.2-b** — A pull request diff on a skill file
35. **4.3-a** — Five trigger phrases tested, results grid
36. **4.3-b** — A response showing evidence the skill loaded
37. **4.4-a** — Failure state: skill didn't trigger (generic Copilot answer instead)
38. **4.4-b** — Failure state: unstyled output
39. **4.4-c** — Failure state: wrong/missing columns from schema drift
40. **4.4-d** — The corrected render after the fix

### Module 5
41. **5.1-a** — A strong assembly prompt, typed in the Copilot box
42. **5.1-b** — A weak assembly prompt beside its poor output
43. **5.2-a** — The first render, immediately after generation
44. **5.2-b** — Verification view: dashboard tile next to the list total it should match
45. **5.3-a** — Refinement prompt: change a chart type
46. **5.3-b** — Before/after of that refinement
47. **5.3-c** — Refinement adding a KPI tile
48. **5.4-a** — List updated with a new row
49. **5.4-b** — Dashboard re-run reflecting the new row (pair with 5.4-a as a before/after)
50. **5.4-c** — The dashboard artifact embedded on a SharePoint page
51. **5.5-a** — Brand tokens block inside the skill file
52. **5.5-b** — The same dashboard rendered with the brand palette applied
53. **5.5-c** — Contrast checker result on the chart palette

### Module 6
54. **6.1-a** — Two users, two permission levels, two different dashboard results
55. **6.2-a** — A policy-blocked response in Copilot
56. **6.3-a** — A skill library with several skills listed
57. **6.4-a** — An exemplar capstone submission

### Supporting diagrams (illustrations, not screenshots — build as vector)
- **D1** — The three-part pattern: List → Skill → Dashboard
- **D2** — Ingestion decision tree for the three data paths
- **D3** — `SKILL.md` anatomy, exploded and labeled
- **D4** — Data-contract drift: what breaks when a column is renamed
- **D5** — Permission trimming, visualized

---

## 8. Brand & UI Spec for the Orion Build

### Colors

| Token | Hex | Use |
|---|---|---|
| Purple (primary) | `#810FFB` | Primary actions, active nav, links, progress fill |
| Magenta (accent) | `#E60CB3` | Accents, highlights, secondary chart series, badges |
| Deep purple | `#6003C3` | Headers, hover/pressed states, deep backgrounds |
| Ink | `#111111` | Body text |
| White | `#FFFFFF` | Surfaces |

Use purple → magenta gradients sparingly (hero, module cards, progress bars) — deep purple as the anchor for large filled areas. Verify every text/background pairing against WCAG AA; white-on-`#810FFB` passes at normal body size, but avoid `#E60CB3` for small body text.

### Typography

**Primary typeface: Avenir Next LT Pro.** This is deliberately *not* "Avenir Next" — Avenir Next is the system face bundled with macOS/iOS and is not a licensed web equivalent. The Orion build must reference the licensed **Avenir Next LT Pro** family (self-hosted webfont files under a valid license), not a system-font lookup.

- CSS stack: `"Avenir Next LT Pro", "Avenir Next World", "Nunito Sans", "Segoe UI", system-ui, sans-serif`
- Do **not** add `Avenir Next` alone to the stack as a fallback — it renders only on Apple devices and produces inconsistent cross-platform metrics
- Weights: Light (300) for large display, Regular (400) body, Demi (600) subheads and UI labels, Bold (700) headlines
- Headings in Demi or Bold, sentence case; body at 16–18px with generous line height (1.6)
- If a licensed webfont cannot be embedded, fall back to Nunito Sans across the whole build rather than mixing faces

### Layout & components

- Rounded corners on cards, tiles, and buttons; generous whitespace; light-first surfaces
- Module cards in a responsive grid, each with the module number in deep purple, an icon, duration, and lesson count
- Progress bar in the purple→magenta gradient
- Lesson page: video/screenshot pane, transcript-or-notes below, "Try it" lab callout in a tinted purple panel, next/prev nav pinned
- Screenshot presentation: rounded frame, subtle shadow, click-to-zoom, caption below carrying the manifest number (e.g. "2.2-c — Import preview with inferred types")
- Annotations on screenshots use magenta callouts and numbered markers
- Code and `SKILL.md` excerpts in a monospace block with copy-to-clipboard, purple left border
- Synozur logo top-left in the course chrome; keep clear space, never recolor it

### Tone

Plain, direct, practitioner-to-practitioner. Short sentences. Show the failure states, not just the happy path. Avoid hype adjectives and avoid calling anything "magic" — the whole point of the course is that it's a legible, three-part, reproducible pattern.

---

## 9. Notes for the Replit Agent

- Every lesson needs a slug, duration, type (video / lab / reading / assessment), and its screenshot IDs from Section 7 so assets can be wired in programmatically.
- Labs should be gated: a "mark complete" action before the next lesson unlocks, with an option to skip.
- Downloads (datasets, one-pagers, rubric, prompt library) belong in a persistent "Course Resources" panel, not only inline.
- The finished-dashboard hero (screenshot 1.2-a) should appear on the course landing page above the fold.
- Screenshots are placeholders until captured — scaffold with labeled empty frames carrying the manifest number and caption so gaps are visible rather than silently missing.
