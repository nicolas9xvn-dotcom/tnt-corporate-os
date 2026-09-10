import sharp from "sharp";

// Common social-media output ratios, keyed by a Vietnamese/English phrase a
// founder might naturally type instead of the literal "W:H" — checked only
// after the explicit numeric pattern below finds nothing, so "cắt 9:16"
// still wins over any keyword coincidentally present in the same sentence.
const NAMED_RATIOS: Record<string, [number, number]> = {
  "vuông": [1, 1],
  "square": [1, 1],
  "dọc": [9, 16],
  "story": [9, 16],
  "reels": [9, 16],
  "tiktok": [9, 16],
  "ngang": [16, 9],
  "youtube": [16, 9],
  "cover": [16, 9],
};

export interface ParsedAspectRatio {
  w: number;
  h: number;
  label: string;
}

// Looks for an explicit "9:16" / "9x16" style ratio first, then falls back
// to a handful of named phrases — good enough for a founder describing what
// they want in plain language ("cắt theo tỉ lệ dọc cho tiktok") without
// needing agents to support real function-calling for this (see the
// image_generation early-return path in agent-runner.ts, which doesn't run
// the tool-calling loop at all).
export function parseAspectRatio(text: string): ParsedAspectRatio | null {
  const lower = text.toLowerCase();

  const explicit = lower.match(/(\d{1,2})\s*[:x]\s*(\d{1,2})/);
  if (explicit) {
    const w = Number(explicit[1]);
    const h = Number(explicit[2]);
    if (w > 0 && h > 0) return { w, h, label: `${w}:${h}` };
  }

  for (const [keyword, [w, h]] of Object.entries(NAMED_RATIOS)) {
    if (lower.includes(keyword)) return { w, h, label: `${w}:${h}` };
  }

  return null;
}

// Deterministic center-crop to an exact aspect ratio — no upscaling, no
// AI-guessed framing (sharp has no "smart crop"/subject-detection built in,
// so this is a plain geometric crop around the image's own center). Good
// enough as a first pass; if a founder needs the subject kept off-center,
// they still get the un-cropped image and can crop by hand.
export async function cropToAspectRatio(buffer: Buffer, ratio: ParsedAspectRatio): Promise<Buffer> {
  const image = sharp(buffer);
  const { width, height } = await image.metadata();
  if (!width || !height) return buffer;

  const targetRatio = ratio.w / ratio.h;
  const currentRatio = width / height;

  let cropWidth = width;
  let cropHeight = height;
  if (currentRatio > targetRatio) {
    cropWidth = Math.round(height * targetRatio);
  } else {
    cropHeight = Math.round(width / targetRatio);
  }

  const left = Math.max(0, Math.floor((width - cropWidth) / 2));
  const top = Math.max(0, Math.floor((height - cropHeight) / 2));

  const cropped = await image.extract({ left, top, width: cropWidth, height: cropHeight }).toBuffer();
  // sharp's Buffer is typed over a generic ArrayBufferLike — normalize back
  // to a plain Buffer so callers can freely mix it with Buffer.from(...)
  // results (e.g. the base64-decoded original) without a type mismatch.
  return Buffer.from(cropped);
}
