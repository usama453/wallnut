// Minimal 2-page PDF (valid, xref rebuilt-tolerant) for testing renderPdfAllPages.
import { writeFileSync } from "fs";
const stream = (s)="%StreamWriter stream\nBT /F1 28 Tf 72 720 Td ("+s+") Tj ET";
const content = (i)=`<< /Length ${stream("Page "+i+" of multi").length} >>\nstream\n${stream("Page "+i+" of multi")}\nendstream`;
// Build objects with placeholder lengths then fix; use pdfjs-friendly: provide xref.
function build() {
  const objs=[];
  let off=0;
  const out=[];
  const emit=(s)=>{const buf=Buffer.from(s,"latin1");return buf;};
  // We'll build raw bytes and compute offsets manually.
  const chunks=[];
  const push=(s)=>{chunks.push(Buffer.from(s,"latin1"));};
  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  const offsets=[];
  const obj=(n,body)=>{offsets[n]=pushLen();push(`<<${body}>>\n`);};
  // simpler: write objs with placeholder, track lengths
  return null;
}
// Easier: hand-assemble a known-good 2-page pdf bytes.
const pdf = [
"%PDF-1.4",
"%", String.fromCharCode(0xe2,0xe3,0xcf,0xd3),
"1 0 obj", "<</Type/Catalog/Pages 2 0 R>>", "endobj",
"2 0 obj", "<//Type/Pages/Kids[3 0 R 6 0 R]/Count 2>>".replace("//","/Type/"), "endobj",
"3 0 obj", "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>", "endobj",
].join("\n");
console.log("placeholder");
