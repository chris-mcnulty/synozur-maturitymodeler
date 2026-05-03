/**
 * Certificate PDF generation for completed course enrollments.
 *
 * Builds a branded landscape US-Letter (792 x 612 pt) certificate using
 * `pdf-lib`, uploads the resulting bytes to private object storage, and
 * stamps an ACL policy with the learner as `owner`. The existing
 * `GET /objects/:objectPath` route then serves the PDF back to the
 * authenticated learner via the standard owner-based ACL check
 * (`canAccessObject` in `objectAcl.ts`).
 *
 * The generator is invoked from `recalculateEnrollment` whenever an
 * enrollment first transitions to "completed" on a course that has
 * `certificateEnabled = true`.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { randomUUID } from "crypto";
import { objectStorageClient } from "../objectStorage";
import { setObjectAclPolicy } from "../objectAcl";

export interface CertificateInput {
  courseTitle: string;
  learnerName: string;
  completedAt: Date;
  score?: number | null;
  signatureLine?: string; // e.g. "The Synozur Alliance"
}

/** Render a single-page landscape PDF certificate. Returns raw bytes. */
export async function renderCertificatePdf(input: CertificateInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  page.setSize(792, 612); // US Letter landscape
  const { width, height } = page.getSize();

  const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // Synozur brand: purple primary, pink accent.
  const primary = rgb(0.42, 0.27, 0.76);
  const accent = rgb(0.92, 0.36, 0.62);
  const ink = rgb(0.13, 0.13, 0.16);
  const muted = rgb(0.45, 0.45, 0.5);

  // Outer border
  page.drawRectangle({
    x: 24, y: 24, width: width - 48, height: height - 48,
    borderColor: primary, borderWidth: 3,
  });
  page.drawRectangle({
    x: 34, y: 34, width: width - 68, height: height - 68,
    borderColor: accent, borderWidth: 1,
  });

  // Header band
  page.drawRectangle({
    x: 34, y: height - 110, width: width - 68, height: 60,
    color: primary,
  });
  const headerText = "CERTIFICATE OF COMPLETION";
  const headerSize = 22;
  const headerWidth = titleFont.widthOfTextAtSize(headerText, headerSize);
  page.drawText(headerText, {
    x: (width - headerWidth) / 2,
    y: height - 90,
    size: headerSize,
    font: titleFont,
    color: rgb(1, 1, 1),
  });

  const presentedText = "This is to certify that";
  const presentedSize = 14;
  const presentedWidth = bodyFont.widthOfTextAtSize(presentedText, presentedSize);
  page.drawText(presentedText, {
    x: (width - presentedWidth) / 2,
    y: height - 170,
    size: presentedSize,
    font: italicFont,
    color: muted,
  });

  // Learner name
  const name = input.learnerName.trim() || "Valued Learner";
  let nameSize = 36;
  let nameWidth = titleFont.widthOfTextAtSize(name, nameSize);
  while (nameWidth > width - 140 && nameSize > 18) {
    nameSize -= 2;
    nameWidth = titleFont.widthOfTextAtSize(name, nameSize);
  }
  page.drawText(name, {
    x: (width - nameWidth) / 2,
    y: height - 215,
    size: nameSize,
    font: titleFont,
    color: ink,
  });
  // underline
  page.drawLine({
    start: { x: (width - nameWidth) / 2 - 12, y: height - 224 },
    end: { x: (width + nameWidth) / 2 + 12, y: height - 224 },
    thickness: 1,
    color: accent,
  });

  const completedLine = "has successfully completed the course";
  const completedSize = 14;
  const completedWidth = bodyFont.widthOfTextAtSize(completedLine, completedSize);
  page.drawText(completedLine, {
    x: (width - completedWidth) / 2,
    y: height - 260,
    size: completedSize,
    font: italicFont,
    color: muted,
  });

  // Course title
  const title = input.courseTitle;
  let titleSize = 24;
  let titleWidth = titleFont.widthOfTextAtSize(title, titleSize);
  while (titleWidth > width - 140 && titleSize > 14) {
    titleSize -= 1;
    titleWidth = titleFont.widthOfTextAtSize(title, titleSize);
  }
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: height - 300,
    size: titleSize,
    font: titleFont,
    color: primary,
  });

  // Date + score row
  const dateStr = input.completedAt.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const detailSize = 12;
  const dateLabelY = 130;
  page.drawText("Date of completion", { x: 90, y: dateLabelY + 22, size: 10, font: bodyFont, color: muted });
  page.drawText(dateStr, { x: 90, y: dateLabelY, size: detailSize, font: titleFont, color: ink });
  page.drawLine({ start: { x: 90, y: dateLabelY - 6 }, end: { x: 290, y: dateLabelY - 6 }, thickness: 0.7, color: muted });

  if (typeof input.score === "number") {
    page.drawText("Final score", { x: width / 2 - 50, y: dateLabelY + 22, size: 10, font: bodyFont, color: muted });
    page.drawText(`${input.score} / 100`, { x: width / 2 - 50, y: dateLabelY, size: detailSize, font: titleFont, color: ink });
    page.drawLine({ start: { x: width / 2 - 50, y: dateLabelY - 6 }, end: { x: width / 2 + 60, y: dateLabelY - 6 }, thickness: 0.7, color: muted });
  }

  const signature = input.signatureLine || "The Synozur Alliance";
  page.drawText("Issued by", { x: width - 290, y: dateLabelY + 22, size: 10, font: bodyFont, color: muted });
  page.drawText(signature, { x: width - 290, y: dateLabelY, size: detailSize, font: titleFont, color: ink });
  page.drawLine({ start: { x: width - 290, y: dateLabelY - 6 }, end: { x: width - 90, y: dateLabelY - 6 }, thickness: 0.7, color: muted });

  // Footer caption
  const footer = "Orion — Synozur Multi-Model Maturity Platform";
  const footerSize = 9;
  const footerWidth = bodyFont.widthOfTextAtSize(footer, footerSize);
  page.drawText(footer, {
    x: (width - footerWidth) / 2,
    y: 60,
    size: footerSize,
    font: bodyFont,
    color: muted,
  });

  return await pdf.save();
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  if (parts.length < 3) throw new Error("Invalid path");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

/**
 * Generate the certificate PDF, upload it to private object storage, set
 * an ACL granting the learner read access, and return the canonical
 * `/objects/<id>` URL suitable for the existing `GET /objects/:objectPath`
 * download route.
 */
export async function generateAndStoreCertificate(
  input: CertificateInput,
  ownerUserId: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) {
    throw new Error("PRIVATE_OBJECT_DIR not set; cannot store certificate");
  }
  const bytes = await renderCertificatePdf(input);

  const objectId = `certificates/${randomUUID()}.pdf`;
  const fullPath = `${privateDir.replace(/\/$/, "")}/${objectId}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const file = objectStorageClient.bucket(bucketName).file(objectName);

  await file.save(Buffer.from(bytes), {
    contentType: "application/pdf",
    resumable: false,
  });

  await setObjectAclPolicy(file, { owner: ownerUserId, visibility: "private" });

  return `/objects/${objectId}`;
}
