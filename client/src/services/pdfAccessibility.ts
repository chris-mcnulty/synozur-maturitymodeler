/**
 * Tagged PDF helper for jsPDF.
 *
 * Tracks logical structure (headings, paragraphs, lists, tables, figures)
 * while drawing, emits PDF marked-content operators (`BDC ... EMC`) into
 * each page's content stream, and post-processes the result with pdf-lib
 * to add a structure tree, /Lang, /MarkInfo, /ViewerPreferences and full
 * DocumentInfo so the output is a tagged PDF.
 *
 * Marked-content sequences cannot cross page boundaries, so when a
 * leaf's draw callback paginates we close the open BDCs on the outgoing
 * page and reopen them with fresh MCIDs on the new page; the resulting
 * structure element references both MCIDs via Marked Content References
 * (PDF 1.7, 14.7.4.3).
 */

import jsPDF from "jspdf";
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  PDFRef,
  PDFArray,
  PDFNull,
} from "pdf-lib";

interface MCRef {
  pageIndex: number;
  mcid: number;
}

interface StructNode {
  role: string;
  alt?: string;
  lang?: string;
  actualText?: string;
  children: StructNode[];
  /** Set on leaves: every page+MCID where this node has marked content. */
  mcrs?: MCRef[];
}

interface OpenLeaf {
  node: StructNode;
  role: string;
}

export interface PdfMetadata {
  title: string;
  author?: string;
  subject?: string;
  keywords?: string;
  lang?: string;
}

export interface TaggedPdfDocument {
  bytes: Uint8Array;
  save(filename: string): void;
  output(type: "blob"): Blob;
  output(type: "arraybuffer"): ArrayBuffer;
  output(type: "datauristring"): string;
  output(type: "base64"): string;
  output(type: string): unknown;
}

export class TaggedPdf {
  readonly doc: jsPDF;
  private root: StructNode = { role: "Document", children: [] };
  private nodeStack: StructNode[];
  /** Stack of currently-open leaves (those wrapping live BDC operators). */
  private openLeaves: OpenLeaf[] = [];
  private pageMcidCounters: Map<number, number> = new Map();
  private currentPageIndex = 0;

  constructor(doc: jsPDF) {
    this.doc = doc;
    this.nodeStack = [this.root];
  }

  pageIndex(): number {
    return this.currentPageIndex;
  }

  /** Switch the active page. Must not be called while a leaf is open. */
  setPageIndex(idx: number): void {
    if (this.openLeaves.length > 0) {
      throw new Error("setPageIndex called while a marked-content leaf is open");
    }
    this.currentPageIndex = idx;
    this.doc.setPage(idx + 1);
  }

  /**
   * Add a new page. If any leaves are currently open we close their BDCs
   * on the outgoing page, page-break, then reopen fresh BDCs (with new
   * MCIDs) on the new page so the open structure elements gain
   * marked-content references on both pages.
   */
  addPage(): void {
    const open = [...this.openLeaves];
    for (let i = open.length - 1; i >= 0; i--) {
      this.write("EMC");
    }
    this.doc.addPage();
    this.currentPageIndex = this.doc.getNumberOfPages() - 1;
    for (const leaf of open) {
      const mcid = this.nextMcid();
      leaf.node.mcrs!.push({ pageIndex: this.currentPageIndex, mcid });
      this.write(`/${leaf.role} <</MCID ${mcid}>> BDC`);
    }
  }

  beginGroup(role: string, options?: { alt?: string; lang?: string; actualText?: string }): void {
    const node: StructNode = {
      role,
      alt: options?.alt,
      lang: options?.lang,
      actualText: options?.actualText,
      children: [],
    };
    this.nodeStack[this.nodeStack.length - 1].children.push(node);
    this.nodeStack.push(node);
  }

  endGroup(): void {
    if (this.nodeStack.length > 1) this.nodeStack.pop();
  }

  group<T>(
    role: string,
    fn: () => T,
    options?: { alt?: string; lang?: string; actualText?: string },
  ): T {
    this.beginGroup(role, options);
    try {
      return fn();
    } finally {
      this.endGroup();
    }
  }

  /**
   * Wrap `drawFn` in a marked-content range, registering the result as
   * a leaf in the structure tree. If `drawFn` triggers `addPage()` the
   * leaf will accumulate additional MCIDs on the new page(s).
   */
  mark<T>(
    role: string,
    drawFn: () => T,
    options?: { alt?: string; lang?: string; actualText?: string },
  ): T {
    const mcid = this.nextMcid();
    const node: StructNode = {
      role,
      alt: options?.alt,
      lang: options?.lang,
      actualText: options?.actualText,
      mcrs: [{ pageIndex: this.currentPageIndex, mcid }],
      children: [],
    };
    this.nodeStack[this.nodeStack.length - 1].children.push(node);

    this.write(`/${role} <</MCID ${mcid}>> BDC`);
    const leaf: OpenLeaf = { node, role };
    this.openLeaves.push(leaf);
    try {
      return drawFn();
    } finally {
      this.openLeaves.pop();
      this.write("EMC");
    }
  }

  /** Mark `drawFn` output as decorative (not part of reading order). */
  artifact(drawFn: () => void, kind: "Layout" | "Page" | "Pagination" = "Layout"): void {
    this.write(`/Artifact <</Type /${kind}>> BDC`);
    try {
      drawFn();
    } finally {
      this.write("EMC");
    }
  }

  private nextMcid(): number {
    const i = this.currentPageIndex;
    const v = this.pageMcidCounters.get(i) ?? 0;
    this.pageMcidCounters.set(i, v + 1);
    return v;
  }

  private write(s: string): void {
    (this.doc.internal as unknown as { write(s: string): void }).write(s);
  }

  _getRoot(): StructNode {
    return this.root;
  }
  _getMcidCount(pageIndex: number): number {
    return this.pageMcidCounters.get(pageIndex) ?? 0;
  }
}

export async function finalizeTaggedPdf(
  builder: TaggedPdf,
  metadata: PdfMetadata,
): Promise<TaggedPdfDocument> {
  const lang = metadata.lang || "en-US";

  try {
    (builder.doc as unknown as { setLanguage(l: string): void }).setLanguage(lang);
  } catch {
    /* older jsPDF builds do not expose setLanguage */
  }
  try {
    builder.doc.setDocumentProperties({
      title: metadata.title,
      subject: metadata.subject || metadata.title,
      author: metadata.author || "The Synozur Alliance LLC",
      keywords: metadata.keywords || "",
      creator: "Orion — Synozur Multi-Model Maturity Platform",
    });
  } catch {
    /* ignore */
  }

  const arr = builder.doc.output("arraybuffer") as ArrayBuffer;
  const pdfDoc = await PDFDocument.load(arr);

  pdfDoc.catalog.set(PDFName.of("Lang"), PDFString.of(lang));
  pdfDoc.catalog.set(
    PDFName.of("ViewerPreferences"),
    pdfDoc.context.obj({ DisplayDocTitle: true }),
  );
  pdfDoc.catalog.set(PDFName.of("MarkInfo"), pdfDoc.context.obj({ Marked: true }));

  pdfDoc.setTitle(metadata.title, { showInWindowTitleBar: true });
  if (metadata.author) pdfDoc.setAuthor(metadata.author);
  if (metadata.subject) pdfDoc.setSubject(metadata.subject);
  if (metadata.keywords) {
    pdfDoc.setKeywords(metadata.keywords.split(/[,;]\s*/).filter(Boolean));
  }
  pdfDoc.setProducer("Orion Tagged PDF Builder (jsPDF + pdf-lib)");
  pdfDoc.setCreator("Orion — Synozur Multi-Model Maturity Platform");
  pdfDoc.setLanguage(lang);

  const pages = pdfDoc.getPages();
  const root = builder._getRoot();

  // Per-page array indexed by MCID -> struct elem ref. The same struct
  // elem can be recorded in multiple pages when its content paginates.
  const pageParentArrays: (PDFRef | null)[][] = pages.map((_, i) => {
    const len = builder._getMcidCount(i);
    return new Array<PDFRef | null>(len).fill(null);
  });

  const structRootDict = pdfDoc.context.obj({ Type: "StructTreeRoot" });
  const structRootRef = pdfDoc.context.register(structRootDict);

  const allocate = (node: StructNode, parentRef: PDFRef): PDFRef => {
    const dict = pdfDoc.context.obj({
      Type: "StructElem",
      S: PDFName.of(node.role),
      P: parentRef,
    });
    const ref = pdfDoc.context.register(dict);

    if (node.alt) dict.set(PDFName.of("Alt"), PDFString.of(node.alt));
    if (node.actualText)
      dict.set(PDFName.of("ActualText"), PDFString.of(node.actualText));
    if (node.lang) dict.set(PDFName.of("Lang"), PDFString.of(node.lang));

    if (node.mcrs && node.mcrs.length > 0) {
      const first = node.mcrs[0];
      const firstPageRef = pages[first.pageIndex]?.ref;
      if (firstPageRef) dict.set(PDFName.of("Pg"), firstPageRef);

      if (node.mcrs.length === 1) {
        dict.set(PDFName.of("K"), PDFNumber.of(first.mcid));
      } else {
        const kArr = PDFArray.withContext(pdfDoc.context);
        for (const m of node.mcrs) {
          if (m.pageIndex === first.pageIndex) {
            kArr.push(PDFNumber.of(m.mcid));
          } else {
            const mcr = pdfDoc.context.obj({
              Type: "MCR",
              Pg: pages[m.pageIndex].ref,
              MCID: PDFNumber.of(m.mcid),
            });
            kArr.push(mcr);
          }
        }
        dict.set(PDFName.of("K"), kArr);
      }
      for (const m of node.mcrs) {
        const arr = pageParentArrays[m.pageIndex];
        if (arr) arr[m.mcid] = ref;
      }
    } else if (node.children.length > 0) {
      const kids = node.children.map((child) => allocate(child, ref));
      const kArr = PDFArray.withContext(pdfDoc.context);
      for (const kid of kids) kArr.push(kid);
      dict.set(PDFName.of("K"), kArr);
    }
    return ref;
  };

  const topRef = allocate(root, structRootRef);
  const topK = PDFArray.withContext(pdfDoc.context);
  topK.push(topRef);
  structRootDict.set(PDFName.of("K"), topK);

  // ParentTree.Nums: key per page (matching /StructParents) -> array of
  // struct elem refs indexed by MCID.
  const numsArr = PDFArray.withContext(pdfDoc.context);
  pageParentArrays.forEach((arr, idx) => {
    numsArr.push(PDFNumber.of(idx));
    const refsArr = PDFArray.withContext(pdfDoc.context);
    for (const ref of arr) {
      if (ref) refsArr.push(ref);
      else refsArr.push(PDFNull);
    }
    numsArr.push(refsArr);
    pages[idx].node.set(PDFName.of("StructParents"), PDFNumber.of(idx));
  });
  const parentTree = pdfDoc.context.obj({});
  parentTree.set(PDFName.of("Nums"), numsArr);
  structRootDict.set(PDFName.of("ParentTree"), parentTree);
  structRootDict.set(
    PDFName.of("ParentTreeNextKey"),
    PDFNumber.of(pages.length),
  );
  structRootDict.set(PDFName.of("RoleMap"), pdfDoc.context.obj({}));
  pdfDoc.catalog.set(PDFName.of("StructTreeRoot"), structRootRef);

  const bytes = await pdfDoc.save({ useObjectStreams: false });

  return {
    bytes,
    save(filename: string) {
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    output(type: string): unknown {
      switch (type) {
        case "blob":
          return new Blob([bytes], { type: "application/pdf" });
        case "arraybuffer":
          return bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          );
        case "datauristring": {
          let bin = "";
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          return `data:application/pdf;base64,${btoa(bin)}`;
        }
        case "base64": {
          let bin = "";
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          return btoa(bin);
        }
        default:
          return bytes;
      }
    },
  } as TaggedPdfDocument;
}
