import crypto from "crypto";

const state = new Map();
let gcCounter = 0;

function identityKey(req) {
  const uid = req.user?.id;
  const anon = req.anonId;
  return uid || anon || req.ip || "unknown";
}

function collectExpired(now) {
  gcCounter += 1;
  if (gcCounter % 250 !== 0) return;
  for (const [key, value] of state.entries()) {
    if (now > value.expiresAt) {
      state.delete(key);
    }
  }
}

export function createSpamGuard({
  keyPrefix = "spam",
  minIntervalMs = 3000,
  duplicateWindowMs = 120000,
  getPayload = (req) => req.body?.content || "",
} = {}) {
  return (req, res, next) => {
    // Super user bypass for moderation/maintenance actions.
    if (req.user?.role === "admin") return next();

    const now = Date.now();
    collectExpired(now);
    const key = `${keyPrefix}:${identityKey(req)}`;
    const content = String(getPayload(req) ?? "");
    const fingerprint = crypto.createHash("sha256").update(content).digest("hex");
    const ttlMs = Math.max(duplicateWindowMs, minIntervalMs) * 2;

    const prev = state.get(key);
    if (prev && now <= prev.expiresAt) {
      const sinceLast = now - prev.lastAt;
      const sinceDuplicate = now - prev.lastDuplicateAt;

      if (sinceLast < minIntervalMs) {
        return res.status(429).json({ message: "Please slow down before posting again" });
      }

      if (fingerprint === prev.lastFingerprint && sinceDuplicate < duplicateWindowMs) {
        return res.status(429).json({ message: "Duplicate content detected, please vary your post" });
      }
    }

    state.set(key, {
      lastAt: now,
      lastFingerprint: fingerprint,
      lastDuplicateAt: now,
      expiresAt: now + ttlMs,
    });

    return next();
  };
}
