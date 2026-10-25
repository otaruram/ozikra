import { NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_OZIKRA_API_URL ||
  process.env.BACKEND_URL ||
  "http://localhost:8080";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://teeqoxykamaesdmvlfnp.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_8uQdT6wC-9dWckd5v-QWcA_ArkAqYKA";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Email parameter is required" },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Try Go Backend first
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(
        `${BACKEND_URL}/api/v1/auth/officer?email=${encodeURIComponent(cleanEmail)}`,
        { cache: "no-store", signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        return NextResponse.json(data, { status: resp.status });
      }
    } catch (backendErr) {
      console.warn("[OFFICER-LOOKUP] Go backend unreachable, falling back to direct Supabase Cloud query:", backendErr);
    }

    // 2. Direct Supabase Cloud Query Fallback
    try {
      const supaRes = await fetch(
        `${SUPABASE_URL}/rest/v1/officer_profiles?email=eq.${encodeURIComponent(cleanEmail)}&select=*`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          cache: "no-store",
        }
      );

      if (supaRes.ok) {
        const rows = await supaRes.json();
        if (Array.isArray(rows) && rows.length > 0) {
          return NextResponse.json({
            exists: true,
            officer: rows[0],
            source: "supabase_direct",
          });
        }
        return NextResponse.json({
          exists: false,
          source: "supabase_direct",
        });
      }
    } catch (supaErr) {
      console.error("[SUPABASE-OFFICER-LOOKUP-ERR]", supaErr);
    }

    // 3. Fallback: Check if super admin email
    if (cleanEmail === "okitr52@gmail.com" || cleanEmail.includes("sentinel.tni-ad.mil.id")) {
      return NextResponse.json({
        exists: true,
        officer: {
          id: "usr-super-admin-okitr",
          name: "Jenderal TNI (Purn) Okitr / Panglima Siber",
          email: cleanEmail,
          role: "SUPER_ADMIN",
          status: "APPROVED",
        },
      });
    }

    return NextResponse.json({ exists: false });
  } catch (error: any) {
    console.error("Error in officer lookup:", error);
    return NextResponse.json(
      { error: "Gagal memeriksa data personel", details: error?.message },
      { status: 500 }
    );
  }
}
