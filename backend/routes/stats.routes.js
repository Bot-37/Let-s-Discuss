import { Router } from "express";
import { getPublicStats } from "../controllers/stats.controller.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.get(
  "/",
  createRateLimiter({ windowMs: 60_000, max: 120, keyPrefix: "public-stats" }),
  getPublicStats
);

export default router;

