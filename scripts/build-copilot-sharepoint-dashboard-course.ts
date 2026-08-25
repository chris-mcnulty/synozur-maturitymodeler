import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import * as schema from "../shared/schema";
import {
  exportCourse,
  importCourse,
  validateCourseExportDoc,
  type CourseExportDocV2,
  type CourseExportLesson,
} from "../server/services/course-import-export";

const COURSE_SLUG = "from-list-to-live-dashboard-copilot-sharepoint";
const OUTPUT_PATH = path.resolve(
  "handoff",
  "from-list-to-live-dashboard-copilot-sharepoint.orion-course.json",
);

type Resource = {
  id: string;
  title: string;
  description: string;
  filename: string;
  mimeType: string;
  dataBase64: string;
};

type LessonOptions = {
  screenshots?: string[];
  labSteps?: string[];
  activityType?: "video" | "lab" | "reading" | "assessment" | "assignment";
  resources?: Resource[];
  callout?: string;
  submission?: {
    title: string;
    description: string;
    submitLabel: string;
    fields: Array<{
      id: string;
      label: string;
      type: "url" | "text" | "textarea";
      required?: boolean;
      placeholder?: string;
      helpText?: string;
      rows?: number;
    }>;
  };
};

const screenshotCaptions: Record<string, string> = {
  "1.2-a": "Finished dashboard, full view",
  "1.2-b": "Finished dashboard KPI tile row",
  "1.2-c": "Dashboard drill table with a filter applied",
  "1.3-a": "Copilot pane open on a SharePoint site",
  "2.1-a": "List settings with Choice, Date, and Currency columns",
  "2.1-b": "Bad list schema compared with a dashboard-ready schema",
  "2.2-a": "New List dialog with From Excel and From CSV",
  "2.2-b": "Prepared Excel file with a clean header row",
  "2.2-c": "Import preview with inferred column types",
  "2.2-d": "Corrected import preview with three type fixes",
  "2.2-e": "Imported engagements list in its default view",
  "2.3-a": "Natural-language list creation entry point",
  "2.3-b": "Complete natural-language list prompt",
  "2.3-c": "Generated schema preview",
  "2.3-d": "Editing a generated column before accepting",
  "2.4-a": "Invoking the List agent in Copilot",
  "2.4-b": "Conversational exchange that adds a Health column",
  "2.4-c": "Agent-proposed schema change awaiting review",
  "2.4-d": "Enriched list with the Health column populated",
  "2.6-a": "List permissions panel",
  "2.6-b": "Sensitivity label applied to the list or site",
  "2.6-c": "Internal column names used as the data contract",
  "3.2-a": "GitHub repo tree at sharepoint/sharepoint-list-dashboard",
  "3.2-b": "SKILL.md front matter in GitHub",
  "3.2-c": "SKILL.md instructions section",
  "3.2-d": "SKILL.md styling and output contract",
  "3.2-e": "Skill file beside its rendered dashboard",
  "3.3-a": "Description field with positive and negative trigger phrases",
  "3.4-a": "Sibling skill patterns in the public repository",
  "3.5-a": "Forked skill file with organization brand tokens",
  "4.1-a": "Skill file in its registration location",
  "4.1-b": "Skill scope and audience configuration",
  "4.2-a": "GitHub structure for a personal skill library",
  "4.2-b": "Pull request diff for a skill file",
  "4.3-a": "Five trigger phrases and their test results",
  "4.3-b": "Copilot response with evidence that the skill loaded",
  "4.4-a": "Failure state: generic answer because the skill did not trigger",
  "4.4-b": "Failure state: unstyled output",
  "4.4-c": "Failure state: wrong or missing columns after schema drift",
  "4.4-d": "Corrected render after the skill fix",
  "5.1-a": "Strong assembly prompt in the Copilot box",
  "5.1-b": "Weak assembly prompt beside its poor output",
  "5.2-a": "First generated dashboard render",
  "5.2-b": "Dashboard KPI verified against the source list",
  "5.3-a": "Refinement prompt that changes a chart type",
  "5.3-b": "Dashboard before and after refinement",
  "5.3-c": "Refinement that adds a KPI tile",
  "5.4-a": "SharePoint list updated with a new row",
  "5.4-b": "Re-run dashboard reflecting the new row",
  "5.4-c": "Dashboard artifact embedded on a SharePoint page",
  "5.5-a": "Brand tokens inside the skill file",
  "5.5-b": "Dashboard rendered with the brand palette",
  "5.5-c": "Contrast checker result for the chart palette",
  "6.1-a": "Two permission levels producing different dashboard results",
  "6.2-a": "Policy-blocked Copilot response",
  "6.3-a": "Team skill library with named owners",
  "6.4-a": "Exemplar capstone submission",
  D1: "The three-part pattern: List → Skill → Dashboard",
  D2: "Ingestion decision tree for the three data paths",
  D3: "SKILL.md anatomy, exploded and labeled",
  D4: "Data-contract drift after a column rename",
  D5: "Permission trimming and aggregate differences",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function placeholders(ids: string[]): string {
  return ids.map(id => {
    const kind = id.startsWith("D") ? "Diagram" : "Screenshot";
    return `
      <figure style="margin:24px 0">
        <div role="img" aria-label="${escapeHtml(`${kind} placeholder ${id}: ${screenshotCaptions[id]}`)}"
          style="min-height:260px;border:2px dashed #810FFB;border-radius:16px;background:linear-gradient(135deg,#f7efff,#fff1fb);display:flex;align-items:center;justify-content:center;padding:32px;text-align:center;color:#6003C3">
          <div><strong style="font-size:22px">${kind} placeholder ${id}</strong><br/>${escapeHtml(screenshotCaptions[id])}<br/><span style="font-size:13px">Replace with a 1600×1000+ light-theme capture; blur tenant and user identifiers.</span></div>
        </div>
        <figcaption style="margin-top:8px;color:#555">${id} — ${escapeHtml(screenshotCaptions[id])}</figcaption>
      </figure>`;
  }).join("");
}

function lessonHtml(
  number: string,
  title: string,
  sections: Array<[string, string]>,
  options: LessonOptions,
): string {
  const sectionHtml = sections.map(([heading, body]) =>
    `<section><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(body)}</p></section>`
  ).join("");
  const lab = options.labSteps?.length
    ? `<aside style="border-left:5px solid #810FFB;background:#f7efff;padding:18px 22px;border-radius:12px;margin:24px 0">
        <h2>Try it</h2><ol>${options.labSteps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
        <p><strong>Completion:</strong> mark the lesson complete to unlock the next lesson, or use Skip lab if you need to return later.</p>
      </aside>`
    : "";
  const callout = options.callout
    ? `<aside style="border-left:5px solid #E60CB3;background:#fff1fb;padding:16px 20px;border-radius:12px"><strong>Practitioner note:</strong> ${escapeHtml(options.callout)}</aside>`
    : "";
  return `
    <article>
      <p style="color:#6003C3;font-weight:700">Lesson ${number} · ${options.activityType ?? "video"}</p>
      <h1>${escapeHtml(title)}</h1>
      ${sectionHtml}${callout}${lab}${placeholders(options.screenshots ?? [])}
    </article>`;
}

function richLesson(
  number: string,
  title: string,
  minutes: number,
  sections: Array<[string, string]>,
  options: LessonOptions = {},
): CourseExportLesson {
  return {
    title: `${number} ${title}`,
    type: "rich_text",
    order: 0,
    estimatedMinutes: minutes,
    required: true,
    content: {
      slug: `${number}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      activityType: options.activityType ?? "video",
      screenshotIds: options.screenshots ?? [],
      allowSkip: options.activityType === "lab",
      html: lessonHtml(number, title, sections, options),
      ...(options.resources ? { courseResources: options.resources } : {}),
      ...(options.submission ? { submission: options.submission } : {}),
    },
  };
}

function answer(id: string, text: string) {
  return { id, text };
}

function quizLesson(
  number: string,
  title: string,
  minutes: number,
  questions: any[],
  screenshots: string[] = [],
): CourseExportLesson {
  return {
    title: `${number} ${title}`,
    type: "quiz",
    order: 0,
    estimatedMinutes: minutes,
    required: true,
    content: {
      slug: `${number}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      activityType: "assessment",
      screenshotIds: screenshots,
      passingScore: 75,
      introHtml: placeholders(screenshots),
      questions,
    },
  };
}

function engagementRows(): string[][] {
  const statuses = ["Planned", "Active", "At Risk", "Complete"];
  const health = ["Green", "Green", "Green", "Amber", "Red"];
  const owners = ["Avery Chen", "Jordan Patel", "Morgan Reed", "Taylor Brooks", "Riley Diaz"];
  const clients = ["Northwind Health", "Fabrikam Retail", "Contoso Energy", "Adventure Works", "Litware Financial"];
  const regions = ["West", "Central", "East", "EMEA"];
  const rows: string[][] = [[
    "EngagementID", "EngagementName", "Client", "Owner", "Status",
    "StartDate", "EndDate", "Value", "Health", "Region",
  ]];
  for (let i = 1; i <= 60; i++) {
    const startMonth = String(((i - 1) % 12) + 1).padStart(2, "0");
    const endMonth = String(((i + 2) % 12) + 1).padStart(2, "0");
    rows.push([
      `ENG-${String(i).padStart(3, "0")}`,
      `${["Cloud strategy", "Intranet modernization", "Copilot readiness", "Data governance"][i % 4]} ${i}`,
      clients[i % clients.length],
      owners[i % owners.length],
      statuses[i % statuses.length],
      i === 12 ? "TBD" : `2026-${startMonth}-${String((i % 25) + 1).padStart(2, "0")}`,
      `2026-${endMonth}-${String(((i + 8) % 25) + 1).padStart(2, "0")}`,
      i === 27 ? "$pending" : `$${(45000 + i * 2750).toLocaleString("en-US")}`,
      health[i % health.length],
      regions[i % regions.length],
    ]);
  }
  return rows;
}

function xml(value: string): string {
  return escapeHtml(value);
}

async function buildXlsx(rows: string[][]): Promise<Buffer> {
  const zip = new JSZip();
  const sheetRows = rows.map((row, rIndex) => {
    const cells = row.map((value, cIndex) => {
      const col = String.fromCharCode(65 + cIndex);
      return `<c r="${col}${rIndex + 1}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rIndex + 1}">${cells}</row>`;
  }).join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
    </Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets><sheet name="Engagements" sheetId="1" r:id="rId1"/></sheets>
    </workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
    </Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData>${sheetRows}</sheetData>
      <autoFilter ref="A1:J${rows.length}"/>
    </worksheet>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function buildPdf(title: string, paragraphs: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 735;
  page.drawText(title, { x: 48, y, size: 20, font: bold, color: rgb(0.38, 0.01, 0.76) });
  y -= 38;
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);
    let line = "";
    const lines: string[] = [];
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, 10.5) > 510) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    if (y - lines.length * 15 < 54) {
      page = pdf.addPage([612, 792]);
      y = 735;
    }
    for (const text of lines) {
      page.drawText(text, { x: 48, y, size: 10.5, font, color: rgb(0.07, 0.07, 0.07) });
      y -= 15;
    }
    y -= 9;
  }
  return Buffer.from(await pdf.save());
}

async function buildResources(): Promise<Resource[]> {
  const xlsx = await buildXlsx(engagementRows());
  const csv = [
    "SignalID,Client,SignalDate,SignalType,Severity,Summary,Owner",
    ...Array.from({ length: 24 }, (_, i) =>
      `SIG-${String(i + 1).padStart(3, "0")},${["Northwind Health", "Fabrikam Retail", "Contoso Energy"][i % 3]},2026-${String((i % 8) + 1).padStart(2, "0")}-${String((i % 25) + 1).padStart(2, "0")},${["Sponsor change", "Delivery risk", "Expansion opportunity", "Adoption signal"][i % 4]},${["Low", "Medium", "High"][i % 3]},"Fictional practice signal ${i + 1}",${["Avery Chen", "Jordan Patel", "Morgan Reed"][i % 3]}`
    ),
  ].join("\n");
  const starterSkill = `---
name: consulting-portfolio-dashboard
description: TODO: State the positive trigger phrases and when this skill must not be used.
---
# Consulting portfolio dashboard
## Data source
- TODO: Name the SharePoint list and its internal column names.
## Instructions
1. Read only items the requesting user is permitted to access.
2. TODO: Define KPI calculations and chart groupings.
3. Stop and report missing required columns; do not invent values.
## Styling
- Primary: TODO
- Accent: TODO
## Output contract
- Return self-contained HTML with no external dependencies.
- Include accessible labels, a data-as-of note, and a detail table.
`;
  const completeSkill = `---
name: consulting-portfolio-dashboard
description: Use when a colleague asks to summarize, chart, visualize, or build an HTML dashboard from the Engagements SharePoint list. Do not use for unrelated lists, document libraries, or requests that require a Power BI semantic model.
---
# Consulting portfolio dashboard
## Data source and contract
Read the Engagements list using internal columns EngagementID, EngagementName, Client, Owner, Status, StartDate, EndDate, Value, Health, and Region. Respect the requesting user's permissions. If a required column is missing, stop and name it.
## Instructions
1. Calculate engagement count, active value, at-risk count, and completion rate from visible items.
2. Group status and health by their exact Choice values.
3. Build a monthly trend from StartDate for the most recent twelve months present.
4. Include a filterable detail table. Reconcile every KPI to the same visible item set.
## Styling
Use #810FFB primary, #E60CB3 accent, #6003C3 headers, #111111 text, and #FFFFFF surfaces. Use rounded cards, generous spacing, explicit chart labels, and WCAG AA contrast.
## Output contract
Return one self-contained HTML document with inline CSS and JavaScript, no external dependencies, accessible names, a data-as-of note, and a statement that re-running is required after source changes.
`;
  const promptLibrary = `# Prompt library

## Assembly
- Use the consulting portfolio dashboard skill to build a self-contained HTML dashboard from the Engagements list. Show KPIs, status, a 12-month trend, and a filterable detail table.
- Build the Engagements dashboard using the registered skill. Stop and list any missing contract columns before rendering.

## Refinement
- Change the status chart to horizontal bars without changing any calculations.
- Add a KPI for Amber or Red health and reconcile it to the detail table.
- Filter the artifact to engagements that started in the last 12 months.
- Rank clients by active value and show the top five.

## Verification
- Show the item IDs included in each KPI so I can reconcile the result.
- State the visible row count and the latest source date used.
`;
  const glossary = `# Glossary

- **Skill:** A markdown instruction file that helps Copilot recognize a task and follow a repeatable method.
- **Agent:** A configured AI experience with a scope, knowledge, instructions, and actions.
- **Data contract:** The stable field names, types, allowed values, and meaning expected by a downstream process.
- **Internal column name:** The SharePoint field identifier that may remain unchanged after a display-name edit.
- **Self-contained HTML:** One HTML document whose required CSS and JavaScript are embedded rather than fetched externally.
- **Permission trimming:** Restricting results to content the requesting user is authorized to see.
- **Live artifact:** In this course, an HTML result generated from current visible list data when the prompt is run; it is not a continuously refreshing semantic model.
`;
  const pathPdf = await buildPdf("Choosing a SharePoint list ingestion path", [
    "Use Excel or CSV import when a clean source file already exists, volume is moderate, and you can review every inferred type before creation.",
    "Use natural-language list creation when no file exists and the desired entity, fields, types, and sample values can be described clearly. Treat the generated schema as a draft.",
    "Use the List agent when you need conversational, iterative refinement or enrichment of an existing list. Review every proposed schema or bulk-data change before applying it.",
    "For every path: document internal names, use Choice for grouped categories, use Date for dates, use Number or Currency for measures, and set permissions and sensitivity before building the dashboard skill.",
  ]);
  const rubricPdf = await buildPdf("Capstone rubric — From List to Live Dashboard", [
    "Data contract quality — 25 points. Fields, internal names, types, allowed values, assumptions, and drift risks are accurate and documented.",
    "Skill file quality — 25 points. Trigger description, grounding rules, missing-data behavior, output contract, and maintainable structure are clear.",
    "Dashboard accuracy — 25 points. KPIs and charts reconcile to the visible source rows, with validation evidence.",
    "Brand and accessibility — 15 points. Tokens are applied consistently; labels, contrast, keyboard use, and readable hierarchy meet the stated standard.",
    "Documentation — 10 points. A five-line README explains the source, contract, permissions, refresh or rerun behavior, and artifact owner.",
  ]);
  const items: Array<[string, string, string, string, Buffer | string]> = [
    ["engagements", "Engagements sample workbook", "60-row fictional consulting portfolio with three fields that require type review.", "engagements.xlsx", xlsx],
    ["health-signals", "Client health signals dataset", "Fictional CSV for natural-language and List agent labs.", "client-health-signals.csv", csv],
    ["skill-starter", "SKILL.md starter", "Teaching version with TODO markers.", "SKILL-starter.md", starterSkill],
    ["skill-complete", "SKILL.md complete", "Finished reference implementation for the course scenario.", "SKILL-complete.md", completeSkill],
    ["path-guide", "Ingestion path decision guide", "One-page decision support for the three ingestion paths.", "sharepoint-list-path-guide.pdf", pathPdf],
    ["prompts", "Prompt library", "Copy-ready assembly, refinement, and verification prompts.", "prompt-library.md", promptLibrary],
    ["rubric", "Capstone rubric", "Scoring dimensions and evidence expectations.", "capstone-rubric.pdf", rubricPdf],
    ["glossary", "Course glossary", "Plain-language definitions for core terms.", "glossary.md", glossary],
  ];
  return items.map(([id, title, description, filename, data]) => ({
    id,
    title,
    description,
    filename,
    mimeType: filename.endsWith(".pdf")
      ? "application/pdf"
      : filename.endsWith(".xlsx")
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : filename.endsWith(".csv")
          ? "text/csv"
          : "text/markdown",
    dataBase64: Buffer.isBuffer(data) ? data.toString("base64") : Buffer.from(data).toString("base64"),
  }));
}

function courseHero(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="700" viewBox="0 0 1600 700">
    <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#6003C3"/><stop offset="1" stop-color="#E60CB3"/></linearGradient></defs>
    <rect width="1600" height="700" fill="url(#g)"/><text x="90" y="115" fill="#fff" font-family="Segoe UI,Arial" font-size="30">FROM LIST TO LIVE DASHBOARD</text>
    <text x="90" y="180" fill="#fff" font-family="Segoe UI,Arial" font-size="58" font-weight="700">Copilot in SharePoint</text>
    <g transform="translate(90 250)"><rect width="1420" height="360" rx="28" fill="#fff"/>
      <g fill="#f6efff"><rect x="35" y="35" width="310" height="100" rx="18"/><rect x="370" y="35" width="310" height="100" rx="18"/><rect x="705" y="35" width="310" height="100" rx="18"/><rect x="1040" y="35" width="345" height="100" rx="18"/></g>
      <g fill="#810FFB"><rect x="35" y="180" width="620" height="140" rx="18"/><rect x="680" y="180" width="705" height="140" rx="18"/></g>
      <text x="60" y="90" fill="#111" font-family="Segoe UI,Arial" font-size="24">Active engagements</text><text x="60" y="125" fill="#6003C3" font-family="Segoe UI,Arial" font-size="34" font-weight="700">42</text>
      <text x="395" y="90" fill="#111" font-family="Segoe UI,Arial" font-size="24">Portfolio value</text><text x="395" y="125" fill="#6003C3" font-family="Segoe UI,Arial" font-size="34" font-weight="700">$4.8M</text>
    </g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function buildDocument(): Promise<CourseExportDocV2> {
  const resources = await buildResources();
  const m1 = [
    richLesson("1.1", "Why list → skill → dashboard", 5, [
      ["The mental model", "The list is the data contract, the skill is the presentation contract, and the prompt is the assembly step."],
      ["What live means", "Copilot reads the list when you run the request and returns an HTML artifact. It is not a continuously refreshing Power BI semantic model."],
      ["The working loop", "Change the list, rerun the request, inspect the result, and reconcile it to the source before sharing."],
    ], { screenshots: ["D1"], callout: "Use Power BI when you need governed semantic models, scheduled refresh, large-scale analytics, or row-level security beyond the requesting user's visible list data." }),
    richLesson("1.2", "Tour of the finished artifact", 6, [
      ["Read from summary to detail", "Start with KPI tiles, move through status and trend charts, then drill into the record table."],
      ["Trust through traceability", "Every displayed number should reconcile to visible list items and the same filter context."],
      ["Know the destination", "The end product is intentionally simple: one source list, one repeatable skill, and one self-contained HTML output."],
    ], { screenshots: ["1.2-a", "1.2-b", "1.2-c"] }),
    richLesson("1.3", "Where Copilot in SharePoint fits", 5, [
      ["Choose the right surface", "SharePoint Copilot is the course surface; Copilot Chat, Copilot Cowork, and agents serve different scopes and work patterns."],
      ["Verify in your tenant", "Microsoft placement, registration, and availability can change by tenant and rollout. Confirm the current entry point and supported skill location before a production handoff."],
      ["Keep the source close", "A SharePoint-centered experience reduces ambiguity about which site, list, and permission context the request should use."],
    ], { screenshots: ["1.3-a"] }),
    richLesson("1.4", "Course project brief", 4, [
      ["Scenario", "You are building a consulting delivery portfolio with engagements, status, owner, client, value, health, and dates."],
      ["Deliverables", "By the end you will have a production-ready list, an organization-specific SKILL.md, a verified dashboard, and a short operating note."],
      ["Fictional data", "All supplied client and person names are synthetic. Replace them only with approved practice or production data."],
    ], { activityType: "reading", resources }),
  ];

  const m2 = [
    richLesson("2.1", "What makes data dashboard-ready", 7, [
      ["Types are behavior", "Use Choice for grouped categories, Date for dates, and Number or Currency for measures. Text that merely looks like a date or number is not equivalent."],
      ["One fact, one field", "Avoid duplicated facts and inconsistent category spellings. Stable, machine-friendly names reduce downstream ambiguity."],
      ["Plan for drift", "Display names can change while internal names remain. Capture the internal contract before the skill references it."],
    ], { screenshots: ["2.1-a", "2.1-b", "D4"] }),
    richLesson("2.2", "Path A — Import from Excel or CSV", 12, [
      ["Prepare the file", "Use one clean header row, one table, no merged cells, no totals, and no presentation-only rows."],
      ["Review inferred types", "The supplied workbook intentionally encourages review of Status, StartDate, and Value. Correct the target SharePoint types before accepting the import."],
      ["Clean up after import", "Convert grouping fields to Choice, confirm date locale behavior, set Currency, and choose a useful Title field."],
    ], { activityType: "lab", screenshots: ["2.2-a", "2.2-b", "2.2-c", "2.2-d", "2.2-e"], labSteps: [
      "Download engagements.xlsx from Course resources.",
      "Start a new list from the workbook using the current import path in your tenant.",
      "Review every inferred type; set Status to Choice, StartDate to Date, and Value to Currency.",
      "Create the list and inspect at least five rows against the workbook.",
    ] }),
    richLesson("2.3", "Path B — Natural-language list creation in SharePoint", 10, [
      ["Prompt the schema, not the decoration", "Describe the entity, fields, types, and sample values. Treat the generated schema as a draft."],
      ["A strong request", "Create a Client Health Signals list with Signal ID text, Client text, Signal Date date, Signal Type choice, Severity choice, Summary multiline text, and Owner person."],
      ["Edit before accepting", "Check names, types, allowed values, required fields, and defaults before data entry begins."],
    ], { activityType: "lab", screenshots: ["2.3-a", "2.3-b", "2.3-c", "2.3-d"], labSteps: [
      "Download client-health-signals.csv for sample values.",
      "Create the list from the written schema request.",
      "Change any incorrectly generated types before accepting.",
      "Add three sample records and verify the default view.",
    ] }),
    richLesson("2.4", "Path C — The List agent in Copilot", 10, [
      ["Use conversation for refinement", "The List agent can add columns, enrich an existing structure, and correct rows iteratively."],
      ["Review before applying", "Agent-generated schema and bulk changes affect downstream consumers. Read the proposed change and sample values first."],
      ["Enrich the course list", "Add Health as a controlled Choice with Green, Amber, and Red, then backfill only after agreeing on the rule."],
    ], { activityType: "lab", screenshots: ["2.4-a", "2.4-b", "2.4-c", "2.4-d"], labSteps: [
      "Open the List agent for the practice list using the current tenant entry point.",
      "Ask it to propose a Health Choice field with Green, Amber, and Red.",
      "Review the proposed schema change without immediately applying it.",
      "Apply in the practice site and inspect every backfilled category.",
    ] }),
    richLesson("2.5", "Choosing your path — decision guide", 6, [
      ["Existing clean file", "Prefer Excel or CSV import when the source already exists and the one-time mapping can be reviewed."],
      ["No file yet", "Prefer natural-language creation when the schema can be described and corrected before use."],
      ["Iterative enrichment", "Prefer the List agent when the work is conversational and changes an existing list over several steps."],
    ], { activityType: "reading", screenshots: ["D2"], callout: "Governance posture can override convenience. Use the path your organization has approved for the data classification involved." }),
    quizLesson("2.6", "Locking the data contract — knowledge check", 8, [
      { id: "m2q1", type: "single", text: "Which SharePoint type is the best default for a status used in chart grouping?", options: [answer("a", "Single line of text"), answer("b", "Choice"), answer("c", "Multiline text")], correctAnswerId: "b", explanation: "Choice controls the values used for grouping." },
      { id: "m2q2", type: "single", text: "A currency amount imported as text should be:", options: [answer("a", "Left as text"), answer("b", "Converted to Number or Currency"), answer("c", "Moved into the Title column")], correctAnswerId: "b", explanation: "Numeric types support reliable totals and sorting." },
      { id: "m2q3", type: "single", text: "Why capture internal column names?", options: [answer("a", "They are shorter"), answer("b", "They remain the stable identifiers referenced by the skill"), answer("c", "They remove permissions")], correctAnswerId: "b", explanation: "A display-name change does not necessarily change the internal identifier." },
      { id: "m2q4", type: "single", text: "When should permissions and sensitivity be set?", options: [answer("a", "Before building downstream artifacts"), answer("b", "Only after the first dashboard"), answer("c", "Never on practice lists")], correctAnswerId: "a", explanation: "Set the governance boundary before others build on the list." },
      { id: "m2q5", type: "single", text: "Which file layout is import-ready?", options: [answer("a", "Merged headings and totals"), answer("b", "One header row and one clean table"), answer("c", "Several unrelated tables per sheet")], correctAnswerId: "b", explanation: "A simple tabular shape produces the most predictable import." },
      { id: "m2q6", type: "single", text: "A generated natural-language schema should be treated as:", options: [answer("a", "A draft to review"), answer("b", "An immutable production contract"), answer("c", "A replacement for permissions")], correctAnswerId: "a", explanation: "Review names, types, and allowed values before accepting." },
      { id: "m2q7", type: "single", text: "What is the safest response to a List agent schema proposal?", options: [answer("a", "Apply immediately"), answer("b", "Review the change and sample impact first"), answer("c", "Ask it to hide the change")], correctAnswerId: "b", explanation: "Human review is the governance checkpoint." },
      { id: "m2q8", type: "single", text: "Which field is not dashboard-ready for monthly trends?", options: [answer("a", "A Date column"), answer("b", "A text field containing mixed dates and TBD"), answer("c", "A calculated month derived from a Date")], correctAnswerId: "b", explanation: "Mixed free text cannot be grouped chronologically with confidence." },
    ], ["2.6-a", "2.6-b", "2.6-c"]),
  ];

  const m3 = [
    richLesson("3.1", "What a custom skill actually is", 6, [
      ["A markdown contract", "A skill is a readable instruction file: name, description, instructions, and an output agreement."],
      ["Description drives selection", "Write the description in the language colleagues use and state when the skill should not be used."],
      ["Keep it legible", "A reviewer should be able to explain the source, calculations, failure behavior, and output without running code."],
    ], { screenshots: ["D3"] }),
    richLesson("3.2", "Walkthrough — the Synozur sharepoint-list-dashboard skill", 12, [
      ["Front matter", "Read name and description first. Trigger vocabulary should align with dashboard and SharePoint list requests."],
      ["Grounding and layout", "Find the data-access rules, KPI row, chart region, detail table, and missing-column guidance."],
      ["Styling and output", "The reference pattern uses explicit tokens and asks for self-contained HTML so the artifact is portable."],
    ], { screenshots: ["3.2-a", "3.2-b", "3.2-c", "3.2-d", "3.2-e"], callout: "Repository paths and Microsoft feature behavior can evolve. Verify the current public repository and your tenant documentation during recording." }),
    richLesson("3.3", "Trigger design — making a skill fire when you want it to", 7, [
      ["Use real request language", "Include verbs such as summarize, chart, visualize, and build a dashboard, plus the intended SharePoint list context."],
      ["Set negative boundaries", "State unrelated sources and outcomes for which the skill must not be selected."],
      ["Test variation", "Use several natural phrasings rather than repeating one scripted sentence."],
    ], { screenshots: ["3.3-a"] }),
    richLesson("3.4", "Other patterns worth borrowing", 6, [
      ["Borrow contracts", "Output, styling, error handling, and accessibility patterns often transfer across skills."],
      ["Rewrite source specifics", "List names, internal fields, calculations, and permission assumptions belong to your own contract."],
      ["Prefer small composable rules", "Short explicit instructions are easier to test and review than a long narrative."],
    ], { screenshots: ["3.4-a"] }),
    richLesson("3.5", "Fork it — build your own skill file", 9, [
      ["Start from the teaching file", "Use the starter resource, rename the skill, and complete the trigger description."],
      ["Bind the contract", "Insert the exact internal names from your practice list and define how missing fields should fail."],
      ["Make a visible adaptation", "Swap the palette to your approved tokens and add one chart that answers a real question."],
    ], { activityType: "lab", screenshots: ["3.5-a"], labSteps: [
      "Download SKILL-starter.md and save a working copy as SKILL.md.",
      "Complete the description with positive and negative triggers.",
      "Add the practice list internal names and KPI rules.",
      "Replace the TODO palette and define one additional chart.",
      "Compare with SKILL-complete.md, preserving deliberate differences.",
    ] }),
  ];

  const m4 = [
    richLesson("4.1", "Where skills live", 8, [
      ["Registration and placement", "Put the skill in the location supported by the current Copilot in SharePoint experience."],
      ["Scope deliberately", "Choose who can use it and which site or organizational boundary it applies to."],
      ["Confirm current guidance", "Registration controls are subject to Microsoft rollout and tenant policy; verify before recording or production use."],
    ], { screenshots: ["4.1-a", "4.1-b"] }),
    richLesson("4.2", "Versioning in GitHub", 6, [
      ["Treat instructions as production assets", "A skill that reads business-critical data deserves history, ownership, and review."],
      ["Keep a predictable structure", "Organize one folder per skill with the skill file, examples, owner, and test phrases."],
      ["Review meaningful diffs", "Trigger, data-contract, calculation, output, and brand changes should be visible in pull requests."],
    ], { activityType: "reading", screenshots: ["4.2-a", "4.2-b"] }),
    richLesson("4.3", "The trigger smoke test", 8, [
      ["Five phrasings, one intent", "Test direct, conversational, shorthand, outcome-first, and list-first requests."],
      ["Look for evidence", "Confirm the response follows the source contract, layout, styling, and failure rules rather than improvising."],
      ["Record the result", "Keep a small trigger test table so future description edits can be compared."],
    ], { activityType: "lab", screenshots: ["4.3-a", "4.3-b"], labSteps: [
      "Run five distinct trigger phrases from the prompt library.",
      "Record whether the skill loaded and what evidence supports the conclusion.",
      "Revise the description once if a reasonable phrase misses.",
      "Repeat the full set and keep the result with the skill.",
    ] }),
    quizLesson("4.4", "Debugging a skill that will not fire or behave", 8, [
      { id: "m4q1", type: "single", text: "The skill never loads. What should you inspect first?", options: [answer("a", "The description and trigger vocabulary"), answer("b", "The chart colors"), answer("c", "The list item count")], correctAnswerId: "a", explanation: "Selection failures most often begin with the description." },
      { id: "m4q2", type: "single", text: "The skill loads but ignores key rules. What is the best first change?", options: [answer("a", "Make the instructions shorter and more explicit"), answer("b", "Rename every list field"), answer("c", "Remove the output contract")], correctAnswerId: "a", explanation: "Concrete, prioritized instructions are easier to follow." },
      { id: "m4q3", type: "single", text: "The output shows wrong or missing columns after a rename. Likely cause?", options: [answer("a", "Brand drift"), answer("b", "Data-contract drift"), answer("c", "A browser theme")], correctAnswerId: "b", explanation: "The skill may reference a field that no longer matches the contract." },
      { id: "m4q4", type: "single", text: "The dashboard is unstyled. What should be strengthened?", options: [answer("a", "Explicit styling and output requirements"), answer("b", "The list permission level"), answer("c", "The dataset row count")], correctAnswerId: "a", explanation: "Persistent presentation rules belong in the skill." },
    ], ["4.4-a", "4.4-b", "4.4-c", "4.4-d"]),
  ];

  const m5 = [
    richLesson("5.1", "The assembly prompt", 8, [
      ["Name source and outcome", "A strong prompt names the Engagements list and requests the dashboard outcome. The skill supplies the repeatable method."],
      ["Avoid vague requests", "Make it clear which list, which artifact, and which verification behavior you expect."],
      ["Keep permanent rules out of one-off prompts", "If every dashboard needs the rule, move it into the skill."],
    ], { screenshots: ["5.1-a", "5.1-b"] }),
    richLesson("5.2", "First render", 10, [
      ["Run, then verify", "Do not trust a polished tile until it reconciles to the source rows visible to the requester."],
      ["Use one filter context", "Counts, values, charts, and detail rows must describe the same record set."],
      ["Capture evidence", "Record the visible row count, latest date, and at least one manual calculation."],
    ], { activityType: "lab", screenshots: ["5.2-a", "5.2-b"], labSteps: [
      "Run the strong assembly prompt against the practice list.",
      "Reconcile engagement count, active value, and at-risk count to the list.",
      "Check one chart segment against filtered source rows.",
      "Do not continue until discrepancies are explained or corrected.",
    ] }),
    richLesson("5.3", "Iterating on the output", 12, [
      ["Refine one dimension at a time", "Change a chart type, add a segment, apply a date window, re-rank, or add a KPI with explicit criteria."],
      ["Prompt versus skill", "Use the prompt for a one-off adjustment. Update the skill when the correction should apply every time."],
      ["Prompt critique", "The best request names the source, outcome, verification expectation, and exact refinement without redefining the entire skill."],
    ], { activityType: "lab", screenshots: ["5.3-a", "5.3-b", "5.3-c"], labSteps: [
      "Change the status visualization to a horizontal bar chart.",
      "Add an Amber-or-Red health KPI and reconcile it.",
      "Write one permanent correction into the skill rather than the prompt.",
      "Rank four candidate assembly prompts and explain the winner in two sentences.",
    ], submission: {
      title: "Prompt critique",
      description: "Submit your ranked prompts and a short justification. Your facilitator or peer reviewer can use this saved response during review.",
      submitLabel: "Submit prompt critique",
      fields: [
        { id: "ranking", label: "Prompt ranking and justification", type: "textarea", required: true, rows: 6, placeholder: "1. Best prompt… because…\n2. …" },
      ],
    } }),
    richLesson("5.4", "Making it genuinely live", 10, [
      ["Rerun is the refresh", "Update the source list, rerun the request, and verify that the new item appears in the artifact."],
      ["Share with context", "Store or embed the generated artifact according to organizational policy and state when it was generated."],
      ["Know the escalation path", "Move to Power BI when scheduled refresh, governed measures, large scale, or advanced security is required."],
    ], { activityType: "lab", screenshots: ["5.4-a", "5.4-b", "5.4-c"], labSteps: [
      "Add one fictional engagement to the practice list.",
      "Rerun the same assembly prompt and verify the count and detail row.",
      "Save or embed the artifact using the currently supported SharePoint controls.",
      "Add a visible data-as-of and rerun note.",
    ] }),
    richLesson("5.5", "Styling the dashboard on brand", 10, [
      ["Put tokens in the skill", "Define colors, type scale, tile geometry, chart palette, and spacing once."],
      ["Use the Synozur course palette", "Primary #810FFB, accent #E60CB3, deep #6003C3, ink #111111, and white surfaces."],
      ["Verify accessibility", "Use explicit labels and test every text/background and chart pairing. Avoid magenta for small body text."],
    ], { activityType: "lab", screenshots: ["5.5-a", "5.5-b", "5.5-c"], labSteps: [
      "Apply the approved tokens in the skill rather than the assembly prompt.",
      "Rerun the dashboard and check that all components use the same system.",
      "Test body text, buttons, and chart colors with an approved contrast checker.",
      "Correct any failing pair and record the final tokens.",
    ] }),
  ];

  const m6 = [
    richLesson("6.1", "Permissions and the trimming question", 7, [
      ["The requester defines visibility", "The generated dashboard reflects the items the requesting user can access."],
      ["Aggregates can legitimately differ", "Two users with different rights may receive different counts and totals from the same list."],
      ["Rendered artifacts need their own review", "Before sharing an output, confirm the recipient is allowed to see every included row and aggregate."],
    ], { screenshots: ["6.1-a", "D5"] }),
    richLesson("6.2", "Sensitivity labels and data-loss guardrails", 6, [
      ["Policy is part of the system", "Protected columns, labels, and organizational controls may prevent Copilot from reading or returning data."],
      ["Do not prompt around controls", "A blocked response is a governance signal. Follow the approved data handling and exception process."],
      ["Design with least privilege", "Use approved synthetic data for practice and avoid placing restricted details in reusable skill examples."],
    ], { screenshots: ["6.2-a"] }),
    richLesson("6.3", "Scaling the pattern across a team", 8, [
      ["Parameterize carefully", "One skill can support several lists only when the data contracts are intentionally compatible."],
      ["Name an owner", "Keep skills in a library with accountable owners, review dates, supported sources, and trigger tests."],
      ["Watch for drift", "Review after schema changes, policy changes, brand updates, and significant Microsoft feature changes."],
    ], { activityType: "reading", screenshots: ["6.3-a"] }),
    richLesson("6.4", "Capstone brief", 20, [
      ["Build end to end", "Bring an approved dataset, import it, document the contract, adapt the skill, render and verify the dashboard, then embed or store it."],
      ["Submit evidence", "Provide the dashboard, SKILL.md, verification screenshots, and a five-line README covering source, contract, permissions, rerun behavior, and owner."],
      ["Use the rubric", "Data contract, skill quality, accuracy, brand/accessibility, and documentation total 100 points."],
    ], { activityType: "assignment", screenshots: ["6.4-a"], labSteps: [
      "Choose an approved dataset and document its fields, types, values, and owner.",
      "Import it into SharePoint and verify the internal contract.",
      "Adapt and trigger-test the skill.",
      "Generate the dashboard and reconcile every KPI.",
      "Apply brand and accessibility checks, then submit the artifact, skill, evidence, and README.",
    ], submission: {
      title: "Capstone submission",
      description: "Provide permission-safe links that your reviewer can open, plus the required five-line README. Completion is recorded only after all required evidence is submitted.",
      submitLabel: "Submit capstone",
      fields: [
        { id: "dashboardUrl", label: "Dashboard or SharePoint page URL", type: "url", required: true, placeholder: "https://…" },
        { id: "skillUrl", label: "SKILL.md URL", type: "url", required: true, placeholder: "https://…" },
        { id: "evidenceUrl", label: "Verification evidence URL", type: "url", required: true, placeholder: "https://…", helpText: "Link to screenshots or a document that reconciles dashboard figures to the source." },
        { id: "readme", label: "Five-line README", type: "textarea", required: true, rows: 7, placeholder: "Source:\nData contract:\nPermissions:\nRefresh/rerun:\nOwner:" },
      ],
    } }),
    richLesson("6.5", "Where to go next", 5, [
      ["Declarative agents", "Use a broader agent when the experience needs durable instructions, scoped knowledge, and additional actions."],
      ["Power BI handoff", "Escalate when the scenario needs a semantic model, scheduled refresh, enterprise analytics, or richer governance."],
      ["Adjacent patterns", "Explore list formatting, reusable skill libraries, and Copilot Cowork for cross-source workflows."],
    ], { callout: "Keep the pattern legible: source contract, presentation contract, assembly request, verification, and governance." }),
  ];

  const modules = [
    ["Orientation: The Three-Part Pattern", "Understand what the pattern produces and where it fits.", m1],
    ["Getting Business-Critical Data Into SharePoint", "Choose an ingestion path and lock a dashboard-ready data contract.", m2],
    ["Anatomy of a Copilot Skill", "Read, adapt, and test a maintainable SKILL.md.", m3],
    ["Installing and Testing the Skill", "Register, version, smoke-test, and debug the skill.", m4],
    ["Building the Live HTML Dashboard", "Assemble, verify, refine, refresh, and brand the dashboard.", m5],
    ["Governance, Scale, and Handoff", "Apply permissions, policy, ownership, and a capstone operating model.", m6],
  ].map(([title, description, lessons], moduleIndex) => ({
    title: title as string,
    description: description as string,
    order: moduleIndex,
    lessons: (lessons as CourseExportLesson[]).map((lesson, lessonIndex) => ({ ...lesson, order: lessonIndex })),
  }));

  const lessonCount = modules.reduce((sum, module) => sum + module.lessons.length, 0);
  if (lessonCount !== 29) throw new Error(`Expected 29 lessons, got ${lessonCount}`);
  const usedIds = new Set(modules.flatMap(module => module.lessons.flatMap(lesson => lesson.content.screenshotIds ?? [])));
  const missingIds = Object.keys(screenshotCaptions).filter(id => !usedIds.has(id));
  if (missingIds.length) throw new Error(`Unused screenshot or diagram IDs: ${missingIds.join(", ")}`);

  return {
    format: "orion-course",
    version: "2",
    exportedAt: new Date().toISOString(),
    assets: {},
    course: {
      title: "From List to Live Dashboard: Copilot in SharePoint",
      slug: COURSE_SLUG,
      description: "Build a repeatable SharePoint reporting pattern from a governed list, an organization-specific Copilot skill, and a verified self-contained HTML dashboard.\n\nPublisher: Synozur\nAuthor and instructor: Chris McNulty, CTO, Synozur\nLevel: Intermediate\nPrerequisites: SharePoint site ownership on a practice site and a Microsoft 365 Copilot license. A browser is sufficient for the core path.",
      summary: "Turn a dashboard-ready SharePoint list and a custom Copilot skill into a governed, styled HTML dashboard.",
      imageUrl: courseHero(),
      estimatedMinutes: 195,
      status: "draft",
      visibility: "private",
      passingScore: 75,
      certificateEnabled: false,
      tags: ["SharePoint", "Microsoft 365 Copilot", "Dashboard", "Intermediate"],
      modules,
    },
  };
}

async function main() {
  const [existing] = await db.select({ id: schema.courses.id }).from(schema.courses)
    .where(eq(schema.courses.slug, COURSE_SLUG)).limit(1);
  if (existing) {
    if (!process.argv.includes("--replace")) {
      throw new Error(`Development course ${COURSE_SLUG} already exists; pass --replace to rebuild it.`);
    }
    await db.delete(schema.courses).where(eq(schema.courses.id, existing.id));
  }
  const [creator] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.email, "chris.mcnulty@synozur.com")).limit(1);
  if (!creator) throw new Error("Development creator account was not found.");

  const sourceDoc = await buildDocument();
  validateCourseExportDoc(sourceDoc);
  const imported = await importCourse(sourceDoc, {
    slug: COURSE_SLUG,
    ownerTenantId: null,
    createdBy: creator.id,
    visibility: "private",
  });
  const exported = await exportCourse(imported.course.id);
  if (!exported) throw new Error("Imported course could not be exported.");
  validateCourseExportDoc(exported);

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(exported, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    courseId: imported.course.id,
    slug: imported.course.slug,
    status: imported.course.status,
    visibility: imported.course.visibility,
    moduleCount: imported.moduleCount,
    lessonCount: imported.lessonCount,
    tagCount: imported.tagCount,
    outputPath: OUTPUT_PATH,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});