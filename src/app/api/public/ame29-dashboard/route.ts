import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildPublicDashboardPayload } from "@/lib/public-competitor-payload";

// Public, unauthenticated endpoint — deliberate. The founder decided the
// competitor/pricing dataset itself can be public (it powers the standalone
// japannailmap.netlify.app dashboard, which has no login), so this uses the
// service-role client to bypass RLS instead of loosening RLS to an anon
// policy — the underlying tables stay chairman/ceo-only for writes and for
// any authenticated read through the rest of the app. Anyone with this URL
// can read AME29's competitor data; nothing here can write.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role chưa được cấu hình." }, { status: 500 });
  }

  const { data: businessUnit, error: buError } = await supabase
    .from("business_units")
    .select("id")
    .eq("name", "AME29")
    .maybeSingle();
  if (buError || !businessUnit) {
    return NextResponse.json({ error: buError?.message ?? "Không tìm thấy business unit AME29." }, { status: 500 });
  }

  try {
    const payload = await buildPublicDashboardPayload(supabase, businessUnit.id);
    return NextResponse.json(payload, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
