import { NextResponse, type NextRequest } from "next/server";

/** Fast redirect for signed-out visitors. Real session validation happens server-side in requireUser(). */
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("lawai_session");
  const { pathname } = req.nextUrl;
  if (!hasSession && !pathname.startsWith("/login") && !pathname.startsWith("/api/cron")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"] };
