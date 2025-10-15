// Font utilities for PDF generation
import { readFileSync } from 'fs';
import { join } from 'path';

// Convert font file to base64 for jsPDF
export function getFontBase64(fontPath: string): string {
  try {
    const fontBuffer = readFileSync(fontPath);
    return fontBuffer.toString('base64');
  } catch (error) {
    console.error('Error loading font:', error);
    return '';
  }
}

// Avenir Next LT Pro Regular font as base64
// This will be populated with the actual base64 string
export const AVENIR_REGULAR_BASE64 = getFontBase64(
  join(process.cwd(), 'attached_assets/26301410506_1760540079588.ttf')
);

// Avenir Next LT Pro Bold font as base64 (will be added when provided)
export const AVENIR_BOLD_BASE64 = '';
