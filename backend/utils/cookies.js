const SAME_SITE_VALUES = Object.freeze({
  strict: "Strict",
  lax: "Lax",
  none: "None",
});

export function parseCookies(cookieHeader = "") {
  const jar = Object.create(null);
  if (typeof cookieHeader !== "string" || cookieHeader.length === 0) {
    return jar;
  }

  for (const pair of cookieHeader.split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;

    const separator = trimmed.indexOf("=");
    const key = separator >= 0 ? trimmed.slice(0, separator).trim() : trimmed;
    if (!key) continue;

    const rawValue = separator >= 0 ? trimmed.slice(separator + 1) : "";
    let decoded = rawValue;
    try {
      decoded = decodeURIComponent(rawValue);
    } catch {
      decoded = rawValue;
    }
    jar[key] = decoded;
  }

  return jar;
}

export function serializeCookie(name, value, options = {}) {
  const {
    path = "/",
    domain,
    maxAge,
    expires,
    sameSite = "lax",
    httpOnly = false,
    secure = false,
    partitioned = false,
  } = options;

  const parts = [`${name}=${encodeURIComponent(String(value ?? ""))}`, `Path=${path}`];

  if (domain) {
    parts.push(`Domain=${domain}`);
  }
  if (typeof maxAge === "number" && Number.isFinite(maxAge) && maxAge >= 0) {
    parts.push(`Max-Age=${Math.floor(maxAge)}`);
  }
  if (expires instanceof Date && Number.isFinite(expires.getTime())) {
    parts.push(`Expires=${expires.toUTCString()}`);
  }

  const normalizedSameSite = String(sameSite).toLowerCase();
  if (SAME_SITE_VALUES[normalizedSameSite]) {
    parts.push(`SameSite=${SAME_SITE_VALUES[normalizedSameSite]}`);
  }

  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (partitioned) parts.push("Partitioned");

  return parts.join("; ");
}

export function appendSetCookie(res, cookieValue) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", [cookieValue]);
    return;
  }
  const list = Array.isArray(current) ? current : [String(current)];
  list.push(cookieValue);
  res.setHeader("Set-Cookie", list);
}

export function serializeClearCookie(name, options = {}) {
  return serializeCookie(name, "", {
    ...options,
    maxAge: 0,
    expires: new Date(0),
  });
}
