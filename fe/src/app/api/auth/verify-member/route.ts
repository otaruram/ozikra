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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const resp = await fetch(`${BACKEND_URL}/api/v1/auth/verify-member`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (error: any) {
    console.error("Error proxying verify-member request to backend:", error);
    return NextResponse.json(
      { error: "Gagal memverifikasi Nomor Anggota ke server OZIK-SENTINEL", details: error?.message },
      { status: 502 }
    );
  }
}
