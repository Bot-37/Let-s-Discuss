import { Router } from "express";
import { getAdminOverview } from "../controllers/admin.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.get(
  "/overview",
  requireAuth,
  requireAdmin,
  createRateLimiter({ windowMs: 60_000, max: 60, keyPrefix: "admin-overview" }),
  getAdminOverview
);

export default router;
