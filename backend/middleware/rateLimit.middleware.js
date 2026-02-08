const buckets = new Map();
let gcCounter = 0;

function defaultKeyGenerator(req, keyPrefix) {
  return `${keyPrefix}:${req.ip}`;
}

function collectExpiredBuckets(now) {
  gcCounter += 1;
  if (gcCounter % 200 !== 0) return;
  for (const [key, value] of buckets.entries()) {
    if (now > value.resetAt) buckets.delete(key);
  }
}

export function createRateLimiter({
  windowMs = 60_000,
  max = 60,
  keyPrefix = "global",
  keyGenerator = defaultKeyGenerator,
} = {}) {
  return (req, res, next) => {
    const now = Date.now();
    collectExpiredBuckets(now);

    const key = keyGenerator(req, keyPrefix);
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(max - 1));
      return next();
    }

    if (bucket.count >= max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(retryAfter, 1)));
      return res.status(429).json({ message: "Too many requests" });
    }

    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(max - bucket.count));
    return next();
  };
}
