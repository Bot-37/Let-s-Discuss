import { Router } from "express";
import { createThread, getThreadById, getThreads } from "../controllers/threads.controller.js";
import { optionalAuth } from "../middleware/auth.middleware.js";
import { ensureAnonIdentity } from "../middleware/anon.middleware.js";
import { createSpamGuard } from "../middleware/abuse.middleware.js";
import { validate, validateUUIDParam } from "../middleware/validate.middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.get(
  "/",
  createRateLimiter({ windowMs: 60_000, max: 120, keyPrefix: "threads-list" }),
  getThreads
);

router.get(
  "/:threadId",
  createRateLimiter({ windowMs: 60_000, max: 120, keyPrefix: "thread-single" }),
  validateUUIDParam("threadId"),
  getThreadById
);

router.post(
  "/",
  optionalAuth,
  ensureAnonIdentity,
  createRateLimiter({ windowMs: 60_000, max: 20, keyPrefix: "threads-create" }),
  validate({
    title: {
      required: true,
      type: "string",
      trim: true,
      minLength: 3,
      maxLength: 200,
    },
    content: {
      required: false,
      type: "string",
      trim: true,
      maxLength: 5000,
    },
  }),
  createSpamGuard({
    keyPrefix: "threads",
    minIntervalMs: 4000,
    duplicateWindowMs: 120000,
    getPayload: (req) => `${req.body.title}\n${req.body.content ?? ""}`,
  }),
  createThread
);

export default router;
