import type jsPDF from "jspdf";
import regularUrl from "@/assets/fonts/AvenirNextLTPro-Regular.ttf?url";
import boldUrl from "@/assets/fonts/AvenirNextLTPro-Bold.ttf?url";

export interface AvenirFonts {
  regular: string;
  bold: string;
}

let cached: Promise<AvenirFonts> | null = null;

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return btoa(binary);
}

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load font asset (${res.status}): ${url}`);
  }
  const buf = await res.arrayBuffer();
  return bufferToBase64(buf);
}

export function loadAvenirFonts(): Promise<AvenirFonts> {
  if (!cached) {
    cached = Promise.all([
      fetchAsBase64(regularUrl),
      fetchAsBase64(boldUrl),
    ]).then(([regular, bold]) => ({ regular, bold }));
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

export function applyAvenirFonts(doc: jsPDF, fonts: AvenirFonts): void {
  try {
    doc.addFileToVFS("AvenirNextLTPro-Regular.ttf", fonts.regular);
    doc.addFont("AvenirNextLTPro-Regular.ttf", "Avenir", "normal");
    doc.addFileToVFS("AvenirNextLTPro-Bold.ttf", fonts.bold);
    doc.addFont("AvenirNextLTPro-Bold.ttf", "Avenir", "bold");
    doc.setFont("Avenir", "normal");
  } catch (err) {
    console.error("Avenir font load failed, using default:", err);
  }
}
