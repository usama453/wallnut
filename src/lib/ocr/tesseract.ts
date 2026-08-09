import { createWorker } from "tesseract.js";

export interface OcrResult {
  text: string;
  confidence: number;
}

const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS ?? 15000);

/**
 * Extract visible text from image bytes using Tesseract (free, runs locally).
 * Best-effort: if OCR fails, times out or the worker can't start (e.g. some
 * serverless runtimes), we return empty text and let the AI model read the
 * image directly instead of failing the whole proof.
 */
export async function extractText(buffer: Buffer): Promise<OcrResult> {
  try {
    return await withTimeout(runOcr(buffer), OCR_TIMEOUT_MS, "OCR timed out");
  } catch (err) {
    console.warn(`[ocr] ${err instanceof Error ? err.message : err}; continuing without OCR text`);
    return { text: "", confidence: 0 };
  }
}

async function runOcr(buffer: Buffer): Promise<OcrResult> {
  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (process.env.AIPROOF_DEBUG === "1" && m.status === "recognizing text") {
        console.log(`[ocr] progress ${Math.round((m.progress ?? 0) * 100)}%`);
      }
    },
  });

  try {
    const { data } = await worker.recognize(buffer);
    const text = (data.text ?? "")
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");

    return { text, confidence: data.confidence ?? 0 };
  } finally {
    await worker.terminate().catch(() => {});
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
