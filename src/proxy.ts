import { NextResponse, type NextRequest } from "next/server";

/** Fast redirect for signed-out visitors. Real session validation happens server-side in requireUser(). */
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("lawai_session");
  const { pathname } = req.nextUrl;
  // /invite is the public set-your-password page; /api/cron, /api/platform and /api/internal check their own bearer tokens.
  const isPublic = ["/login", "/invite/", "/api/cron", "/api/platform/", "/api/internal/"].some((p) => pathname.startsWith(p));
  if (!hasSession && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"] };
