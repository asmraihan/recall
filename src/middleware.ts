import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Routes under /dashboard that are accessible without signing in
const PUBLIC_PATHS = ["/dashboard/lessons"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export default withAuth(
  function middleware() {
    // Add custom middleware logic here if needed
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) =>
        isPublicPath(req.nextUrl.pathname) || !!token,
    },
    pages: {
      signIn: "/auth/signin",
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/words/:path*",
    "/profile/:path*",
    "/api/words/:path*",
    "/api/user/:path*",
  ],
}; 