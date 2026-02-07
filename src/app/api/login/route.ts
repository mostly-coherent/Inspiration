import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    const expectedPassword = process.env.APP_PASSWORD;

    // If no password is configured, allow access (backward compatible)
    if (!expectedPassword) {
      return NextResponse.json(
        { success: true, message: "Password protection not configured" },
        { status: 200 }
      );
    }

    if (!password || password !== expectedPassword) {
      return NextResponse.json(
        { success: false, error: "Invalid password" },
        { status: 401 }
      );
    }

    // Set authentication cookie (2-day rolling session)
    const cookieStore = await cookies();
    cookieStore.set("inspiration_auth", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 2, // 2 days
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Login] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to authenticate" },
      { status: 500 }
    );
  }
}

