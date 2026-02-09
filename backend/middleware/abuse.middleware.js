import crypto from "crypto";

const state = new Map();

function identityKey(req) {
  const uid = req.user?.id;
  const anon = req.anonId || req.headers["x-anon-id"];
  return uid || anon || req.ip || "unknown";
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
    const key = `${keyPrefix}:${identityKey(req)}`;
    const content = String(getPayload(req) ?? "");
    const fingerprint = crypto.createHash("sha256").update(content).digest("hex");

    const prev = state.get(key);
    if (prev) {
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
    });

    return next();
  };
}
