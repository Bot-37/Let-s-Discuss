import { Router } from "express";
import { getDashboardSummary } from "../controllers/dashboard.controller.js";
import { optionalAuth } from "../middleware/auth.middleware.js";
import { ensureAnonIdentity } from "../middleware/anon.middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.get(
  "/summary",
  optionalAuth,
  ensureAnonIdentity,
  createRateLimiter({
    windowMs: 60_000,
    max: 80,
    keyPrefix: "dashboard-summary",
    keyGenerator: (req, keyPrefix) => `${keyPrefix}:${req.user?.id ?? req.anonId ?? req.ip}`,
  }),
  getDashboardSummary
);

export default router;
