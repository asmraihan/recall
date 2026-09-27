import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse, type NextFetchEvent } from "next/server";
import { isPublicLessonPath } from "@/lib/public-lessons";

// Routes under /dashboard that are accessible without signing in
const authenticatedMiddleware = withAuth(
  function middleware() {
    // Add custom middleware logic here if needed
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/auth/signin",
    },
  }
);

export default function middleware(req: NextRequestWithAuth, event: NextFetchEvent) {
  // Public notebooks do not need token decoding, a cookie, or an auth service.
  if (isPublicLessonPath(req.nextUrl.pathname)) return NextResponse.next();
  return authenticatedMiddleware(req, event);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/words/:path*",
    "/profile/:path*",
    // API routes are deliberately NOT matched: withAuth 302-redirects to an
    // HTML sign-in page, which is wrong for XHR (the browser then gets a 200
    // with an HTML body and blows up on .json()) and fatal for the mobile
    // client. Every handler under /api/** performs its own requireUser() check.
  ],
};
