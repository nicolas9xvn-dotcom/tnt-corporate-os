import { GoogleGenAI } from "@google/genai";
import { withOverloadRetry } from "./actions/agent-runner";

const MODEL = "gemini-3.6-flash";

export type AssetCategory = "NAIL" | "PARTS_CHARM" | "SALON" | "PROCESS" | "PEOPLE" | "CUSTOMER" | "BRAND_MOOD";

export interface ClassificationResult {
  category: AssetCategory;
  subcategory: string;
  confidence: number; // 0-100
  primarySubject: string;
  secondarySubjects: string[];
  design: string | null;
  color: string | null;
  nailLength: string | null;
  nailShape: string | null;
  parts: string[];
  has3d: boolean;
  style: string | null;
  handPose: string | null;
  visualQualityScore: number | null;
  contentPotential: string[];
  reviewReason: string | null;
}

// Below this, an asset goes to 99 REVIEW instead of being auto-filed — the
// founder's own spec treats 60-84% and <60% the same operationally (both
// land in review), only the wording of the reason differs.
export const AUTO_FILE_CONFIDENCE_THRESHOLD = 85;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["NAIL", "PARTS_CHARM", "SALON", "PROCESS", "PEOPLE", "CUSTOMER", "BRAND_MOOD"] },
    subcategory: { type: "string" },
    confidence: { type: "number" },
    primary_subject: { type: "string" },
    secondary_subjects: { type: "array", items: { type: "string" } },
    design: { type: "string" },
    color: { type: "string" },
    nail_length: { type: "string" },
    nail_shape: { type: "string" },
    parts: { type: "array", items: { type: "string" } },
    has_3d: { type: "boolean" },
    style: { type: "string" },
    hand_pose: { type: "string" },
    visual_quality_score: { type: "number" },
    content_potential: { type: "array", items: { type: "string" } },
    review_reason: { type: "string" },
  },
  required: ["category", "subcategory", "confidence", "primary_subject"],
};

// Brand context + the "primary subject" disambiguation rule are the two
// things most likely to trip up a naive classifier (see the founder's own
// examples: a table full of parts with a finished set on the customer's
// hand is still NAIL, not PARTS_CHARM) — spelled out explicitly rather than
// left implicit.
const BASE_PROMPT = `Bạn là chuyên gia phân loại ảnh/video cho thương hiệu nail AME29 NAIL OSAKA.
Brand: LONG NAIL x PARTS x GIRLY x JEWEL x JAPANESE QUALITY. Nail luôn là chủ thể chính khi có mặt trong ảnh.

Xem kỹ TOÀN BỘ ảnh/video (với video, xem hết các đoạn, không chỉ khung hình đầu) rồi phân loại vào ĐÚNG 1 category:
- NAIL: bộ nail đã hoàn thiện (ảnh full bộ, 3/4, detail, pose, hoặc video khoe bộ nail hoàn chỉnh).
- PARTS_CHARM: parts/charm/ribbon/pearl/crystal/chain rời, khay parts, cận cảnh parts — KHÔNG có bộ nail hoàn chỉnh làm chủ thể chính.
- SALON: không gian tiệm, nội thất, bàn ghế, exterior, không khí tiệm.
- PROCESS: nhân viên đang thao tác làm nail (chuẩn bị, đắp bột, gắn parts, before/during/after).
- PEOPLE: chân dung/đội ngũ nhân viên, behind-the-scenes.
- CUSTOMER: khách hàng đang trải nghiệm dịch vụ, tay khách, phản ứng khách.
- BRAND_MOOD: hình ảnh thương hiệu/mood/lifestyle, không thuộc các nhóm trên.

QUAN TRỌNG khi có nhiều đối tượng trong 1 ảnh: xác định PRIMARY SUBJECT (chủ thể chính, mục đích chụp), không phải cứ thấy gì thì xếp vào đó. Ví dụ: bàn có nhiều parts nhưng tay khách đang đeo bộ nail hoàn chỉnh → PRIMARY = NAIL. Nhân viên đang gắn charm lên nail → PRIMARY = PROCESS, không phải PARTS_CHARM.

confidence: 0-100, phản ánh mức chắc chắn THẬT của bạn, không tự tin giả tạo. Nếu phân vân giữa 2 category, hạ confidence xuống dưới 85 và ghi rõ trong review_reason đang phân vân giữa gì với gì (VD: "Không chắc đây là PARTS hay PROCESS").

Chỉ trả lời đúng JSON theo schema — không thêm chữ nào khác ngoài JSON.`;

// `recentCorrections` (plain-language descriptions of past manager
// corrections, see classification_feedback table) get folded in as
// few-shot examples — this is the "AI học" loop from the founder's spec:
// not real fine-tuning, just recent mistakes fed back as context.
export async function classifyAsset(
  ai: GoogleGenAI,
  fileBuffer: Buffer,
  mimeType: string,
  recentCorrections: string[] = []
): Promise<ClassificationResult> {
  let prompt = BASE_PROMPT;
  if (recentCorrections.length > 0) {
    prompt += `\n\nMột số lần trước AI từng phân loại sai và đã được người quản lý sửa lại — tránh lặp lại lỗi tương tự:\n${recentCorrections.map((c) => `- ${c}`).join("\n")}`;
  }

  const response = await withOverloadRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ text: prompt }, { inlineData: { mimeType, data: fileBuffer.toString("base64") } }],
      config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    })
  );

  const raw = JSON.parse(response.text ?? "{}");

  return {
    category: raw.category,
    subcategory: raw.subcategory ?? "",
    confidence: Number(raw.confidence ?? 0),
    primarySubject: raw.primary_subject ?? "",
    secondarySubjects: raw.secondary_subjects ?? [],
    design: raw.design ?? null,
    color: raw.color ?? null,
    nailLength: raw.nail_length ?? null,
    nailShape: raw.nail_shape ?? null,
    parts: raw.parts ?? [],
    has3d: Boolean(raw.has_3d),
    style: raw.style ?? null,
    handPose: raw.hand_pose ?? null,
    visualQualityScore: raw.visual_quality_score != null ? Number(raw.visual_quality_score) : null,
    contentPotential: raw.content_potential ?? [],
    reviewReason: raw.review_reason ?? null,
  };
}

// A second, cheaper pass over a batch of already-classified NAIL assets
// (same upload window) — asks Gemini to say whether they look like the
// same physical nail set (mục G của bản thiết kế). Only ever a hint: the
// dashboard always lets a human confirm/split the grouping.
export async function groupIntoNailSet(
  ai: GoogleGenAI,
  candidates: { fileBuffer: Buffer; mimeType: string; label: string }[]
): Promise<{ sameSet: boolean; designSummary: string }> {
  const prompt = `Đây là ${candidates.length} ảnh/video được upload gần như cùng lúc, đều đã được xác định là bộ nail hoàn thiện (NAIL). Xem kỹ và cho biết chúng có phải CÙNG 1 bộ nail vật lý không (dựa trên màu sắc, hình dáng, độ dài, parts/charm giống nhau) — có thể là các góc chụp khác nhau (hero/detail/pose/3-4/video) của cùng 1 bộ. Trả JSON: {"same_set": true/false, "design_summary": "mô tả ngắn gọn thiết kế"}.`;

  const response = await withOverloadRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [
        { text: prompt },
        ...candidates.map((c) => ({ inlineData: { mimeType: c.mimeType, data: c.fileBuffer.toString("base64") } })),
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: { same_set: { type: "boolean" }, design_summary: { type: "string" } },
          required: ["same_set", "design_summary"],
        },
      },
    })
  );

  const raw = JSON.parse(response.text ?? "{}");
  return { sameSet: Boolean(raw.same_set), designSummary: raw.design_summary ?? "" };
}
