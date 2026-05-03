import jsPDF from "jspdf";
import type { Result, Model, Dimension } from "@shared/schema";
// @ts-ignore
import logoImage from "@assets/SA-Logo-Horizontal-color_1760530252980.png";
import { loadAvenirFonts, applyAvenirFonts } from "./pdfFonts";
import {
  TaggedPdf,
  finalizeTaggedPdf,
  type TaggedPdfDocument,
} from "./pdfAccessibility";

interface PDFData {
  result: Result;
  model: Model & { dimensions: Dimension[] };
  benchmark?: { meanScore: number; sampleSize: number };
  recommendations?: Array<{
    title: string;
    description: string;
  }>;
  improvementResources?: Array<{
    question: string;
    answer?: string;
    improvementStatement?: string;
    resourceLink?: string;
  }>;
  maturitySummary?: string;
  recommendationsSummary?: string;
  userContext?: {
    name?: string;
    company?: string;
    jobTitle?: string;
    industry?: string;
    companySize?: string;
  };
}

// Kick off font loading as soon as this module is imported so the network
// fetch happens in parallel with the rest of the chunk being parsed/executed.
const avenirFontsPromise = loadAvenirFonts();

/**
 * Generate a tagged, accessible assessment PDF report.
 *
 * The returned object exposes a `save(filename)` method matching the
 * jsPDF API, plus an `output(type)` accessor used by the email path
 * (`pdf.output('blob')`). The document is post-processed with pdf-lib
 * to add a structure tree, /Lang, /MarkInfo, /ViewerPreferences and
 * full DocumentInfo so it validates as a tagged PDF.
 */
export async function generateAssessmentPDF(
  data: PDFData,
): Promise<TaggedPdfDocument> {
  const {
    result,
    model,
    benchmark,
    recommendations = [],
    improvementResources = [],
    maturitySummary,
    recommendationsSummary,
    userContext,
  } = data;

  const fonts = await avenirFontsPromise.catch(() => null);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  if (fonts) {
    applyAvenirFonts(doc, fonts);
  }

  const tagger = new TaggedPdf(doc);

  const primaryColor = { r: 129, g: 15, b: 251 };
  const accentColor = { r: 230, g: 12, b: 179 };
  const textColor = { r: 51, g: 51, b: 51 };
  const grayColor = { r: 102, g: 102, b: 102 };
  void accentColor;

  let yPosition = 15;

  const pageBreakIfNeeded = (threshold: number, resetY = 20) => {
    if (yPosition > threshold) {
      tagger.addPage();
      yPosition = resetY;
    }
  };

  // === Header (logo + tagline) — decorative artifact ===
  tagger.artifact(() => {
    try {
      const logoWidth = 60;
      const logoHeight = 20;
      const logoX = (210 - logoWidth) / 2;
      doc.addImage(logoImage, "PNG", logoX, yPosition, logoWidth, logoHeight);
    } catch (error) {
      console.error("Failed to add logo to PDF:", error);
      doc.setFontSize(12);
      doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
      doc.text("THE SYNOZUR ALLIANCE LLC", 105, yPosition, { align: "center" });
    }
  }, "Page");
  yPosition += 28;

  // The brand tagline carries no informational value beyond the title;
  // mark it as an artifact so the structured reading order starts at
  // the report's main heading.
  tagger.artifact(() => {
    doc.setFontSize(9);
    doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
    doc.text(
      "The Transformation Company | Find Your North Star",
      105,
      yPosition,
      { align: "center" },
    );
  });
  yPosition += 15;

  // === Title block ===
  tagger.beginGroup("Sect");
  tagger.mark("H1", () => {
    doc.setFont("Avenir", "bold");
    doc.setFontSize(24);
    doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.text(`${model.name} Report`, 105, yPosition, { align: "center" });
    doc.setFont("Avenir", "normal");
  });

  if (userContext) {
    yPosition += 10;
    doc.setFontSize(10);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    if (userContext.name) {
      tagger.mark("P", () => {
        doc.text(`Prepared for: ${userContext.name}`, 105, yPosition, {
          align: "center",
        });
      });
      yPosition += 5;
    }
    if (userContext.company) {
      tagger.mark("P", () => {
        doc.text(userContext.company!, 105, yPosition, { align: "center" });
      });
      yPosition += 5;
    }
  }

  yPosition += 5;
  tagger.mark("P", () => {
    doc.setFontSize(10);
    doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
    doc.text(
      `Assessment Date: ${new Date().toLocaleDateString()}`,
      105,
      yPosition,
      { align: "center" },
    );
  });
  tagger.endGroup();

  yPosition += 15;

  // === Overall maturity score section ===
  tagger.artifact(() => {
    doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.setLineWidth(0.5);
    doc.line(20, yPosition, 190, yPosition);
  });
  yPosition += 10;

  tagger.beginGroup("Sect");
  tagger.mark("H2", () => {
    doc.setFont("Avenir", "bold");
    doc.setFontSize(18);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text("Overall Maturity Score", 25, yPosition);
    doc.setFont("Avenir", "normal");
  });

  yPosition += 15;
  tagger.mark(
    "P",
    () => {
      doc.setFontSize(36);
      doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
      const scoreText = result.overallScore.toString();
      const scoreWidth = doc.getTextWidth(scoreText);
      doc.text(scoreText, 25, yPosition);
      doc.setFontSize(14);
      doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
      doc.text("out of 500", 25 + scoreWidth + 3, yPosition);
    },
    {
      actualText: `Overall maturity score: ${result.overallScore} out of 500.`,
    },
  );

  yPosition += 15;
  tagger.mark("H3", () => {
    doc.setFontSize(16);
    doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.text(`Maturity Level: ${result.label}`, 25, yPosition);
  });
  yPosition += 10;

  if (maturitySummary) {
    yPosition += 10;
    tagger.mark("H3", () => {
      doc.setFont("Avenir", "bold");
      doc.setFontSize(12);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text("Executive Summary", 25, yPosition);
      doc.setFont("Avenir", "normal");
    });
    yPosition += 8;
    doc.setFontSize(9);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    const summaryLines = doc.splitTextToSize(maturitySummary, 160);
    tagger.mark(
      "P",
      () => {
        summaryLines.forEach((line: string) => {
          if (yPosition > 240) {
            tagger.addPage();
            yPosition = 20;
          }
          doc.text(line, 25, yPosition);
          yPosition += 5;
        });
      },
      { actualText: maturitySummary },
    );
    yPosition += 10;
  } else {
    let maturityDescription = "";
    switch (result.label) {
      case "Transformational":
        maturityDescription =
          "You're at the forefront of AI transformation, leading the industry with mature practices.";
        break;
      case "Strategic":
        maturityDescription =
          "You're strategic with AI as a differentiator. Double down on responsible AI, proprietary models, and organizational culture.";
        break;
      case "Operational":
        maturityDescription =
          "You have good operational AI processes with clear opportunities to advance to strategic maturity.";
        break;
      case "Experimental":
        maturityDescription =
          "You're experimenting with AI and building momentum. Focus on scaling successful pilots.";
        break;
      case "Nascent":
        maturityDescription =
          "You're at the beginning of your AI journey with significant growth potential ahead.";
        break;
    }
    if (maturityDescription) {
      tagger.mark("P", () => {
        doc.setFontSize(10);
        doc.setTextColor(textColor.r, textColor.g, textColor.b);
        const lines = doc.splitTextToSize(maturityDescription, 160);
        lines.forEach((line: string) => {
          doc.text(line, 25, yPosition);
          yPosition += 5;
        });
      });
      yPosition += 10;
    }
  }
  tagger.endGroup();

  // === Benchmark comparison ===
  if (benchmark) {
    tagger.beginGroup("Sect");
    tagger.mark("H3", () => {
      doc.setFont("Avenir", "bold");
      doc.setFontSize(12);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text("Industry Benchmark", 25, yPosition);
      doc.setFont("Avenir", "normal");
    });
    yPosition += 7;

    tagger.mark("P", () => {
      doc.setFontSize(10);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text(
        `Your Score: ${result.overallScore} | Industry Average: ${benchmark.meanScore}`,
        25,
        yPosition,
      );
    });
    yPosition += 5;
    tagger.mark("P", () => {
      doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
      doc.text(`Based on ${benchmark.sampleSize} organizations`, 25, yPosition);
    });
    yPosition += 10;
    tagger.endGroup();
  }

  // === Dimension breakdown table ===
  tagger.artifact(() => {
    doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.line(20, yPosition, 190, yPosition);
  });
  yPosition += 10;

  tagger.beginGroup("Sect");
  tagger.mark("H2", () => {
    doc.setFont("Avenir", "bold");
    doc.setFontSize(14);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text("Dimension Breakdown", 25, yPosition);
    doc.setFont("Avenir", "normal");
  });
  yPosition += 10;

  // Real PDF table semantics: Table > TR(header) > TH x N, then Table > TR > TD x N
  tagger.beginGroup("Table", {
    alt: "Dimension scores out of 500.",
  });
  tagger.beginGroup("TR");
  doc.setFontSize(10);
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  tagger.mark("TH", () => doc.text("Dimension", 30, yPosition));
  tagger.mark("TH", () =>
    doc.text("Score", 160, yPosition, { align: "right" }),
  );
  tagger.endGroup(); // TR
  yPosition += 5;

  tagger.artifact(() => {
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    doc.line(30, yPosition, 180, yPosition);
  });
  yPosition += 5;

  const dimensionScores = model.dimensions.map((dim) => ({
    label: dim.label,
    score: (result.dimensionScores as Record<string, number>)[dim.key] || 0,
  }));

  dimensionScores.forEach((dim) => {
    if (yPosition > 270) {
      tagger.addPage();
      yPosition = 20;
    }
    tagger.beginGroup("TR");
    tagger.mark("TD", () => {
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text(dim.label, 30, yPosition);
    });
    tagger.mark("TD", () => {
      if (dim.score >= 400) {
        doc.setTextColor(34, 197, 94);
      } else if (dim.score >= 300) {
        doc.setTextColor(251, 146, 60);
      } else {
        doc.setTextColor(239, 68, 68);
      }
      doc.text(dim.score.toString(), 160, yPosition, { align: "right" });
    });
    tagger.endGroup();
    yPosition += 7;
  });
  tagger.endGroup(); // Table
  tagger.endGroup(); // Sect

  yPosition += 10;
  pageBreakIfNeeded(220);

  // === Recommendations ===
  if (recommendationsSummary || recommendations.length > 0) {
    tagger.artifact(() => {
      doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
      doc.line(20, yPosition, 190, yPosition);
    });
    yPosition += 10;

    tagger.beginGroup("Sect");

    if (recommendationsSummary) {
      tagger.mark("H2", () => {
        doc.setFont("Avenir", "bold");
        doc.setFontSize(12);
        doc.setTextColor(textColor.r, textColor.g, textColor.b);
        doc.text("Your Transformation Roadmap", 25, yPosition);
        doc.setFont("Avenir", "normal");
      });
      yPosition += 8;

      doc.setFontSize(9);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      const summaryLines = doc.splitTextToSize(recommendationsSummary, 160);
      tagger.mark(
        "P",
        () => {
          summaryLines.forEach((line: string) => {
            if (yPosition > 270) {
              tagger.addPage();
              yPosition = 20;
            }
            doc.text(line, 25, yPosition);
            yPosition += 5;
          });
        },
        { actualText: recommendationsSummary },
      );
      yPosition += 10;
    }

    if (recommendations.length > 0) {
      tagger.mark("H2", () => {
        doc.setFont("Avenir", "bold");
        doc.setFontSize(12);
        doc.setTextColor(textColor.r, textColor.g, textColor.b);
        doc.text("Strategic Action Items", 25, yPosition);
        doc.setFont("Avenir", "normal");
      });
      yPosition += 8;

      // Use a real PDF list
      tagger.beginGroup("L");
      recommendations.forEach((rec) => {
        if (yPosition > 250) {
          tagger.addPage();
          yPosition = 20;
        }
        tagger.beginGroup("LI");
        tagger.mark("Lbl", () => {
          doc.setFont("Avenir", "bold");
          doc.setFontSize(10);
          doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
          doc.text("•", 27, yPosition);
        });
        tagger.beginGroup("LBody");
        tagger.mark("H3", () => {
          doc.setFont("Avenir", "bold");
          doc.setFontSize(10);
          doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
          doc.text(rec.title, 30, yPosition);
          doc.setFont("Avenir", "normal");
        });
        yPosition += 5;

        doc.setFontSize(9);
        doc.setTextColor(textColor.r, textColor.g, textColor.b);
        const descLines = doc.splitTextToSize(rec.description, 150);
        tagger.mark(
          "P",
          () => {
            descLines.forEach((line: string) => {
              if (yPosition > 270) {
                tagger.addPage();
                yPosition = 20;
              }
              doc.text(line, 35, yPosition);
              yPosition += 4;
            });
          },
          { actualText: rec.description },
        );
        yPosition += 5;
        tagger.endGroup(); // LBody
        tagger.endGroup(); // LI
      });
      tagger.endGroup(); // L
    }
    tagger.endGroup(); // Sect
  }

  // === Improvement resources ===
  if (improvementResources.length > 0) {
    pageBreakIfNeeded(220);
    yPosition += 10;
    tagger.artifact(() => {
      doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
      doc.line(20, yPosition, 190, yPosition);
    });
    yPosition += 10;

    tagger.beginGroup("Sect");
    tagger.mark("H2", () => {
      doc.setFont("Avenir", "bold");
      doc.setFontSize(14);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text("Improvement Resources", 25, yPosition);
      doc.setFont("Avenir", "normal");
    });
    yPosition += 10;

    tagger.beginGroup("L");
    improvementResources.forEach((resource) => {
      if (yPosition > 250) {
        tagger.addPage();
        yPosition = 20;
      }

      tagger.beginGroup("LI");
      tagger.beginGroup("LBody");

      tagger.mark("P", () => {
        doc.setFontSize(9);
        doc.setTextColor(textColor.r, textColor.g, textColor.b);
        doc.text(`Question: ${resource.question}`, 30, yPosition);
      });
      yPosition += 5;

      if (resource.answer) {
        tagger.mark("P", () => {
          doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
          doc.text(`Answer: ${resource.answer}`, 30, yPosition);
        });
        yPosition += 5;
      }

      if (resource.improvementStatement) {
        const improvementLines = doc.splitTextToSize(
          resource.improvementStatement,
          150,
        );
        tagger.mark(
          "P",
          () => {
            doc.setTextColor(textColor.r, textColor.g, textColor.b);
            improvementLines.forEach((line: string) => {
              doc.text(line, 30, yPosition);
              yPosition += 4;
            });
          },
          { actualText: resource.improvementStatement },
        );
        yPosition += 3;
      }

      if (resource.resourceLink) {
        tagger.mark(
          "Link",
          () => {
            doc.setFontSize(8);
            doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
            doc.text(`Resource: ${resource.resourceLink}`, 30, yPosition);
          },
          { actualText: `Resource link: ${resource.resourceLink}` },
        );
        yPosition += 5;
      }

      yPosition += 3;
      tagger.endGroup(); // LBody
      tagger.endGroup(); // LI
    });
    tagger.endGroup(); // L
    tagger.endGroup(); // Sect
  }

  pageBreakIfNeeded(215);

  // === Footer / call to action ===
  tagger.artifact(() => {
    doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.line(20, yPosition, 190, yPosition);
  });
  yPosition += 10;

  tagger.beginGroup("Sect");
  tagger.mark("H2", () => {
    doc.setFont("Avenir", "bold");
    doc.setFontSize(14);
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text("Ready to Transform Your Organization?", 25, yPosition);
    doc.setFont("Avenir", "normal");
  });
  yPosition += 8;

  tagger.mark("P", () => {
    doc.setFontSize(10);
    doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
    doc.text(
      "Connect with our transformation experts to create a custom roadmap",
      25,
      yPosition,
    );
    yPosition += 5;
    doc.text(
      "for your organization's unique journey to excellence.",
      25,
      yPosition,
    );
  });
  yPosition += 10;

  tagger.mark("H3", () => {
    doc.setFont("Avenir", "bold");
    doc.setFontSize(11);
    doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
    doc.text("Take Action Today:", 25, yPosition);
    doc.setFont("Avenir", "normal");
  });
  yPosition += 8;

  const cta: Array<{ label: string; url: string }> = [
    { label: "Schedule a Workshop", url: "https://www.synozur.com/start" },
    {
      label: "Learn More About Our Services",
      url: "https://www.synozur.com/services-overview/default",
    },
    { label: "Contact Our Experts", url: "ContactUs@synozur.com" },
  ];

  tagger.beginGroup("L");
  cta.forEach((item) => {
    tagger.beginGroup("LI");
    tagger.mark("Lbl", () => {
      doc.setFontSize(9);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text("•", 27, yPosition);
    });
    tagger.beginGroup("LBody");
    tagger.mark("P", () => {
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text(`${item.label}:`, 30, yPosition);
    });
    yPosition += 5;
    tagger.mark(
      "Link",
      () => {
        doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
        doc.text(`  ${item.url}`, 30, yPosition);
      },
      { actualText: `${item.label}: ${item.url}` },
    );
    yPosition += 7;
    tagger.endGroup(); // LBody
    tagger.endGroup(); // LI
  });
  tagger.endGroup(); // L

  yPosition += 5;
  tagger.endGroup(); // Sect

  // Copyright/legal as artifact (boilerplate, not part of reading order)
  tagger.artifact(() => {
    doc.setFontSize(8);
    doc.setTextColor(grayColor.r, grayColor.g, grayColor.b);
    const year = new Date().getFullYear();
    doc.text(
      `© ${year} The Synozur Alliance LLC. All Rights Reserved.`,
      105,
      yPosition,
      { align: "center" },
    );
    doc.text(
      "This assessment, its methodology, and all associated intellectual property are proprietary to",
      105,
      yPosition + 4,
      { align: "center" },
    );
    doc.text(
      "The Synozur Alliance LLC and protected under applicable copyright and trademark laws.",
      105,
      yPosition + 7,
      { align: "center" },
    );
    doc.text(
      "Unauthorized reproduction or distribution is prohibited.",
      105,
      yPosition + 10,
      { align: "center" },
    );
  });

  // === Finalize: post-process to inject structure tree, metadata, etc. ===
  return finalizeTaggedPdf(tagger, {
    title: `${model.name} Maturity Report${
      userContext?.name ? ` — Prepared for ${userContext.name}` : ""
    }`,
    subject: `${model.name} maturity assessment results`,
    author:
      userContext?.company || userContext?.name || "The Synozur Alliance LLC",
    keywords: [
      "maturity assessment",
      model.name,
      "Synozur",
      "Orion",
      result.label || "",
    ]
      .filter(Boolean)
      .join(", "),
    lang: "en-US",
  });
}
