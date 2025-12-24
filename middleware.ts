import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Check if password protection is enabled
  const password = process.env.APP_PASSWORD;
  
  // If no password is set, allow access (backward compatible)
  if (!password) {
    return NextResponse.next();
  }

  // Check for authentication cookie
  const isAuthenticated = request.cookies.get("inspiration_auth")?.value === "authenticated";

  // Allow access to login page and auth API routes only
  const isLoginPage = request.nextUrl.pathname === "/login";
  const isLoginApi = request.nextUrl.pathname === "/api/login";
  const isLogoutApi = request.nextUrl.pathname === "/api/logout";

  if (isLoginPage || isLoginApi || isLogoutApi) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/login (login endpoint)
     * - api/logout (logout endpoint)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api/login|api/logout|_next/static|_next/image|favicon.ico).*)",
  ],
};

