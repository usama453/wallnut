/* Smoke test for the real AI pipeline: image -> normalize -> OCR -> Gemini report. */
import sharp from "sharp";
import { normalizeImage } from "../src/lib/image.ts";
import { extractText } from "../src/lib/ocr/tesseract.ts";
import { GeminiProvider } from "../src/lib/ai/gemini.ts";

const svg = `
<svg width="800" height="400" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="400" fill="#f8fafc"/>
  <text x="60" y="90" font-family="Helvetica" font-size="42" font-weight="bold" fill="#0f172a">Summer Sale - Feburary only</text>
  <text x="60" y="160" font-family="Helvetica" font-size="28" fill="#334155">Get 20% off with code SAVE20, visit www.tehbeststore.com</text>
  <text x="60" y="230" font-family="Helvetica" font-size="28" fill="#334155">Call 555-123-4567 to order</text>
  <rect x="60" y="280" width="260" height="60" rx="8" fill="#334155"/>
  <text x="90" y="320" font-family="Helvetica" font-size="26" fill="#ffffff">Shop Now</text>
</svg>`;

async function main() {
  const input = await sharp(Buffer.from(svg)).png().toBuffer();
  console.log("1. created test image,", input.length, "bytes");

  const norm = await normalizeImage(input);
  console.log(`2. normalized to ${norm.width}x${norm.height} (${norm.mimeType})`);

  const ocr = await extractText(norm.buffer);
  console.log("3. OCR text:");
  console.log("   " + ocr.text.split("\n").join(" | "));
  console.log(`   confidence=${Math.round(ocr.confidence)}`);

  const provider = new GeminiProvider();
  const { report } = await provider.analyzeAsset({
    imageBase64: norm.base64,
    mimeType: norm.mimeType,
    ocrText: ocr.text,
    brand: {
      company_name: "Teh Best Store",
      banned_words: ["cheap"],
      preferred_terminology: ["flyer"],
    },
  });

  console.log(`4. AI report: score=${report.score} status=${report.status}`);
  console.log(`   summary: ${report.summary}`);
  for (const [i, issue] of report.issues.entries()) {
    console.log(
      `   ${i + 1}. [${issue.severity}/${issue.category}] ${issue.title}` +
        (issue.suggestion ? ` -> ${issue.suggestion}` : ""),
    );
  }

  if (report.issues.length === 0) {
    console.error("FAIL: expected Gemini to find issues in this artwork");
    process.exit(1);
  }
  console.log("GEMINI PIPELINE OK");
}

main().catch((err) => {
  console.error("PIPELINE FAILED:", err.message);
  process.exit(1);
});
