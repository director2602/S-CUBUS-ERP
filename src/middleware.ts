export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    /*
     * Protect everything except: login page, NextAuth API routes,
     * Next static assets, and public branding files.
     */
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|branding).*)",
  ],
};
