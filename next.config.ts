import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // file-generator.ts reads the DejaVu Sans TTF files at runtime
  // (fs/path.join, not a static import) so agents can generate PDFs with
  // correct Vietnamese diacritics — Next.js's automatic output file tracing
  // only follows static imports, so without this the font files get
  // silently dropped from the deployed serverless bundle and PDF
  // generation would 500 in production despite working locally.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans*.ttf"],
  },
};

export default nextConfig;
