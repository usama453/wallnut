/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["sharp", "tesseract.js", "pdf-to-img"],
  experimental: {
    outputFileTracingIncludes: {
      "/api/upload": ["./node_modules/pdfjs-dist/**/*"],
      "/api/proof/[assetVersionId]": ["./node_modules/pdfjs-dist/**/*"],
      "/api/whatsapp/webhook": ["./node_modules/pdfjs-dist/**/*"],
    },
  },
};

export default nextConfig;
