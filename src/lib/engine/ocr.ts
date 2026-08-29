/**
 * S-CUBUS ERP — OCR Engine
 *
 * Extracts text from a photographed or scanned result sheet (JPG/PNG) using
 * Tesseract OCR, then applies a best-effort heuristic to turn that text
 * into the same {headers, rows} shape the Excel/CSV parser produces, so it
 * can flow through the exact same mapping/validation/import pipeline.
 *
 * OCR accuracy depends heavily on image quality — this is genuinely a
 * best-effort extraction, not a guarantee. The import wizard always shows
 * the extracted rows for review before anything is written, same as any
 * other upload.
 */

import { createWorker } from "tesseract.js";
import type { ParsedSheet } from "./workbook";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".bmp", ".webp"];

export function looksLikeImageFile(fileName: string, mimeType?: string | null): boolean {
  const lower = fileName.toLowerCase();
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  if (mimeType?.startsWith("image/")) return true;
  return false;
}

export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Splits OCR'd text into a table. OCR output for tabular data typically
 * separates columns with runs of 2+ spaces (or tabs) even when the
 * original image used ruled/boxed columns — this is the same heuristic
 * spreadsheet-from-plain-text tools use. The first non-empty line becomes
 * the header row.
 */
export function parseOcrTextToSheet(text: string, sheetName = "Scanned Sheet"): ParsedSheet {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { name: sheetName, headers: [], rows: [] };
  }

  const tokenize = (line: string): string[] =>
    line
      .split(/\s{2,}|\t+/)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);

  const headerLine = lines[0];
  const headers = tokenize(headerLine).map((h, i) => (h ? h : `Column ${i + 1}`));

  const rows = lines.slice(1).map((line) => {
    const cells = tokenize(line);
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? null;
    });
    return row;
  });

  return { name: sheetName, headers, rows };
}
