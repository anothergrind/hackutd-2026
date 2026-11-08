// Optional site-wide password (HTTP Basic Auth). Set SITE_PASSWORD before deploying: every page and API call then
// needs it, so strangers can't spend NVIDIA credits, rewrite agents or approve actions. Unset = open, as in local dev.
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/** Constant-time string compare, so response timing doesn't leak how much of the password matched. */
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function authorized(header: string | null, user: string, password: string) {
  const [scheme, encoded] = (header ?? "").split(" ");
  if (scheme !== "Basic" || !encoded) return false;

  const decoded = Buffer.from(encoded, "base64").toString();
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;

  const userOk = safeEqual(decoded.slice(0, sep), user);
  const passOk = safeEqual(decoded.slice(sep + 1), password);
  return userOk && passOk;
}

export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  if (authorized(request.headers.get("authorization"), process.env.SITE_USER ?? "opscrew", password)) {
    return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Canary", charset="UTF-8"' },
  });
}

export const config = {
  // Everything except static assets and the cron route, which checks its own CRON_SECRET bearer token.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/sweep/cron).*)"],
};
