import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, homeFor, verifySession } from "@/lib/session";

// Which role may open each area. Pages check again on the server.
const AREAS: Record<string, string> = { "/tenant": "TENANT", "/manager": "MANAGER", "/staff": "STAFF" };

export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = req.nextUrl;

  const area = Object.keys(AREAS).find((a) => pathname === a || pathname.startsWith(a + "/"));
  if (area) {
    if (!session) {
      const url = new URL("/login", req.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (session.role !== AREAS[area]) return NextResponse.redirect(new URL(homeFor(session.role), req.url));
  }

  if ((pathname === "/login" || pathname === "/register") && session) {
    return NextResponse.redirect(new URL(homeFor(session.role), req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/tenant/:path*", "/manager/:path*", "/staff/:path*", "/login", "/register"] };
