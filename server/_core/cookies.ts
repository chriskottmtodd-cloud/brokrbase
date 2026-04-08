import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isLocalRequest(req: Request): boolean {
  const hostname = req.hostname;
  return LOCAL_HOSTS.has(hostname) || isIpAddress(hostname);
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");
  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const local = isLocalRequest(req);

  // On production (any non-localhost host), always treat as secure — the
  // published domain is always served over HTTPS even if the reverse proxy
  // forwards internally as HTTP. SameSite=Lax works for same-site OAuth
  // redirects (callback URL is on the same origin) and is accepted by Safari
  // ITP, unlike SameSite=None which Safari blocks in many contexts.
  const secure = local ? isSecureRequest(req) : true;

  // SameSite=Lax: sent on top-level navigations (OAuth redirect back to
  // /api/oauth/callback) and same-site requests. Correct for a single-domain
  // session cookie. SameSite=None requires Secure=true AND is blocked by
  // Safari ITP in PWA/home-screen mode.
  const sameSite: CookieOptions["sameSite"] = "lax";

  return {
    httpOnly: true,
    path: "/",
    sameSite,
    secure,
  };
}
