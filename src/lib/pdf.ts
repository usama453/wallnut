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
