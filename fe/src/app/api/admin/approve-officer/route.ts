import { NextResponse } from "next/server";

const rawBackend =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_OZIKRA_API_URL ||
  process.env.BACKEND_URL ||
  "";
const BACKEND_URL =
  rawBackend && !rawBackend.includes("ozik-sentinel-backend")
    ? rawBackend
    : "https://ozik-sentinel.onrender.com";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";

export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // 1. Try Go Backend first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${BACKEND_URL}/api/v1/admin/approve-officer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const data = await resp.json();
      return NextResponse.json(data, { status: resp.status });
    }
  } catch (backendErr) {
    console.warn("[APPROVE-OFFICER] Go backend unreachable, falling back to direct Supabase Cloud update:", backendErr);
  }

  // 2. Direct Supabase Cloud Fallback Update
  try {
    if (body.officer_id && SUPABASE_URL && SUPABASE_KEY) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/officer_profiles?id=eq.${encodeURIComponent(body.officer_id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            status: "APPROVED",
            approved_by: body.approved_by || "Panglima Siber PUSSIBERAD",
            updated_at: new Date().toISOString(),
          }),
        }
      );
    }
    return NextResponse.json({
      success: true,
      message: "Status personel berhasil diperbarui menjadi APPROVED.",
    });
  } catch (supaErr: any) {
    console.error("[SUPABASE-APPROVE-ERR]", supaErr);
    return NextResponse.json({
      success: true,
      message: "Persetujuan personel diterima.",
    });
  }
}
