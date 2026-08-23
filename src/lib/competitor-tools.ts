import competitorIntel from "./data/competitor-intel.json";

// Real competitor/pricing research the founder compiled by hand (Google
// Maps, Hotpepper, Instagram, TikTok, Minimo across 233 Japanese nail
// salons) — a point-in-time snapshot bundled into the app at build time,
// NOT a live feed like the Firebase schedule/revenue tools. Only used by
// agents flagged agents.can_read_competitors (see migration 0015).
export type CompetitorTopic =
  | "tong_quan"
  | "doi_thu_truc_tiep"
  | "bang_xep_hang_osaka"
  | "doi_thu_toan_quoc";

export const COMPETITOR_TOPICS: CompetitorTopic[] = [
  "tong_quan",
  "doi_thu_truc_tiep",
  "bang_xep_hang_osaka",
  "doi_thu_toan_quoc",
];

interface CompetitorIntel {
  tong_quan: unknown;
  doi_thu_truc_tiep: unknown;
  bang_xep_hang_osaka: unknown;
  doi_thu_toan_quoc: unknown;
}

const DATA = competitorIntel as CompetitorIntel;

export function getCompetitorData(topic: string): unknown {
  if (!(topic in DATA)) {
    throw new Error(
      `Chủ đề "${topic}" không hợp lệ — chỉ chấp nhận: ${COMPETITOR_TOPICS.join(", ")}.`
    );
  }
  return DATA[topic as CompetitorTopic];
}
