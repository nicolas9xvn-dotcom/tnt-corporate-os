import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createServiceClient } from "@/lib/supabase/service";
import {
  INBOX_FOLDER_NAME,
  REVIEW_FOLDER_NAME,
  CATEGORY_FOLDER_NAMES,
  ensureChildFolder,
  listInboxFiles,
  downloadFileBuffer,
  moveFile,
} from "@/lib/google-drive";
import { classifyAsset, groupIntoNailSet, AUTO_FILE_CONFIDENCE_THRESHOLD } from "@/lib/asset-classifier";

// Vercel Cron hits this on a schedule (see vercel.json) — the AME29 Content
// OS ingestion pipeline (Phase 1/MVP): watches "00 INBOX" in Google Drive,
// classifies each new photo/video with Gemini, auto-files it into the
// right category/month folder when confident, or parks it in "99 REVIEW"
// when not. Never touches/re-encodes the original bytes — only moves the
// file between Drive folders and writes metadata to Supabase.

function yyyymm(date: Date): string {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function yyyymmCompact(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function nextAssetCode(supabase: ReturnType<typeof createServiceClient>, businessUnitId: string, monthCompact: string) {
  const prefix = `AME29-${monthCompact}-`;
  const { count } = await supabase!
    .from("content_assets")
    .select("id", { count: "exact", head: true })
    .eq("business_unit_id", businessUnitId)
    .like("asset_code", `${prefix}%`);
  const seq = (count ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

async function nextNailSetCode(supabase: ReturnType<typeof createServiceClient>, businessUnitId: string, monthCompact: string) {
  const prefix = `AME29-NAIL-${monthCompact}-`;
  const { count } = await supabase!
    .from("nail_sets")
    .select("id", { count: "exact", head: true })
    .eq("business_unit_id", businessUnitId)
    .like("set_code", `${prefix}%`);
  const seq = (count ?? 0) + 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET chưa được cấu hình." }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role chưa được cấu hình." }, { status: 500 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY chưa được cấu hình." }, { status: 500 });
  }
  if (!process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json({ error: "GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY chưa được cấu hình." }, { status: 500 });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const { data: units } = await supabase
    .from("business_units")
    .select("id, name, google_drive_root_folder_id")
    .not("google_drive_root_folder_id", "is", null);

  const summary: { businessUnit: string; processed: number; filed: number; review: number; duplicates: number; errors: number; note?: string }[] =
    [];

  for (const unit of units ?? []) {
    // .trim() — a folder ID pasted into Supabase's Table Editor can pick up
    // a trailing newline/whitespace invisibly, which turns it into an ID
    // Drive doesn't recognize (surfaces as a bare "File not found: ." error
    // with no ID in the message, since the malformed string matches nothing).
    const rootId = (unit.google_drive_root_folder_id as string).trim();
    const result: { businessUnit: string; processed: number; filed: number; review: number; duplicates: number; errors: number; note?: string } = {
      businessUnit: unit.name,
      processed: 0,
      filed: 0,
      review: 0,
      duplicates: 0,
      errors: 0,
    };

    try {
      const [inboxId, reviewId] = await Promise.all([
        ensureChildFolder(rootId, INBOX_FOLDER_NAME),
        ensureChildFolder(rootId, REVIEW_FOLDER_NAME),
      ]);

      const { data: unitRow } = await supabase.from("business_units").select("google_drive_last_synced_at").eq("id", unit.id).maybeSingle();
      const sinceIso = unitRow?.google_drive_last_synced_at ?? undefined;
      const now = new Date();
      const files = await listInboxFiles(inboxId, sinceIso);

      // Advance the sync watermark right away (using the timestamp captured
      // BEFORE listing, so nothing uploaded during this run's processing is
      // ever skipped next time) instead of after the whole file loop. A
      // single file's full round-trip (download + Gemini classify + Drive
      // move) can run past Netlify's function time budget — if that happens
      // mid-loop, the old end-of-run update would never fire, and the next
      // run would treat every file in this batch as "new" again (harmless
      // re-processing on its own, since drive_md5 already caught duplicates,
      // but wasteful and it only gets worse as the inbox accumulates).
      await supabase.from("business_units").update({ google_drive_last_synced_at: now.toISOString() }).eq("id", unit.id);

      const { data: feedbackRows } = await supabase
        .from("classification_feedback")
        .select("ai_category, human_category")
        .order("corrected_at", { ascending: false })
        .limit(10);
      const recentCorrections = (feedbackRows ?? []).map(
        (f) => `AI từng đoán "${f.ai_category}" nhưng đúng ra là "${f.human_category}".`
      );

      const nailCandidates: { assetId: string; fileBuffer: Buffer; mimeType: string }[] = [];
      const monthLabel = yyyymm(now);
      const monthCompact = yyyymmCompact(now);

      for (const file of files) {
        result.processed += 1;
        try {
          if (file.md5Checksum) {
            const { data: existing } = await supabase
              .from("content_assets")
              .select("id")
              .eq("business_unit_id", unit.id)
              .eq("drive_md5", file.md5Checksum)
              .maybeSingle();
            if (existing) {
              await moveFile(file.id, inboxId, reviewId);
              await supabase.from("drive_sync_log").insert({
                business_unit_id: unit.id,
                drive_file_id: file.id,
                event: "duplicate_skipped",
                status: "ok",
                detail: `Trùng với asset đã có (${existing.id}).`,
              });
              result.duplicates += 1;
              continue;
            }
          }

          const fileType: "photo" | "video" | null = file.mimeType.startsWith("image/")
            ? "photo"
            : file.mimeType.startsWith("video/")
              ? "video"
              : null;
          if (!fileType) {
            await supabase.from("drive_sync_log").insert({
              business_unit_id: unit.id,
              drive_file_id: file.id,
              event: "error",
              status: "error",
              detail: `Loại file không hỗ trợ (${file.mimeType}).`,
            });
            result.errors += 1;
            continue;
          }

          const buffer = await downloadFileBuffer(file.id);
          const classification = await classifyAsset(ai, buffer, file.mimeType, recentCorrections);
          const assetCode = await nextAssetCode(supabase, unit.id, monthCompact);
          const autoFile = classification.confidence >= AUTO_FILE_CONFIDENCE_THRESHOLD;

          let targetFolderId: string;
          if (autoFile) {
            const categoryFolderName = CATEGORY_FOLDER_NAMES[classification.category];
            const categoryFolderId = await ensureChildFolder(rootId, categoryFolderName);
            targetFolderId =
              classification.category === "NAIL" ? await ensureChildFolder(categoryFolderId, monthLabel) : categoryFolderId;
          } else {
            targetFolderId = reviewId;
          }
          await moveFile(file.id, inboxId, targetFolderId);

          const { data: inserted } = await supabase
            .from("content_assets")
            .insert({
              business_unit_id: unit.id,
              asset_code: assetCode,
              drive_file_id: file.id,
              drive_md5: file.md5Checksum,
              file_type: fileType,
              original_filename: file.name,
              category: classification.category,
              subcategory: classification.subcategory,
              confidence: classification.confidence,
              review_reason: autoFile ? null : classification.reviewReason,
              primary_subject: classification.primarySubject,
              secondary_subjects: classification.secondarySubjects,
              design: classification.design,
              color: classification.color,
              nail_length: classification.nailLength,
              nail_shape: classification.nailShape,
              parts: classification.parts,
              has_3d: classification.has3d,
              style: classification.style,
              hand_pose: classification.handPose,
              visual_quality_score: classification.visualQualityScore,
              content_potential: classification.contentPotential,
              status: autoFile ? "UNUSED" : "REVIEW",
              classified_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          await supabase.from("drive_sync_log").insert({
            business_unit_id: unit.id,
            drive_file_id: file.id,
            event: autoFile ? "moved" : "review",
            status: "ok",
            detail: `${classification.category} (${classification.confidence}%)`,
          });

          if (autoFile) result.filed += 1;
          else result.review += 1;

          if (autoFile && classification.category === "NAIL" && inserted) {
            nailCandidates.push({ assetId: inserted.id, fileBuffer: buffer, mimeType: file.mimeType });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Lỗi không xác định.";
          await supabase.from("drive_sync_log").insert({
            business_unit_id: unit.id,
            drive_file_id: file.id,
            event: "error",
            status: "error",
            detail: message,
          });
          result.errors += 1;
        }
      }

      // NAIL SET grouping — only worth asking Gemini when there's more than
      // 1 candidate from this same run (nothing to compare a lone photo
      // against). A human can still split/regroup later from the
      // dashboard — this is a best-effort hint, not a final decision.
      if (nailCandidates.length > 1) {
        try {
          const grouping = await groupIntoNailSet(
            ai,
            nailCandidates.map((c) => ({ fileBuffer: c.fileBuffer, mimeType: c.mimeType, label: c.assetId }))
          );
          if (grouping.sameSet) {
            const setCode = await nextNailSetCode(supabase, unit.id, monthCompact);
            const { data: nailSet } = await supabase
              .from("nail_sets")
              .insert({ business_unit_id: unit.id, set_code: setCode, design_summary: grouping.designSummary })
              .select("id")
              .single();
            if (nailSet) {
              await supabase
                .from("content_assets")
                .update({ nail_set_id: nailSet.id })
                .in(
                  "id",
                  nailCandidates.map((c) => c.assetId)
                );
            }
          }
        } catch {
          // Grouping is a nice-to-have — never let it fail the whole run.
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Lỗi không xác định.";
      await supabase.from("drive_sync_log").insert({ business_unit_id: unit.id, event: "error", status: "error", detail: message });
      result.errors += 1;
      result.note = message;
    }

    summary.push(result);
  }

  return NextResponse.json({ ok: true, summary });
}
