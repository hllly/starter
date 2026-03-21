import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET || "default-dev-secret-change-in-production"
);

const PUBLIC_PATHS = ["/", "/login", "/api/auth/login"];
const ADMIN_PATHS_PREFIX = "/api/admin/";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith(ADMIN_PATHS_PREFIX)) {
    const authHeader = req.headers.get("authorization");
    const key = authHeader?.replace("Bearer ", "");
    if (!key || key !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    const token = req.cookies.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    try {
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      return NextResponse.json({ error: "会话已过期" }, { status: 401 });
    }
  }

  if (pathname.startsWith("/onboarding") || pathname.startsWith("/discover") || pathname.startsWith("/leads") || pathname.startsWith("/customer-pool") || pathname.startsWith("/history")) {
    const token = req.cookies.get("session")?.value;
    if (!token) {
      const loginUrl = new URL("/login", req.url);
      return NextResponse.redirect(loginUrl);
    }
    try {
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      const loginUrl = new URL("/login", req.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
