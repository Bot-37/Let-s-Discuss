import { Router } from "express";
import { createPost, getPosts } from "../controllers/posts.controller.js";
import { createSpamGuard } from "../middleware/abuse.middleware.js";
import { optionalAuth } from "../middleware/auth.middleware.js";
import { ensureAnonIdentity } from "../middleware/anon.middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";
import { validate, validateUUIDParam } from "../middleware/validate.middleware.js";

const router = Router();

router.get(
  "/thread/:threadId",
  createRateLimiter({ windowMs: 60_000, max: 180, keyPrefix: "posts-list" }),
  validateUUIDParam("threadId"),
  getPosts
);

router.post(
  "/thread/:threadId",
  optionalAuth,
  ensureAnonIdentity,
  createRateLimiter({
    windowMs: 60_000,
    max: 45,
    keyPrefix: "posts-create",
    keyGenerator: (req, keyPrefix) => `${keyPrefix}:${req.user?.id ?? req.anonId ?? req.ip}`,
  }),
  validateUUIDParam("threadId"),
  validate({
    content: {
      required: true,
      type: "string",
      trim: true,
      minLength: 1,
      maxLength: 5000,
    },
  }),
  createSpamGuard({
    keyPrefix: "posts",
    minIntervalMs: 3000,
    duplicateWindowMs: 120000,
    getPayload: (req) => req.body.content,
  }),
  createPost
);

export default router;
