// MỀU Studio — Canon v1.1 rules as code (source: docs/meu-studio/meu-canon-v1.1.md
// and the A/B rules in docs/meu-studio/thu-nghiem-skill-seedance.md). The
// prompt builder writes Dola/Seedance prompts the way the Canon says: one
// role per reference image with an explicit "ignore" clause, numbered shots
// instead of timestamps, a lock line repeated for every shot, no subtitles.

export const MEU_BUSINESS_UNIT_NAME = "MỀU Studio";

export const SIGNATURE_STATES: { value: string; label: string }[] = [
  { value: "icon", label: "1. Icon — Chảnh mà sang" },
  { value: "danh_da", label: "2. Đanh đá dễ thương" },
  { value: "fashionista", label: "3. Fashionista" },
  { value: "de_gian", label: "4. Dễ giận nhưng cute" },
  { value: "ngu", label: "5. Ngủ là chân ái" },
  { value: "an_ngon", label: "6. Ăn ngon là nhất" },
  { value: "nail_queen", label: "7. Nail Queen" },
];

export const EPISODE_STATUSES: { value: string; label: string }[] = [
  { value: "idea", label: "Ý tưởng" },
  { value: "script", label: "Kịch bản" },
  { value: "keyframe", label: "Ảnh khung đầu" },
  { value: "video", label: "Video" },
  { value: "edit", label: "Dựng" },
  { value: "posted", label: "Đã đăng" },
];

// Optional reference images an episode can add on top of the two that are
// always attached (Proportion Master + hair clip).
export const OPTIONAL_REFS: { value: string; label: string }[] = [
  { value: "nail_file", label: "Dũa móng (Bộ 7)" },
  { value: "paw", label: "Bàn chân Sakura (Bộ 4)" },
];

const REF_CLAUSES: Record<string, { label: string; clause: (tag: string) => string }> = {
  proportion: {
    label: "Proportion Master — dáng khoanh tay",
    clause: (tag) =>
      `${tag} controls MỀU's identity, slim long-legged proportions, calico pattern, black apron and tail ring only; ignore its pose and background.`,
  },
  hair_clip: {
    label: "Bộ 5 — chỉ cắt riêng kẹp tóc",
    clause: (tag) => `${tag} controls her hair clip only.`,
  },
  nail_file: {
    label: "Bộ 7 — chỉ cắt riêng cây dũa",
    clause: (tag) => `${tag} controls the nail file's shape and colors only; ignore any text on it.`,
  },
  paw: {
    label: "Bộ 4 — chỉ cắt riêng bàn chân",
    clause: (tag) =>
      `${tag} controls her paw pads only: four pink toe pads and a pink main pad with a white sakura mark.`,
  },
};

// Canon §8 — the 🔴 items decide pass/fail, the 🟡 item is informational.
export const QC_ITEMS: { key: string; label: string; blocking: boolean }[] = [
  { key: "one_tail", label: "Đúng 1 đuôi, vòng đuôi đúng chỗ", blocking: true },
  { key: "apron", label: "Có tạp dề AME29", blocking: true },
  { key: "hair_clip", label: "Kẹp tóc đúng tai, đúng dáng (Bộ 5)", blocking: true },
  { key: "cat_paws", label: "Bàn chân mèo — không ngón tay người", blocking: true },
  { key: "no_text", label: "Không có chữ rác hiện rõ", blocking: true },
  { key: "recognizable", label: "Nhìn là nhận ra MỀU", blocking: true },
  { key: "slim_body", label: "Thân mảnh, chân dài — không chibi", blocking: true },
  { key: "details", label: "Hoa văn, màu mắt, Sakura Paw (lệch nhẹ chấp nhận)", blocking: false },
];

export function qcPassed(checks: Record<string, boolean>): boolean {
  return QC_ITEMS.filter((item) => item.blocking).every((item) => checks[item.key] === true);
}

export interface PromptEpisode {
  setting: string | null;
  sound: string | null;
  refs: string[];
}

export interface PromptShot {
  framing: string | null;
  action: string;
}

// Reference order: always Proportion Master then hair clip, then the
// episode's optional refs in a fixed order so the numbering is stable.
export function referenceList(refs: string[]): { tag: string; key: string; label: string }[] {
  const keys = ["proportion", "hair_clip", ...OPTIONAL_REFS.map((r) => r.value).filter((v) => refs.includes(v))];
  return keys.map((key, i) => ({ tag: `[Ảnh ${i + 1}]`, key, label: REF_CLAUSES[key].label }));
}

function referenceClauses(refs: string[]): string {
  return referenceList(refs)
    .map((r) => REF_CLAUSES[r.key].clause(r.tag))
    .join(" ");
}

const LOCK_LINE =
  "MỀU with exactly one tail, pink MEU hair clip on her left ear, slim long legs, facing the camera; same light and setting in every shot.";

const CONSTRAINTS =
  "No dialogue, no subtitles, no text. Cat paws only, never human fingers. No humans or human hands.";

export function buildVideoPrompt(episode: PromptEpisode, shots: PromptShot[]): string {
  const setting = episode.setting?.trim() || "a pink seamless studio";
  const lines = [
    referenceClauses(episode.refs),
    "",
    `Vertical 9:16, about 10 seconds, premium 3D animated film, soft detailed fur. Setting: ${setting}.`,
    ...shots.map((shot, i) => {
      const framing = shot.framing?.trim();
      const prefix = i === 0 ? "" : "cut to ";
      return `Shot ${i + 1}: ${prefix}${framing ? `${framing}. ` : ""}${shot.action.trim()}`;
    }),
    `All shots: ${LOCK_LINE}`,
  ];
  if (episode.sound?.trim()) lines.push(`Sound: ${episode.sound.trim()}`);
  lines.push(CONSTRAINTS);
  return lines.join("\n");
}

// "Keyframe first" (the workflow from the Chinese AI short-drama tutorial):
// generate and approve a still of the opening moment, then animate it.
export function buildKeyframePrompt(episode: PromptEpisode, firstShot: PromptShot | undefined): string {
  const setting = episode.setting?.trim() || "a pink seamless studio";
  const moment = firstShot ? firstShot.action.trim() : "MỀU standing in her signature pose";
  const framing = firstShot?.framing?.trim() || "medium shot";
  return [
    referenceClauses(episode.refs),
    "",
    `Still image, vertical 9:16, premium 3D animated film still, soft detailed fur, ${framing}. Setting: ${setting}.`,
    `The opening moment of the scene: ${moment}`,
    LOCK_LINE.replace("; same light and setting in every shot.", "."),
    "No text, no humans or human hands. Cat paws only, never human fingers.",
  ].join("\n");
}
