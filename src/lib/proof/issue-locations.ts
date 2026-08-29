import type { RawIssue } from "@/lib/ai";
import type { OcrWord } from "@/lib/ocr/tesseract";

export interface NormalizedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LocationContext {
  canonicalText: string;
  imageWidth: number;
  imageHeight: number;
  ocrWords: OcrWord[];
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function normalizeWord(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9']/g, "");
}

function bboxToNormalized(
  bbox: OcrWord["bbox"],
  imageWidth: number,
  imageHeight: number,
): NormalizedBox {
  const w = Math.max(imageWidth, 1);
  const h = Math.max(imageHeight, 1);
  return {
    x: clamp01(bbox.x0 / w),
    y: clamp01(bbox.y0 / h),
    w: clamp01(Math.max((bbox.x1 - bbox.x0) / w, 0.01)),
    h: clamp01(Math.max((bbox.y1 - bbox.y0) / h, 0.01)),
  };
}

/** Rough placement from line/word index when OCR boxes are unavailable. */
export function estimateWordLocation(
  fullText: string,
  word: string,
): NormalizedBox | null {
  const target = normalizeWord(word);
  if (!target) return null;

  const lines = fullText.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const tokens = line.match(/[A-Za-z']+/g) ?? [];
    for (const token of tokens) {
      if (normalizeWord(token) !== target) continue;

      const tokenIdx = line.indexOf(token);
      const lineHeight = 1 / lines.length;
      const y = lineIdx * lineHeight + lineHeight * 0.12;
      const lineLen = Math.max(line.length, 1);
      const x = tokenIdx / lineLen;
      const w = Math.min(0.35, token.length / lineLen + 0.02);
      const h = Math.min(0.1, lineHeight * 0.75);

      return {
        x: clamp01(x),
        y: clamp01(y),
        w: clamp01(w),
        h: clamp01(h),
      };
    }
  }

  return null;
}

export function locateWord(
  word: string,
  context: LocationContext,
): NormalizedBox | null {
  const target = normalizeWord(word);
  if (!target) return null;

  if (context.imageWidth > 0 && context.imageHeight > 0 && context.ocrWords.length) {
    for (const entry of context.ocrWords) {
      const candidate = normalizeWord(entry.text);
      if (!candidate) continue;
      if (candidate === target || candidate.replace(/'s$/, "") === target.replace(/'s$/, "")) {
        return bboxToNormalized(entry.bbox, context.imageWidth, context.imageHeight);
      }
    }
  }

  return estimateWordLocation(context.canonicalText, word);
}

export function extractQuotedWords(issue: Pick<RawIssue, "title" | "description" | "suggestion">): string[] {
  const hay = `${issue.title} ${issue.description ?? ""} ${issue.suggestion ?? ""}`;
  const words: string[] = [];
  for (const match of hay.matchAll(/"([^"]+)"/g)) {
    if (match[1]) words.push(match[1]);
  }
  return words;
}

function hasValidLocation(issue: RawIssue): boolean {
  return (
    issue.location != null
    && typeof issue.location.x === "number"
    && typeof issue.location.y === "number"
    && Number.isFinite(issue.location.x)
    && Number.isFinite(issue.location.y)
  );
}

/** Fill missing issue boxes from OCR words or transcription layout. */
export function enrichIssueLocations(issues: RawIssue[], context: LocationContext) {
  for (const issue of issues) {
    if (hasValidLocation(issue)) continue;

    const quoted = extractQuotedWords(issue);
    for (const word of quoted) {
      const location = locateWord(word, context);
      if (location) {
        issue.location = location;
        break;
      }
    }
  }
}

export function markerPosition(issue: {
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
  location?: NormalizedBox | null;
}): { left: string; top: string } | null {
  const x = issue.location?.x ?? issue.x;
  const y = issue.location?.y ?? issue.y;
  if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;

  const w = issue.location?.w ?? issue.w ?? 0.08;
  const h = issue.location?.h ?? issue.h ?? 0.05;
  const cx = clamp01(x + w / 2);
  const cy = clamp01(y + h / 2);

  return {
    left: `${cx * 100}%`,
    top: `${cy * 100}%`,
  };
}

export function highlightBox(issue: {
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
  location?: NormalizedBox | null;
}): NormalizedBox | null {
  const x = issue.location?.x ?? issue.x;
  const y = issue.location?.y ?? issue.y;
  if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;

  return {
    x: clamp01(x),
    y: clamp01(y),
    w: clamp01(issue.location?.w ?? issue.w ?? 0.08),
    h: clamp01(issue.location?.h ?? issue.h ?? 0.05),
  };
}
