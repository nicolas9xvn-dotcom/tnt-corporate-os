import { randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "social-media-temp";

// Instagram's and TikTok's publishing APIs can only fetch media from a
// publicly reachable URL, but content_assets originals live in Google
// Drive behind a private service account. This bridges the two: copy the
// bytes into a public Supabase Storage bucket just long enough for the
// platform's servers to fetch it, then delete it right after — never left
// around as a standing public copy of a customer's photo/video.
export async function uploadTempPublicFile(buffer: Buffer, contentType: string): Promise<{ path: string; url: string }> {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Supabase service role chưa được cấu hình.");

  const extension = contentType.startsWith("video/") ? "mp4" : "jpg";
  const path = `${randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Không tải được file tạm lên Supabase Storage: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function deleteTempPublicFile(path: string): Promise<void> {
  const supabase = createServiceClient();
  if (!supabase) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
