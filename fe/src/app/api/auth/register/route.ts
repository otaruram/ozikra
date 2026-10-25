import { NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_OZIKRA_API_URL ||
  process.env.BACKEND_URL ||
  "http://localhost:8080";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const resp = await fetch(`${BACKEND_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (error: any) {
    console.error("Error proxying register request to backend:", error);
    return NextResponse.json(
      { error: "Gagal terhubung ke OZIK Sentinel Backend", details: error?.message },
      { status: 502 }
    );
  }
}
