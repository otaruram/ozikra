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

export async function GET() {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/v1/admin/pending-officers`, {
      cache: "no-store",
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (error: any) {
    console.error("Error proxying pending officers to backend:", error);
    return NextResponse.json([], { status: 200 });
  }
}
