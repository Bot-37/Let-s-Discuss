import { env } from "../config/env.js";
import { appendSetCookie, parseCookies, serializeCookie } from "../utils/cookies.js";
import { generateAnonId, signAnonId, verifySignedAnonId } from "../utils/anon.js";

function anonCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    secure: env.ANON_COOKIE_SECURE,
    sameSite: env.ANON_COOKIE_SAME_SITE,
    maxAge: env.ANON_COOKIE_MAX_AGE_SEC,
    partitioned: env.ANON_COOKIE_PARTITIONED,
  };
}

export function ensureAnonIdentity(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const cookieValue = cookies[env.ANON_COOKIE_NAME];
  const verifiedAnonId = verifySignedAnonId(cookieValue);
  const anonId = verifiedAnonId || generateAnonId();

  req.anonId = anonId;
  res.setHeader("X-Anon-Id", anonId);

  if (!verifiedAnonId) {
    appendSetCookie(
      res,
      serializeCookie(env.ANON_COOKIE_NAME, signAnonId(anonId), anonCookieOptions())
    );
  }

  next();
}
