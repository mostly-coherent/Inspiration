import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("inspiration_auth");

  return NextResponse.json({ success: true });
}

