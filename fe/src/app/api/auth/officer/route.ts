import { NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_OZIKRA_API_URL ||
  process.env.BACKEND_URL ||
  "http://localhost:8080";

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

    const resp = await fetch(
      `${BACKEND_URL}/api/v1/auth/officer?email=${encodeURIComponent(email)}`,
      { cache: "no-store" }
    );

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (error: any) {
    console.error("Error proxying officer lookup to backend:", error);
    return NextResponse.json(
      { error: "Gagal terhubung ke OZIK Sentinel Backend", details: error?.message },
      { status: 502 }
    );
  }
}
