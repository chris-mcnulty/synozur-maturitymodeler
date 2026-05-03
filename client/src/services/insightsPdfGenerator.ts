import jsPDF from "jspdf";
// @ts-ignore
import logoImage from "@assets/SA-Logo-Horizontal-color_1760530252980.png";
// @ts-ignore
import avenirRegularFont from "./avenir-regular-font.txt?raw";
// @ts-ignore
import avenirBoldFont from "./avenir-bold-font.txt?raw";

interface ModelInsightLite {
  modelId: string;
  modelName: string;
  modelClass: string;
  maxScore: number;
  assessmentCount: number;
  latestScore: number;
  latestScorePercent: number;
  latestLabel: string | null;
  trendDelta: number;
  trendDirection: "up" | "down" | "flat" | "single";
  trend: Array<{
    completedAt: string | null;
    score: number;
    scorePercent: number;
  }>;
}

interface DimensionInsightLite {
  label: string;
  averagePercent: number;
  modelCount: number;
}

export interface InsightsPDFData {
  scope: "user" | "tenant";
  tenantName?: string;
  cohortSize?: number;
  totalCompleted: number;
  models: ModelInsightLite[];
  crossModelDimensions: DimensionInsightLite[];
  narrative?: string | null;
  userContext?: {
    name?: string;
    company?: string;
    jobTitle?: string;
    industry?: string;
  };
}

const PRIMARY = { r: 129, g: 15, b: 251 };
const ACCENT = { r: 230, g: 12, b: 179 };
const TEXT = { r: 51, g: 51, b: 51 };
const GRAY = { r: 102, g: 102, b: 102 };
const LIGHT_GRAY = { r: 220, g: 220, b: 220 };

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 20;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function stripMarkdown(md: string): string {
  return md
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\r\n/g, "\n");
}

export function generateInsightsPDF(data: InsightsPDFData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  try {
    doc.addFileToVFS("AvenirNextLTPro-Regular.ttf", avenirRegularFont);
    doc.addFont("AvenirNextLTPro-Regular.ttf", "Avenir", "normal");
    doc.addFileToVFS("AvenirNextLTPro-Bold.ttf", avenirBoldFont);
    doc.addFont("AvenirNextLTPro-Bold.ttf", "Avenir", "bold");
    doc.setFont("Avenir", "normal");
  } catch (err) {
    console.error("Avenir font load failed, using default:", err);
  }

  let y = 15;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - 18) {
      doc.addPage();
      y = 20;
    }
  };

  const drawDivider = () => {
    doc.setDrawColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
    doc.setLineWidth(0.5);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
    y += 8;
  };

  // Header logo
  try {
    const logoW = 60;
    const logoH = 20;
    doc.addImage(logoImage, "PNG", (PAGE_W - logoW) / 2, y, logoW, logoH);
    y += logoH + 6;
  } catch {
    doc.setFontSize(12);
    doc.setTextColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
    doc.text("THE SYNOZUR ALLIANCE LLC", PAGE_W / 2, y, { align: "center" });
    y += 8;
  }

  doc.setFont("Avenir", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text("The Transformation Company | Find Your North Star", PAGE_W / 2, y, { align: "center" });
  y += 12;

  // Title
  doc.setFont("Avenir", "bold");
  doc.setFontSize(22);
  doc.setTextColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
  const title = data.scope === "tenant" ? "Tenant Insights Report" : "Personal Insights Report";
  doc.text(title, PAGE_W / 2, y, { align: "center" });
  doc.setFont("Avenir", "normal");
  y += 9;

  // Subhead
  doc.setFontSize(10);
  doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
  if (data.scope === "tenant") {
    if (data.tenantName) {
      doc.text(data.tenantName, PAGE_W / 2, y, { align: "center" });
      y += 5;
    }
    if (typeof data.cohortSize === "number") {
      doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
      doc.text(
        `Aggregated across ${data.cohortSize} contributor${data.cohortSize === 1 ? "" : "s"} (anonymized)`,
        PAGE_W / 2,
        y,
        { align: "center" }
      );
      y += 5;
    }
  } else if (data.userContext) {
    if (data.userContext.name) {
      doc.text(`Prepared for: ${data.userContext.name}`, PAGE_W / 2, y, { align: "center" });
      y += 5;
    }
    if (data.userContext.company) {
      doc.text(data.userContext.company, PAGE_W / 2, y, { align: "center" });
      y += 5;
    }
  }

  doc.setFontSize(10);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, PAGE_W / 2, y, { align: "center" });
  y += 10;

  // Summary
  drawDivider();
  doc.setFont("Avenir", "bold");
  doc.setFontSize(14);
  doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
  doc.text("Portfolio Summary", MARGIN_X, y);
  doc.setFont("Avenir", "normal");
  y += 7;

  doc.setFontSize(10);
  doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
  doc.text(`Total assessments completed: ${data.totalCompleted}`, MARGIN_X, y);
  y += 5;
  doc.text(`Models covered: ${data.models.length}`, MARGIN_X, y);
  y += 5;
  doc.text(`Cross-model dimensions tracked: ${data.crossModelDimensions.length}`, MARGIN_X, y);
  y += 8;

  // AI Narrative
  if (data.narrative && data.narrative.trim().length > 0) {
    ensureSpace(20);
    drawDivider();
    doc.setFont("Avenir", "bold");
    doc.setFontSize(14);
    doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
    doc.text("Portfolio Narrative", MARGIN_X, y);
    doc.setFont("Avenir", "normal");
    y += 7;

    doc.setFontSize(9);
    doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
    const cleaned = stripMarkdown(data.narrative);
    const paragraphs = cleaned.split(/\n\n+/);
    paragraphs.forEach((para) => {
      const lines = para.split("\n");
      lines.forEach((rawLine) => {
        const wrapped = doc.splitTextToSize(rawLine.trim(), CONTENT_W);
        wrapped.forEach((line: string) => {
          ensureSpace(5);
          doc.text(line, MARGIN_X, y);
          y += 4.5;
        });
      });
      y += 2;
    });
    y += 4;
  }

  // Cross-Model Strengths (radar chart + table)
  if (data.crossModelDimensions.length > 0) {
    ensureSpace(30);
    drawDivider();
    doc.setFont("Avenir", "bold");
    doc.setFontSize(14);
    doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
    doc.text("Cross-Model Strengths", MARGIN_X, y);
    doc.setFont("Avenir", "normal");
    y += 6;

    doc.setFontSize(9);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text("Normalized to % of max score across all completed assessments.", MARGIN_X, y);
    y += 7;

    // Render an actual radar chart if we have at least 3 dimensions
    const radarDims = [...data.crossModelDimensions]
      .sort((a, b) => b.averagePercent - a.averagePercent)
      .slice(0, 12);
    if (radarDims.length >= 3) {
      const radius = 36;
      const cx = PAGE_W / 2;
      ensureSpace(radius * 2 + 18);
      const cy = y + radius + 4;

      // Concentric grid (4 rings = 25/50/75/100%)
      doc.setDrawColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
      doc.setLineWidth(0.15);
      const n = radarDims.length;
      const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
      for (let ring = 1; ring <= 4; ring++) {
        const r = (radius * ring) / 4;
        for (let i = 0; i < n; i++) {
          const a1 = angleFor(i);
          const a2 = angleFor((i + 1) % n);
          doc.line(
            cx + r * Math.cos(a1),
            cy + r * Math.sin(a1),
            cx + r * Math.cos(a2),
            cy + r * Math.sin(a2)
          );
        }
      }
      // Spokes
      for (let i = 0; i < n; i++) {
        const a = angleFor(i);
        doc.line(cx, cy, cx + radius * Math.cos(a), cy + radius * Math.sin(a));
      }

      // Data polygon
      const points = radarDims.map((d, i) => {
        const a = angleFor(i);
        const r = (radius * Math.max(0, Math.min(100, d.averagePercent))) / 100;
        return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
      });
      doc.setDrawColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
      doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
      doc.setLineWidth(0.6);
      // Filled translucent polygon (jsPDF lacks alpha for fill in basic API,
      // so draw an outline + small filled dots at vertices)
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        doc.line(p1.x, p1.y, p2.x, p2.y);
      }
      points.forEach((p) => doc.circle(p.x, p.y, 0.8, "F"));

      // Axis labels around the perimeter
      doc.setFont("Avenir", "normal");
      doc.setFontSize(7);
      doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
      radarDims.forEach((d, i) => {
        const a = angleFor(i);
        const lx = cx + (radius + 4) * Math.cos(a);
        const ly = cy + (radius + 4) * Math.sin(a);
        const label = d.label.length > 22 ? d.label.slice(0, 21) + "…" : d.label;
        const align: "left" | "right" | "center" =
          Math.cos(a) > 0.2 ? "left" : Math.cos(a) < -0.2 ? "right" : "center";
        doc.text(label, lx, ly + 1, { align });
      });

      // Ring labels (25/50/75/100)
      doc.setFontSize(6);
      doc.setTextColor(LIGHT_GRAY.r - 60, LIGHT_GRAY.g - 60, LIGHT_GRAY.b - 60);
      for (let ring = 1; ring <= 4; ring++) {
        doc.text(`${ring * 25}%`, cx + 0.5, cy - (radius * ring) / 4 - 0.5);
      }

      y = cy + radius + 8;
    }

    const sorted = [...data.crossModelDimensions].sort((a, b) => b.averagePercent - a.averagePercent);
    const top = sorted.slice(0, 3);
    const bottom = sorted.slice(-3).reverse();

    doc.setFont("Avenir", "bold");
    doc.setFontSize(10);
    doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
    doc.text("Top strengths", MARGIN_X, y);
    doc.text("Priority gaps", MARGIN_X + CONTENT_W / 2, y);
    doc.setFont("Avenir", "normal");
    y += 5;

    doc.setFontSize(9);
    const rows = Math.max(top.length, bottom.length);
    for (let i = 0; i < rows; i++) {
      ensureSpace(5);
      if (top[i]) {
        doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
        const label = doc.splitTextToSize(top[i].label, CONTENT_W / 2 - 18)[0];
        doc.text(`• ${label}`, MARGIN_X, y);
        doc.setTextColor(34, 197, 94);
        doc.text(`${top[i].averagePercent}%`, MARGIN_X + CONTENT_W / 2 - 8, y, { align: "right" });
      }
      if (bottom[i]) {
        doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
        const label = doc.splitTextToSize(bottom[i].label, CONTENT_W / 2 - 18)[0];
        doc.text(`• ${label}`, MARGIN_X + CONTENT_W / 2, y);
        doc.setTextColor(239, 68, 68);
        doc.text(`${bottom[i].averagePercent}%`, PAGE_W - MARGIN_X, y, { align: "right" });
      }
      y += 5;
    }
    y += 4;

    // Full dimension table
    ensureSpace(12);
    doc.setFont("Avenir", "bold");
    doc.setFontSize(10);
    doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
    doc.text("All Dimensions", MARGIN_X, y);
    doc.setFont("Avenir", "normal");
    y += 5;

    doc.setDrawColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
    doc.setLineWidth(0.1);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
    y += 4;

    doc.setFontSize(9);
    sorted.forEach((d) => {
      ensureSpace(6);
      doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
      const label = doc.splitTextToSize(d.label, CONTENT_W - 50)[0];
      doc.text(label, MARGIN_X, y);
      doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
      doc.text(`${d.modelCount} model${d.modelCount === 1 ? "" : "s"}`, PAGE_W - MARGIN_X - 22, y, { align: "right" });
      const score = d.averagePercent;
      if (score >= 70) doc.setTextColor(34, 197, 94);
      else if (score >= 40) doc.setTextColor(251, 146, 60);
      else doc.setTextColor(239, 68, 68);
      doc.text(`${score}%`, PAGE_W - MARGIN_X, y, { align: "right" });
      y += 5;
    });
    y += 4;
  }

  // Per-Model Trends
  if (data.models.length > 0) {
    ensureSpace(30);
    drawDivider();
    doc.setFont("Avenir", "bold");
    doc.setFontSize(14);
    doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
    doc.text("Per-Model Trends", MARGIN_X, y);
    doc.setFont("Avenir", "normal");
    y += 8;

    data.models.forEach((m) => {
      ensureSpace(50);
      // Model card header
      doc.setFont("Avenir", "bold");
      doc.setFontSize(11);
      doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);
      const nameLines = doc.splitTextToSize(m.modelName, CONTENT_W - 60);
      doc.text(nameLines[0], MARGIN_X, y);
      doc.setFont("Avenir", "normal");

      // Latest score on right
      doc.setFont("Avenir", "bold");
      doc.setFontSize(14);
      doc.setTextColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
      doc.text(`${m.latestScore}/${m.maxScore}`, PAGE_W - MARGIN_X, y, { align: "right" });
      doc.setFont("Avenir", "normal");
      y += 5;

      doc.setFontSize(9);
      doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
      const meta: string[] = [];
      meta.push(`${m.assessmentCount} assessment${m.assessmentCount === 1 ? "" : "s"}`);
      if (m.latestLabel) meta.push(m.latestLabel);
      meta.push(`${m.latestScorePercent}% of max`);
      doc.text(meta.join(" · "), MARGIN_X, y);

      // Trend indicator
      let trendText = "";
      let trendColor = GRAY;
      if (m.trendDirection === "up") {
        trendText = `▲ +${m.trendDelta}%`;
        trendColor = { r: 34, g: 197, b: 94 };
      } else if (m.trendDirection === "down") {
        trendText = `▼ ${m.trendDelta}%`;
        trendColor = { r: 239, g: 68, b: 68 };
      } else if (m.trendDirection === "flat") {
        trendText = `— ${m.trendDelta >= 0 ? "+" : ""}${m.trendDelta}%`;
      } else {
        trendText = "single completion";
      }
      doc.setTextColor(trendColor.r, trendColor.g, trendColor.b);
      doc.text(trendText, PAGE_W - MARGIN_X, y, { align: "right" });
      y += 6;

      // Sparkline trend
      if (m.trend.length >= 2) {
        const chartH = 22;
        const chartW = CONTENT_W;
        const x0 = MARGIN_X;
        const y0 = y;
        // axes
        doc.setDrawColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
        doc.setLineWidth(0.2);
        doc.line(x0, y0 + chartH, x0 + chartW, y0 + chartH);

        const minS = 0;
        const maxS = m.maxScore;
        const range = Math.max(1, maxS - minS);
        const points = m.trend.map((t, i) => {
          const px = x0 + (chartW * i) / Math.max(1, m.trend.length - 1);
          const py = y0 + chartH - ((t.score - minS) / range) * chartH;
          return { px, py, t };
        });

        doc.setDrawColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
        doc.setLineWidth(0.6);
        for (let i = 1; i < points.length; i++) {
          doc.line(points[i - 1].px, points[i - 1].py, points[i].px, points[i].py);
        }
        doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
        points.forEach((p) => {
          doc.circle(p.px, p.py, 0.9, "F");
        });

        // axis labels
        doc.setFontSize(7);
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        const first = points[0];
        const last = points[points.length - 1];
        const firstDate = formatDate(first.t.completedAt);
        const lastDate = formatDate(last.t.completedAt);
        if (firstDate) doc.text(firstDate, x0, y0 + chartH + 3.5);
        if (lastDate && lastDate !== firstDate) {
          doc.text(lastDate, x0 + chartW, y0 + chartH + 3.5, { align: "right" });
        }
        y += chartH + 6;
      } else {
        doc.setFontSize(8);
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        doc.text("Take this assessment again to see a trend over time.", MARGIN_X, y);
        y += 5;
      }

      // separator
      doc.setDrawColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
      doc.setLineWidth(0.1);
      doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
      y += 5;
    });
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("Avenir", "normal");
    doc.setFontSize(8);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    const footer = `© ${new Date().getFullYear()} The Synozur Alliance LLC · Orion Insights · Page ${p} of ${pageCount}`;
    doc.text(footer, PAGE_W / 2, PAGE_H - 8, { align: "center" });
    if (data.scope === "tenant") {
      doc.text(
        "Tenant insights are anonymized; no individual users are identified.",
        PAGE_W / 2,
        PAGE_H - 12,
        { align: "center" }
      );
    }
  }

  return doc;
}
