export interface PdfRenderResult {
  /** PNG buffer of the first page. */
  buffer: Buffer;
}

/**
 * Rasterize the first page of a PDF to a PNG buffer.
 * Uses pdfjs-dist + @napi-rs/canvas via the `pdf-to-img` package (free, local).
 * The module is lazy-loaded so routes that only handle images never pull in
 * the PDF stack (keeps Vercel serverless bundles small).
 */
export async function renderPdfFirstPage(buffer: Buffer): Promise<PdfRenderResult> {
  const { pdf } = await import("pdf-to-img");
  const document = await pdf(buffer as Buffer, { scale: 2 });
  const page = await document.getPage(1);
  return { buffer: page };
}

/**
 * Rasterize every page of a PDF to PNG buffers. Used to build a multi-page
 * preview so the asset/report viewers can show the full document, with issue
 * markers drawn on their correct page.
 */
export async function renderPdfAllPages(buffer: Buffer): Promise<Buffer[]> {
  const { pdf } = await import("pdf-to-img");
  const document = await pdf(buffer as Buffer, { scale: 2 });
  const count = Math.max(document.length ?? 1, 1);
  const pages: Buffer[] = [];
  for (let i = 1; i <= count; i++) {
    const page = await document.getPage(i);
    if (page) pages.push(page);
  }
  if (!pages.length) pages.push(await document.getPage(1));
  return pages;
}
